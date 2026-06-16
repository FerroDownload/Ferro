use std::future::Future;
use std::pin::Pin;

use serde_json::Value as JsonValue;

use crate::engine::aria2_client::{build_options_map, Aria2Client};
use crate::state::models::Settings;

pub trait GlobalOptionClient {
    fn change_global_option<'a>(
        &'a self,
        options: JsonValue,
    ) -> Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'a>>;
}

impl GlobalOptionClient for Aria2Client {
    fn change_global_option<'a>(
        &'a self,
        options: JsonValue,
    ) -> Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'a>> {
        Box::pin(async move {
            Aria2Client::change_global_option(self, options)
                .await
                .map_err(|error| error.to_command_payload())
        })
    }
}

pub fn build_bittorrent_global_options(settings: &Settings) -> JsonValue {
    build_options_map(vec![
        (
            "enable-dht",
            JsonValue::String(settings.dht_enabled.to_string()),
        ),
        (
            "enable-dht6",
            JsonValue::String(settings.dht_enabled.to_string()),
        ),
        (
            "enable-peer-exchange",
            JsonValue::String(settings.pex_enabled.to_string()),
        ),
    ])
}

#[derive(Debug, PartialEq, Eq)]
pub struct SettingsApplicationResult {
    pub live_app_changes: Vec<&'static str>,
    pub live_engine_global_changes: Vec<&'static str>,
    pub future_download_changes: Vec<&'static str>,
}

pub async fn apply_settings_policy(
    client: &impl GlobalOptionClient,
    previous: &Settings,
    next: &Settings,
) -> Result<SettingsApplicationResult, String> {
    let live_app_changes = collect_live_app_changes(previous, next);
    let (live_engine_global_changes, options) = collect_live_engine_global_options(previous, next);
    let future_download_changes = collect_future_download_changes(previous, next);

    if !live_engine_global_changes.is_empty() {
        client.change_global_option(options).await?;
    }

    Ok(SettingsApplicationResult {
        live_app_changes,
        live_engine_global_changes,
        future_download_changes,
    })
}

pub async fn apply_bittorrent_global_options(
    client: &impl GlobalOptionClient,
    settings: &Settings,
) -> Result<(), String> {
    client
        .change_global_option(build_bittorrent_global_options(settings))
        .await?;
    Ok(())
}

fn collect_live_app_changes(previous: &Settings, next: &Settings) -> Vec<&'static str> {
    let mut changes = Vec::new();
    push_if_changed(
        &mut changes,
        "close_to_tray",
        previous.close_to_tray,
        next.close_to_tray,
    );
    push_if_changed(
        &mut changes,
        "auto_start_on_boot",
        previous.auto_start_on_boot,
        next.auto_start_on_boot,
    );
    push_if_changed(
        &mut changes,
        "auto_start_paused_at_startup",
        previous.auto_start_paused_at_startup,
        next.auto_start_paused_at_startup,
    );
    push_if_changed(
        &mut changes,
        "duplicate_url_warning",
        previous.duplicate_url_warning,
        next.duplicate_url_warning,
    );
    push_if_changed(
        &mut changes,
        "theme_preference",
        previous.theme_preference,
        next.theme_preference,
    );
    push_if_changed(
        &mut changes,
        "notifications_enabled",
        previous.notifications_enabled,
        next.notifications_enabled,
    );
    push_if_changed(
        &mut changes,
        "auto_update_trackers",
        previous.auto_update_trackers,
        next.auto_update_trackers,
    );
    changes
}

fn collect_future_download_changes(previous: &Settings, next: &Settings) -> Vec<&'static str> {
    let mut changes = Vec::new();
    push_if_changed(
        &mut changes,
        "download_directory",
        &previous.download_directory,
        &next.download_directory,
    );
    push_if_changed(
        &mut changes,
        "file_collision_behavior",
        previous.file_collision_behavior,
        next.file_collision_behavior,
    );
    push_if_changed(
        &mut changes,
        "seed_ratio_target",
        previous.seed_ratio_target,
        next.seed_ratio_target,
    );
    push_if_changed(
        &mut changes,
        "file_allocation_method",
        previous.file_allocation_method,
        next.file_allocation_method,
    );
    changes
}

fn collect_live_engine_global_options(
    previous: &Settings,
    next: &Settings,
) -> (Vec<&'static str>, JsonValue) {
    let mut changes = Vec::new();
    let mut options = Vec::new();

    if previous.max_concurrent_downloads != next.max_concurrent_downloads {
        changes.push("max_concurrent_downloads");
        options.push((
            "max-concurrent-downloads",
            JsonValue::String(next.max_concurrent_downloads.to_string()),
        ));
    }

    if previous.max_connections_per_task != next.max_connections_per_task {
        changes.push("max_connections_per_task");
        let value = JsonValue::String(next.max_connections_per_task.to_string());
        options.push(("max-connection-per-server", value.clone()));
        options.push(("split", value));
    }

    if previous.global_download_limit_bps != next.global_download_limit_bps {
        changes.push("global_download_limit_bps");
        options.push((
            "max-overall-download-limit",
            JsonValue::String(limit_to_aria2(next.global_download_limit_bps)),
        ));
    }

    if previous.global_upload_limit_bps != next.global_upload_limit_bps {
        changes.push("global_upload_limit_bps");
        options.push((
            "max-overall-upload-limit",
            JsonValue::String(limit_to_aria2(next.global_upload_limit_bps)),
        ));
    }

    if previous.dht_enabled != next.dht_enabled {
        changes.push("dht_enabled");
        let value = JsonValue::String(next.dht_enabled.to_string());
        options.push(("enable-dht", value.clone()));
        options.push(("enable-dht6", value));
    }

    if previous.pex_enabled != next.pex_enabled {
        changes.push("pex_enabled");
        options.push((
            "enable-peer-exchange",
            JsonValue::String(next.pex_enabled.to_string()),
        ));
    }

    if previous.max_tries != next.max_tries {
        changes.push("max_tries");
        options.push(("max-tries", JsonValue::String(next.max_tries.to_string())));
    }

    if previous.retry_wait_seconds != next.retry_wait_seconds {
        changes.push("retry_wait_seconds");
        options.push((
            "retry-wait",
            JsonValue::String(next.retry_wait_seconds.to_string()),
        ));
    }

    (changes, build_options_map(options))
}

fn limit_to_aria2(value: Option<i64>) -> String {
    value.unwrap_or(0).to_string()
}

fn push_if_changed<T: PartialEq>(
    changes: &mut Vec<&'static str>,
    name: &'static str,
    previous: T,
    next: T,
) {
    if previous != next {
        changes.push(name);
    }
}
