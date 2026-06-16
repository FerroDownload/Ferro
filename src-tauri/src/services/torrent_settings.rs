use serde_json::Value as JsonValue;

use crate::engine::aria2_client::{build_options_map, Aria2Client};

pub fn format_selected_files(indices: &[u32]) -> String {
    if indices.is_empty() {
        return String::new();
    }
    let mut sorted = indices.to_vec();
    sorted.sort_unstable();
    sorted
        .into_iter()
        .map(|value| value.to_string())
        .collect::<Vec<String>>()
        .join(",")
}

pub fn build_torrent_options(
    destination: &str,
    selected_files: &str,
    seed_ratio_target: f64,
) -> Vec<(&'static str, JsonValue)> {
    let mut options = vec![
        ("dir", JsonValue::String(destination.to_string())),
        (
            "seed-ratio",
            JsonValue::String(seed_ratio_target.to_string()),
        ),
    ];

    if !selected_files.trim().is_empty() {
        options.push(("select-file", JsonValue::String(selected_files.to_string())));
    }

    options
}

pub fn build_seed_ratio_update(seed_ratio_target: f64) -> JsonValue {
    build_options_map(vec![(
        "seed-ratio",
        JsonValue::String(seed_ratio_target.to_string()),
    )])
}

pub async fn apply_seed_ratio_stop_policy(
    client: &Aria2Client,
    gid: &str,
    seed_ratio_target: f64,
) -> Result<(), String> {
    // Ref: https://aria2.github.io/manual/en/html/aria2c.html (seed-ratio)
    client
        .change_option(gid, build_seed_ratio_update(seed_ratio_target))
        .await
        .map_err(|error| error.to_command_payload())?;
    Ok(())
}
