use ferro_lib::tray::{
    format_tray_tooltip, should_restore_from_tray_click, tray_menu_action_for_id,
    tray_menu_items, TrayMenuAction, TrayMouseButton, TrayMouseButtonState,
};

#[test]
fn tray_menu_contains_restore_and_quit_items_in_accessible_order() {
    let items = tray_menu_items();

    assert_eq!(items.len(), 2);
    assert_eq!(items[0].id, "restore");
    assert_eq!(items[0].label, "Show Ferro");
    assert_eq!(items[1].id, "quit");
    assert_eq!(items[1].label, "Quit Ferro");
}

#[test]
fn tray_menu_events_map_to_explicit_actions() {
    assert_eq!(tray_menu_action_for_id("restore"), TrayMenuAction::Restore);
    assert_eq!(tray_menu_action_for_id("quit"), TrayMenuAction::Quit);
    assert_eq!(tray_menu_action_for_id("unknown"), TrayMenuAction::Ignore);
}

#[test]
fn tray_left_button_release_restores_the_main_window() {
    assert!(should_restore_from_tray_click(
        TrayMouseButton::Left,
        TrayMouseButtonState::Up
    ));

    assert!(!should_restore_from_tray_click(
        TrayMouseButton::Left,
        TrayMouseButtonState::Down
    ));
    assert!(!should_restore_from_tray_click(
        TrayMouseButton::Right,
        TrayMouseButtonState::Up
    ));
}

#[test]
fn tray_tooltip_uses_decimal_download_and_upload_speeds() {
    assert_eq!(format_tray_tooltip(0, 0), "D: 0 KB/s | U: 0 KB/s");
    assert_eq!(
        format_tray_tooltip(1_260_000, 12_500),
        "D: 1.3 MB/s | U: 12.5 KB/s"
    );
}
