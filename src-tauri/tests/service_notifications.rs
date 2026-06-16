use ferro_lib::services::notifications::{
    dispatch_notification, NotificationBackend, NotificationDispatchOutcome, NotificationMessage,
    NotificationPermission, NotificationSettings,
};

struct StaticNotificationSettings {
    enabled: bool,
}

impl NotificationSettings for StaticNotificationSettings {
    fn notifications_enabled(&self) -> Result<bool, String> {
        Ok(self.enabled)
    }
}

struct FakeNotificationBackend {
    permission: NotificationPermission,
    request_result: NotificationPermission,
    requested_permission: bool,
    shown: Vec<NotificationMessage>,
}

impl FakeNotificationBackend {
    fn new(permission: NotificationPermission) -> Self {
        Self {
            permission,
            request_result: permission,
            requested_permission: false,
            shown: Vec::new(),
        }
    }
}

impl NotificationBackend for FakeNotificationBackend {
    fn permission_state(&mut self) -> Result<NotificationPermission, String> {
        Ok(self.permission)
    }

    fn request_permission(&mut self) -> Result<NotificationPermission, String> {
        self.requested_permission = true;
        self.permission = self.request_result;
        Ok(self.request_result)
    }

    fn show(&mut self, message: &NotificationMessage) -> Result<(), String> {
        self.shown.push(message.clone());
        Ok(())
    }
}

fn message() -> NotificationMessage {
    NotificationMessage {
        title: "Download complete".to_string(),
        body: "file.iso finished downloading".to_string(),
    }
}

#[test]
fn skips_dispatch_when_notifications_are_disabled() {
    let settings = StaticNotificationSettings { enabled: false };
    let mut backend = FakeNotificationBackend::new(NotificationPermission::Granted);

    let outcome = dispatch_notification(&settings, &mut backend, message()).expect("dispatch");

    assert_eq!(outcome, NotificationDispatchOutcome::Disabled);
    assert!(!backend.requested_permission);
    assert!(backend.shown.is_empty());
}

#[test]
fn requests_permission_when_unknown_before_sending() {
    let settings = StaticNotificationSettings { enabled: true };
    let mut backend = FakeNotificationBackend::new(NotificationPermission::Unknown);
    backend.request_result = NotificationPermission::Granted;

    let outcome = dispatch_notification(&settings, &mut backend, message()).expect("dispatch");

    assert_eq!(outcome, NotificationDispatchOutcome::Sent);
    assert!(backend.requested_permission);
    assert_eq!(backend.shown, vec![message()]);
}

#[test]
fn does_not_send_when_permission_is_denied() {
    let settings = StaticNotificationSettings { enabled: true };
    let mut backend = FakeNotificationBackend::new(NotificationPermission::Denied);

    let outcome = dispatch_notification(&settings, &mut backend, message()).expect("dispatch");

    assert_eq!(outcome, NotificationDispatchOutcome::PermissionDenied);
    assert!(!backend.requested_permission);
    assert!(backend.shown.is_empty());
}
