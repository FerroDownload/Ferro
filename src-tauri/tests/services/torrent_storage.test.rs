use ferro_lib::services::torrent_storage::{load_metadata_from_dir, save_metadata_to_dir};
use ferro_lib::state::models::{TorrentFile, TorrentMetadata};

fn sample_metadata() -> TorrentMetadata {
    TorrentMetadata {
        info_hash: "abcd".to_string(),
        name: "Example".to_string(),
        total_bytes: 2048,
        files: vec![TorrentFile {
            index: 1,
            path: "Example/file.bin".to_string(),
            bytes: 2048,
            completed_bytes: 0,
            selected: true,
        }],
        trackers: vec!["udp://tracker".to_string()],
        peers: 2,
        seeders: 1,
    }
}

#[test]
fn saves_and_loads_metadata() {
    let dir = tempfile::tempdir().expect("temp dir");

    let metadata = sample_metadata();
    let saved_path = save_metadata_to_dir(dir.path(), &metadata).expect("save metadata");
    assert!(saved_path.exists());

    let loaded = load_metadata_from_dir(dir.path(), &metadata.info_hash).expect("load metadata");
    assert_eq!(loaded, metadata);
}
