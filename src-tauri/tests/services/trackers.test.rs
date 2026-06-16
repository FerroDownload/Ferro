use ferro_lib::services::trackers::build_tracker_update;
use serde_json::json;

#[test]
fn build_tracker_update_sets_list() {
    let trackers = vec!["udp://tracker-a".to_string(), "udp://tracker-b".to_string()];
    let update = build_tracker_update(&trackers);

    assert_eq!(
        update,
        json!({ "bt-tracker": "udp://tracker-a,udp://tracker-b" })
    );
}
