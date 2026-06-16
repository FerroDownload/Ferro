use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::sync::{mpsc, Arc};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const AUTH_FILE: &[u8] = b"ferro authenticated ftp fixture\n";
const ANONYMOUS_FILE: &[u8] = b"ferro anonymous ftp fixture\n";

#[test]
fn aria2_downloads_authenticated_and_anonymous_ftp_urls() {
    let server = TestFtpServer::start();

    let auth_url = format!("ftp://user:pass@{}/auth.txt", server.addr());
    assert_aria2_downloads(&auth_url, "auth.txt", AUTH_FILE);

    let anonymous_url = format!("ftp://{}/anonymous.txt", server.addr());
    assert_aria2_downloads(&anonymous_url, "anonymous.txt", ANONYMOUS_FILE);
}

#[test]
fn dialog_plugin_registration_is_pinned() {
    let lib_rs = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"));
    let cargo_toml = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml"));

    assert!(
        lib_rs.contains(".plugin(tauri_plugin_dialog::init())"),
        "tauri-plugin-dialog must be registered in the Tauri builder"
    );
    assert!(
        cargo_toml.contains("tauri-plugin-dialog = \"2.6.0\""),
        "tauri-plugin-dialog must stay pinned to v2.6.0"
    );
}

#[test]
fn aria2_lookup_uses_bundled_resource_without_system_path_fallback() {
    let lib_rs = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"));

    assert!(
        lib_rs.contains(".resolve(binary_name, BaseDirectory::Resource)"),
        "runtime must resolve aria2c from Tauri's bundled resources"
    );
    assert!(
        !lib_rs.contains("PathBuf::from(binary_name)"),
        "runtime must not fall back to a developer machine aria2c installation"
    );
}

fn assert_aria2_downloads(url: &str, file_name: &str, expected: &[u8]) {
    let aria2c = aria2c_path();
    let temp_dir = tempfile::tempdir().expect("create download tempdir");
    let log_path = temp_dir.path().join("aria2.log");
    let output = Command::new(&aria2c)
        .args([
            "--no-conf=true",
            "--dir",
            temp_dir.path().to_str().expect("utf-8 temp dir"),
            "--out",
            file_name,
            "--allow-overwrite=true",
            "--auto-file-renaming=false",
            "--file-allocation=none",
            "--summary-interval=0",
            "--console-log-level=warn",
            "--download-result=hide",
            "--ftp-pasv=true",
            "--ftp-reuse-connection=false",
            "--max-connection-per-server=1",
            "--split=1",
            "--connect-timeout=5",
            "--timeout=5",
            "--max-tries=1",
            "--no-proxy=localhost,127.0.0.1",
            "--log",
            log_path.to_str().expect("utf-8 log path"),
            "--log-level=debug",
            url,
        ])
        .output()
        .unwrap_or_else(|error| panic!("failed to start {:?}: {error}", aria2c));

    assert!(
        output.status.success(),
        "aria2c failed for {url}\nstdout:\n{}\nstderr:\n{}\nlog:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
        std::fs::read_to_string(&log_path).unwrap_or_else(|_| "<no aria2 log>".to_string())
    );

    let downloaded =
        std::fs::read(temp_dir.path().join(file_name)).expect("read downloaded fixture file");
    assert_eq!(downloaded, expected);
}

fn aria2c_path() -> PathBuf {
    let binary_name = if cfg!(windows) { "aria2c.exe" } else { "aria2c" };
    let resource_binary = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(binary_name);

    if resource_binary.exists() {
        return resource_binary;
    }

    panic!(
        "bundled {binary_name} was not found in src-tauri/resources. Run `pnpm setup:aria2` before running FTP integration tests."
    );
}

struct TestFtpServer {
    addr: String,
    shutdown_tx: mpsc::Sender<()>,
    join_handle: Option<JoinHandle<()>>,
}

impl TestFtpServer {
    fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind FTP listener");
        listener
            .set_nonblocking(true)
            .expect("set FTP listener nonblocking");
        let addr = listener.local_addr().expect("read FTP listener addr");
        let (shutdown_tx, shutdown_rx) = mpsc::channel();
        let files = Arc::new(HashMap::from([
            ("/auth.txt".to_string(), AUTH_FILE.to_vec()),
            ("/anonymous.txt".to_string(), ANONYMOUS_FILE.to_vec()),
        ]));

        let join_handle = thread::spawn(move || loop {
            if shutdown_rx.try_recv().is_ok() {
                break;
            }

            match listener.accept() {
                Ok((stream, _)) => {
                    let files = Arc::clone(&files);
                    thread::spawn(move || handle_ftp_client(stream, files));
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10));
                }
                Err(error) => panic!("FTP listener failed: {error}"),
            }
        });

        Self {
            addr: addr.to_string(),
            shutdown_tx,
            join_handle: Some(join_handle),
        }
    }

    fn addr(&self) -> &str {
        &self.addr
    }
}

impl Drop for TestFtpServer {
    fn drop(&mut self) {
        let _ = self.shutdown_tx.send(());
        let _ = TcpStream::connect(&self.addr);
        if let Some(join_handle) = self.join_handle.take() {
            let _ = join_handle.join();
        }
    }
}

