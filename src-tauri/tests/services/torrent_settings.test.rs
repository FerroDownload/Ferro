use ferro_lib::engine::aria2_client::build_options_map;
use ferro_lib::services::torrent_settings::{
    build_seed_ratio_update, build_torrent_options, format_selected_files,
};
use serde_json::json;

#[test]
fn format_selected_files_sorts_indices() {
    let formatted = format_selected_files(&[3, 1, 2]);
    assert_eq!(formatted, "1,2,3");
}

#[test]
fn build_torrent_options_includes_selection() {
    let options = build_options_map(build_torrent_options(
        "C:/Users/Test/Downloads",
        "1,2",
        1.5,
    ));

    assert_eq!(options["dir"], json!("C:/Users/Test/Downloads"));
    assert_eq!(options["select-file"], json!("1,2"));
    assert_eq!(options["seed-ratio"], json!("1.5"));
}

#[test]
fn build_seed_ratio_update_sets_ratio() {
    let options = build_seed_ratio_update(2.0);
    assert_eq!(options, json!({ "seed-ratio": "2" }));
}
