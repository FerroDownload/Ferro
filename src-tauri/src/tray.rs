use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, Runtime};

pub const TRAY_ID: &str = "ferro-main-tray";
const RESTORE_MENU_ID: &str = "restore";
const QUIT_MENU_ID: &str = "quit";
const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayMenuAction {
    Restore,
    Quit,
    Ignore,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayMouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayMouseButtonState {
    Up,
    Down,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrayMenuItemDefinition {
    pub id: &'static str,
    pub label: &'static str,
}

pub fn tray_menu_items() -> [TrayMenuItemDefinition; 2] {
    [
        TrayMenuItemDefinition {
            id: RESTORE_MENU_ID,
            label: "Show Ferro",
        },
        TrayMenuItemDefinition {
            id: QUIT_MENU_ID,
            label: "Quit Ferro",
        },
    ]
}

pub fn tray_menu_action_for_id(id: &str) -> TrayMenuAction {
    match id {
        RESTORE_MENU_ID => TrayMenuAction::Restore,
        QUIT_MENU_ID => TrayMenuAction::Quit,
        _ => TrayMenuAction::Ignore,
    }
}

pub fn should_restore_from_tray_click(
    button: TrayMouseButton,
    state: TrayMouseButtonState,
) -> bool {
    matches!(
        (button, state),
        (TrayMouseButton::Left, TrayMouseButtonState::Up)
    )
}

pub fn format_tray_tooltip(download_bps: i64, upload_bps: i64) -> String {
    format!(
        "D: {} | U: {}",
        format_tray_speed(download_bps),
        format_tray_speed(upload_bps)
    )
}

fn format_tray_speed(bytes_per_second: i64) -> String {
    const KB: f64 = 1_000.0;
    const MB: f64 = 1_000_000.0;

    let bytes = bytes_per_second.max(0) as f64;
    if bytes >= MB {
        format!("{:.1} MB/s", bytes / MB)
    } else if bytes == 0.0 {
        "0 KB/s".to_string()
    } else {
        format!("{:.1} KB/s", bytes / KB)
    }
}

pub fn setup_system_tray<R: Runtime>(app: &mut App<R>) -> tauri::Result<()> {
    let menu_items = tray_menu_items();
    let restore = MenuItemBuilder::with_id(menu_items[0].id, menu_items[0].label).build(app)?;
    let quit = MenuItemBuilder::with_id(menu_items[1].id, menu_items[1].label).build(app)?;
    let menu = MenuBuilder::new(app).items(&[&restore, &quit]).build()?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip(format_tray_tooltip(0, 0))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(
            |app, event| match tray_menu_action_for_id(event.id().as_ref()) {
                TrayMenuAction::Restore => restore_main_window(app),
                TrayMenuAction::Quit => app.exit(0),
                TrayMenuAction::Ignore => {}
            },
        )
        .on_tray_icon_event(|tray, event| {
            if let Some((button, state)) = normalize_tray_click(event) {
                if should_restore_from_tray_click(button, state) {
                    restore_main_window(tray.app_handle());
                }
            }
        })
        .build(app)?;

    Ok(())
}

pub fn set_tray_tooltip<R: Runtime>(app: &AppHandle<R>, tooltip: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_tooltip(Some(tooltip))
            .map_err(|error| error.to_string())
    } else {
        Err("tray icon not found".to_string())
    }
}

fn normalize_tray_click(event: TrayIconEvent) -> Option<(TrayMouseButton, TrayMouseButtonState)> {
    if let TrayIconEvent::Click {
        button,
        button_state,
        ..
    } = event
    {
        Some((
            normalize_mouse_button(button),
            normalize_mouse_state(button_state),
        ))
    } else {
        None
    }
}

fn normalize_mouse_button(button: MouseButton) -> TrayMouseButton {
    match button {
        MouseButton::Left => TrayMouseButton::Left,
        MouseButton::Right => TrayMouseButton::Right,
        MouseButton::Middle => TrayMouseButton::Middle,
    }
}

fn normalize_mouse_state(state: MouseButtonState) -> TrayMouseButtonState {
    match state {
        MouseButtonState::Up => TrayMouseButtonState::Up,
        MouseButtonState::Down => TrayMouseButtonState::Down,
    }
}

fn restore_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Err(error) = window.unminimize() {
            log::warn!("Unable to unminimize main window from tray: {error}");
        }
        if let Err(error) = window.show() {
            log::warn!("Unable to show main window from tray: {error}");
        }
        if let Err(error) = window.set_focus() {
            log::warn!("Unable to focus main window from tray: {error}");
        }
    }
}