fn handle_ftp_client(mut control: TcpStream, files: Arc<HashMap<String, Vec<u8>>>) {
    let _ = control.set_nonblocking(false);
    let _ = control.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = control.set_write_timeout(Some(Duration::from_secs(10)));
    let mut reader = BufReader::new(control.try_clone().expect("clone FTP control stream"));
    let mut authenticated = false;
    let mut pending_user: Option<String> = None;
    let mut data_listener: Option<TcpListener> = None;

    send_line(&mut control, "220 Ferro test FTP ready");

    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {}
            Err(_) => break,
        }

        let line = line.trim_end_matches(['\r', '\n']);
        let (command, argument) = parse_command(line);

        match command.as_str() {
            "USER" => {
                if argument.eq_ignore_ascii_case("anonymous") {
                    authenticated = true;
                    send_line(&mut control, "230 Anonymous login ok");
                } else if argument == "user" {
                    pending_user = Some(argument.to_string());
                    send_line(&mut control, "331 Password required");
                } else {
                    send_line(&mut control, "530 Unknown user");
                }
            }
            "PASS" => {
                if authenticated {
                    send_line(&mut control, "230 Login ok");
                } else if pending_user.as_deref() == Some("user") && argument == "pass" {
                    authenticated = true;
                    send_line(&mut control, "230 Login ok");
                } else {
                    send_line(&mut control, "530 Login incorrect");
                }
            }
            "QUIT" => {
                send_line(&mut control, "221 Goodbye");
                break;
            }
            "FEAT" => {
                send_multiline(
                    &mut control,
                    &[
                        "211-Features",
                        " EPSV",
                        " PASV",
                        " SIZE",
                        " MDTM",
                        "211 End",
                    ],
                );
            }
            "SYST" => send_line(&mut control, "215 UNIX Type: L8"),
            _ if !authenticated => send_line(&mut control, "530 Login with USER and PASS"),
            "PWD" => send_line(&mut control, "257 \"/\" is current directory"),
            "CWD" => send_line(&mut control, "250 Directory changed"),
            "TYPE" => send_line(&mut control, "200 Type set"),
            "OPTS" => send_line(&mut control, "200 OPTS accepted"),
            "NOOP" => send_line(&mut control, "200 NOOP ok"),
            "REST" => send_line(&mut control, "350 Restarting at requested offset"),
            "SIZE" => {
                let path = ftp_path(argument);
                if let Some(bytes) = files.get(&path) {
                    send_line(&mut control, &format!("213 {}", bytes.len()));
                } else {
                    send_line(&mut control, "550 File not found");
                }
            }
            "MDTM" => {
                let path = ftp_path(argument);
                if files.contains_key(&path) {
                    send_line(&mut control, "213 20260502000000");
                } else {
                    send_line(&mut control, "550 File not found");
                }
            }
            "EPSV" => match open_data_listener() {
                Ok(listener) => {
                    let port = listener.local_addr().expect("read EPSV addr").port();
                    data_listener = Some(listener);
                    send_line(
                        &mut control,
                        &format!("229 Entering Extended Passive Mode (|||{port}|)"),
                    );
                }
                Err(_) => send_line(&mut control, "425 Cannot open data connection"),
            },
            "PASV" => match open_data_listener() {
                Ok(listener) => {
                    let port = listener.local_addr().expect("read PASV addr").port();
                    data_listener = Some(listener);
                    send_line(
                        &mut control,
                        &format!(
                            "227 Entering Passive Mode (127,0,0,1,{},{})",
                            port / 256,
                            port % 256
                        ),
                    );
                }
                Err(_) => send_line(&mut control, "425 Cannot open data connection"),
            },
            "RETR" => {
                let path = ftp_path(argument);
                let Some(bytes) = files.get(&path) else {
                    send_line(&mut control, "550 File not found");
                    continue;
                };

                let Some(listener) = data_listener.take() else {
                    send_line(&mut control, "425 Use PASV or EPSV first");
                    continue;
                };

                send_line(&mut control, "150 Opening binary mode data connection");
                match accept_data_connection(&listener) {
                    Ok(mut data) => {
                        let _ = data.set_nonblocking(false);
                        let _ = data.write_all(bytes);
                        let _ = data.flush();
                        send_line(&mut control, "226 Transfer complete");
                    }
                    Err(_) => send_line(&mut control, "425 Data connection failed"),
                }
            }
            _ => send_line(&mut control, "502 Command not implemented"),
        }
    }
}

fn parse_command(line: &str) -> (String, &str) {
    let mut parts = line.splitn(2, ' ');
    let command = parts.next().unwrap_or_default().to_ascii_uppercase();
    let argument = parts.next().unwrap_or_default().trim();
    (command, argument)
}

fn ftp_path(argument: &str) -> String {
    let path = argument.split_whitespace().next().unwrap_or(argument);
    if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    }
}

fn open_data_listener() -> std::io::Result<TcpListener> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    listener.set_nonblocking(true)?;
    Ok(listener)
}

fn accept_data_connection(listener: &TcpListener) -> std::io::Result<TcpStream> {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match listener.accept() {
            Ok((stream, _)) => return Ok(stream),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::TimedOut,
                        "timed out waiting for FTP data connection",
                    ));
                }
                thread::sleep(Duration::from_millis(10));
            }
            Err(error) => return Err(error),
        }
    }
}

fn send_line(stream: &mut TcpStream, line: &str) {
    let _ = stream.write_all(line.as_bytes());
    let _ = stream.write_all(b"\r\n");
    let _ = stream.flush();
}

fn send_multiline(stream: &mut TcpStream, lines: &[&str]) {
    for line in lines {
        send_line(stream, line);
    }
}
