use std::fs;
use std::path::Path;

use serde_json::Value;

fn manifest_dir() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn tauri_config_registers_magnet_desktop_scheme() {
    let config_path = manifest_dir().join("tauri.conf.json");
    let config: Value = serde_json::from_str(
        &fs::read_to_string(&config_path)
            .unwrap_or_else(|error| panic!("read {}: {error}", config_path.display())),
    )
    .unwrap_or_else(|error| panic!("parse {}: {error}", config_path.display()));

    let schemes = config
        .pointer("/plugins/deep-link/desktop/schemes")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("missing plugins.deep-link.desktop.schemes"));

    assert!(
        schemes.iter().any(|scheme| scheme == "magnet"),
        "magnet scheme must be configured for desktop deep links"
    );
}

#[test]
fn single_instance_is_configured_for_deep_link_forwarding_before_deep_link_plugin() {
    let cargo_toml_path = manifest_dir().join("Cargo.toml");
    let cargo_toml = fs::read_to_string(&cargo_toml_path)
        .unwrap_or_else(|error| panic!("read {}: {error}", cargo_toml_path.display()));

    assert!(
        cargo_toml.contains("tauri-plugin-single-instance = { version = \"2\", features = [\"deep-link\"] }"),
        "single-instance must enable the deep-link feature so Windows/Linux deep links forward to the running app"
    );

    let lib_path = manifest_dir().join("src").join("lib.rs");
    let lib_rs = fs::read_to_string(&lib_path)
        .unwrap_or_else(|error| panic!("read {}: {error}", lib_path.display()));

    let single_instance_index = lib_rs
        .find("tauri_plugin_single_instance::init")
        .unwrap_or_else(|| panic!("single-instance plugin is not initialized"));
    let deep_link_index = lib_rs
        .find("tauri_plugin_deep_link::init")
        .unwrap_or_else(|| panic!("deep-link plugin is not initialized"));

    assert!(
        single_instance_index < deep_link_index,
        "single-instance plugin must be registered before deep-link plugin"
    );
    assert!(
        lib_rs.contains("register_all"),
        "Windows/Linux deep-link setup must call register_all for first-launch portable registration"
    );
    assert!(
        lib_rs.contains("cfg(any(windows, target_os = \"linux\"))"),
        "runtime register_all should be scoped to Windows/Linux; installed macOS bundles use the configured scheme"
    );
}
