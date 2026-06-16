use ferro_lib::engine::aria2_client::{build_request, parse_response, Aria2Client, Aria2Error};
use serde_json::json;
use std::io::Read;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

#[test]
fn build_request_injects_secret_token() {
    let request = build_request(
        "aria2.addUri",
        vec![json!(["https://example.org/file"])],
        Some("secret"),
        42,
    );

    assert_eq!(request.jsonrpc, "2.0");
    assert_eq!(request.id, 42);
    assert_eq!(request.method, "aria2.addUri");
    assert_eq!(
        request.params,
        vec![json!("token:secret"), json!(["https://example.org/file"])],
    );
}

#[test]
fn parse_response_reads_result() {
    let payload = r#"{"jsonrpc":"2.0","id":1,"result":"abcd"}"#;

    let result: String = parse_response(payload).expect("parse response");

    assert_eq!(result, "abcd");
}

#[test]
fn parse_response_reports_rpc_error() {
    let payload = r#"{"jsonrpc":"2.0","id":1,"error":{"code":1,"message":"bad"}}"#;

    let error = parse_response::<String>(payload).expect_err("rpc error");

    match error {
        Aria2Error::Rpc { code, message } => {
            assert_eq!(code, 1);
            assert_eq!(message, "bad");
        }
        _ => panic!("unexpected error"),
    }
}

#[test]
fn parse_response_requires_result() {
    let payload = r#"{"jsonrpc":"2.0","id":1}"#;

    let error = parse_response::<String>(payload).expect_err("missing result");

    assert!(matches!(error, Aria2Error::MissingResult));
}

#[tokio::test]
async fn rpc_call_times_out_when_endpoint_never_responds() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind hanging rpc server");
    let port = listener.local_addr().expect("server addr").port();
    let join_handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept rpc request");
        let mut buffer = [0_u8; 1024];
        let _ = stream.read(&mut buffer);
        thread::sleep(Duration::from_secs(10));
    });
    let client = Aria2Client::new("127.0.0.1", port, None);

    let result = tokio::time::timeout(Duration::from_secs(4), client.get_version()).await;

    assert!(result.is_ok(), "RPC client should return before the test timeout");
    assert!(result.expect("timeout result").is_err());
    let _ = join_handle.join();
}

#[tokio::test]
async fn add_uri_returns_gid_for_local_http_file() {
    let fixture = TestHttpServer::start(b"ferro rpc fixture\n".to_vec());
    let temp_dir = tempfile::tempdir().expect("download temp dir");
    let rpc_port = reserve_port();
    let mut aria2 = start_aria2_rpc(temp_dir.path(), rpc_port);
    let client = Aria2Client::new("127.0.0.1", rpc_port, Some("secret".to_string()));
    wait_for_rpc(&client).await;

    let result = tokio::time::timeout(
        Duration::from_secs(5),
        client.call::<String>(
            "aria2.addUri",
            vec![
                json!([fixture.url()]),
                json!({
                    "dir": temp_dir.path().to_string_lossy(),
                    "out": "fixture.bin",
                    "no-proxy": "localhost,127.0.0.1",
                }),
            ],
        ),
    )
    .await;

    let gid = result
        .expect("addUri should return before timeout")
        .expect("addUri result");
    assert!(!gid.trim().is_empty());

    let downloaded = temp_dir.path().join("fixture.bin");
    wait_for_file(&downloaded, b"ferro rpc fixture\n");

    let _ = aria2.kill();
    let _ = aria2.wait();
}

fn start_aria2_rpc(download_dir: &Path, rpc_port: u16) -> Child {
    Command::new(aria2c_path())
        .args([
            "--no-conf=true",
            "--enable-rpc=true",
            "--rpc-listen-all=false",
            &format!("--rpc-listen-port={rpc_port}"),
            "--rpc-secret=secret",
            "--summary-interval=0",
            "--console-log-level=warn",
            "--file-allocation=falloc",
            "--max-connection-per-server=1",
            "--split=1",
            "--connect-timeout=5",
            "--timeout=5",
            "--max-tries=1",
            "--no-proxy=localhost,127.0.0.1",
            "--dir",
            download_dir.to_str().expect("utf-8 temp dir"),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("start aria2 rpc")
}

async fn wait_for_rpc(client: &Aria2Client) {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if client.get_version().await.is_ok() {
            return;
        }
        assert!(Instant::now() < deadline, "aria2 rpc did not become healthy");
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

fn wait_for_file(path: &Path, expected: &[u8]) {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if std::fs::read(path).ok().as_deref() == Some(expected) {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "downloaded file did not reach expected contents"
        );
        thread::sleep(Duration::from_millis(100));
    }
}

fn reserve_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("reserve rpc port");
    listener.local_addr().expect("reserved addr").port()
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
        "bundled {binary_name} was not found in src-tauri/resources. Run `pnpm setup:aria2` first."
    );
}

struct TestHttpServer {
    addr: String,
    shutdown_tx: mpsc::Sender<()>,
    join_handle: Option<thread::JoinHandle<()>>,
}

impl TestHttpServer {
    fn start(bytes: Vec<u8>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind HTTP fixture");
        listener
            .set_nonblocking(true)
            .expect("set HTTP fixture nonblocking");
        let addr = listener.local_addr().expect("fixture addr");
        let (shutdown_tx, shutdown_rx) = mpsc::channel();
        let join_handle = thread::spawn(move || loop {
            if shutdown_rx.try_recv().is_ok() {
                break;
            }

            match listener.accept() {
                Ok((stream, _)) => handle_http_fixture(stream, &bytes),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10));
                }
                Err(error) => panic!("HTTP fixture failed: {error}"),
            }
        });

        Self {
            addr: addr.to_string(),
            shutdown_tx,
            join_handle: Some(join_handle),
        }
    }

    fn url(&self) -> String {
        format!("http://{}/fixture.bin", self.addr)
    }
}

impl Drop for TestHttpServer {
    fn drop(&mut self) {
        let _ = self.shutdown_tx.send(());
        let _ = TcpStream::connect(&self.addr);
        if let Some(join_handle) = self.join_handle.take() {
            let _ = join_handle.join();
        }
    }
}

fn handle_http_fixture(mut stream: TcpStream, bytes: &[u8]) {
    let cloned = stream.try_clone().expect("clone HTTP stream");
    let mut reader = BufReader::new(cloned);
    let mut line = String::new();
    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if line == "\r\n" {
            break;
        }
        line.clear();
    }

    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n",
        bytes.len()
    );
    stream.write_all(header.as_bytes()).expect("write header");
    stream.write_all(bytes).expect("write body");
    stream.flush().expect("flush response");
}
