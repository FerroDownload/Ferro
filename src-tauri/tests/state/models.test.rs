use ferro_lib::state::models::{
    Engine,
    EngineProcessState,
    FileAllocationMethod,
    FileCollisionBehavior,
    Settings,
    Task,
    TaskStatus,
    ThemePreference,
};

#[test]
fn task_status_serializes_as_snake_case() {
    let status_json = serde_json::to_string(&TaskStatus::Active).expect("serialize status");
    assert_eq!(status_json, "\"active\"");
}

#[test]
fn task_round_trip_serialization() {
    let task = Task {
        id: "task-1".to_string(),
        aria2_gid: None,
        source_uri: "https://example.com/file.iso".to_string(),
        display_name: "file.iso".to_string(),
        destination_path: "C:/Users/Test/Downloads/file.iso".to_string(),
        status: TaskStatus::Waiting,
        progress_percent: 0.0,
        downloaded_bytes: 0,
        total_bytes: 1024,
        download_speed_bps: 0,
        upload_speed_bps: 0,
        created_at: "2026-02-04T00:00:00Z".to_string(),
        updated_at: "2026-02-04T00:00:00Z".to_string(),
        completed_at: None,
        uploaded_bytes: 0,
        orphan_imported: false,
        error_message: None,
        is_torrent: false,
        torrent_info_hash: None,
        selected_files: None,
    };

    let serialized = serde_json::to_string(&task).expect("serialize task");
    let deserialized: Task = serde_json::from_str(&serialized).expect("deserialize task");

    assert_eq!(deserialized, task);
}

#[test]
fn settings_round_trip_serialization() {
    let settings = Settings {
        download_directory: "C:/Users/Test/Downloads".to_string(),
        max_concurrent_downloads: 5,
        max_connections_per_task: 16,
        global_download_limit_bps: None,
        global_upload_limit_bps: Some(1_000_000),
        auto_update_trackers: true,
        dht_enabled: false,
        pex_enabled: false,
        close_to_tray: true,
        auto_start_on_boot: true,
        auto_start_paused_at_startup: false,
        duplicate_url_warning: true,
        file_collision_behavior: FileCollisionBehavior::Rename,
        theme_preference: ThemePreference::System,
        seed_ratio_target: 1.0,
        file_allocation_method: FileAllocationMethod::Falloc,
        max_tries: 5,
        retry_wait_seconds: 0,
        notifications_enabled: true,
    };

    let serialized = serde_json::to_string(&settings).expect("serialize settings");
    let deserialized: Settings = serde_json::from_str(&serialized).expect("deserialize settings");

    assert_eq!(deserialized, settings);
}

#[test]
fn engine_round_trip_serialization() {
    let engine = Engine {
        process_state: EngineProcessState::Running,
        restart_attempts_in_current_burst: 0,
        last_error_message: None,
        rpc_host: "127.0.0.1".to_string(),
        rpc_port: 16800,
        config_path: "C:/Ferro/aria2.conf".to_string(),
        session_path: "C:/Ferro/aria2.session".to_string(),
        session_save_interval_seconds: 60,
        file_allocation: "falloc".to_string(),
    };

    let serialized = serde_json::to_string(&engine).expect("serialize engine");
    let deserialized: Engine = serde_json::from_str(&serialized).expect("deserialize engine");

    assert_eq!(deserialized, engine);
}
