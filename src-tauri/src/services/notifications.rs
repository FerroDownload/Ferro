use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;

use crate::services::settings_store::AppSettingsStore;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NotificationMessage {
    pub title: String,
    pub body: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NotificationPermission {
    Granted,
    Denied,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NotificationDispatchOutcome {
    Disabled,
    PermissionDenied,
    Sent,
}

pub trait NotificationSettings {
    fn notifications_enabled(&self) -> Result<bool, String>;
}

pub trait NotificationBackend {
    fn permission_state(&mut self) -> Result<NotificationPermission, String>;
    fn request_permission(&mut self) -> Result<NotificationPermission, String>;
    fn show(&mut self, message: &NotificationMessage) -> Result<(), String>;
}

impl<R: Runtime> NotificationSettings for AppSettingsStore<R> {
    fn notifications_enabled(&self) -> Result<bool, String> {
        self.load()
            .map(|settings| settings.notifications_enabled)
            .map_err(|error| format!("{error:?}"))
    }
}

pub struct TauriNotificationBackend<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> TauriNotificationBackend<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<R: Runtime> NotificationBackend for TauriNotificationBackend<R> {
    fn permission_state(&mut self) -> Result<NotificationPermission, String> {
        self.app
            .notification()
            .permission_state()
            .map(NotificationPermission::from)
            .map_err(|error| error.to_string())
    }

    fn request_permission(&mut self) -> Result<NotificationPermission, String> {
        self.app
            .notification()
            .request_permission()
            .map(NotificationPermission::from)
            .map_err(|error| error.to_string())
    }

    fn show(&mut self, message: &NotificationMessage) -> Result<(), String> {
        self.app
            .notification()
            .builder()
            .title(&message.title)
            .body(&message.body)
            .show()
            .map_err(|error| error.to_string())
    }
}

impl From<tauri::plugin::PermissionState> for NotificationPermission {
    fn from(value: tauri::plugin::PermissionState) -> Self {
        match value {
            tauri::plugin::PermissionState::Granted => Self::Granted,
            tauri::plugin::PermissionState::Denied => Self::Denied,
            tauri::plugin::PermissionState::Prompt
            | tauri::plugin::PermissionState::PromptWithRationale => Self::Unknown,
        }
    }
}

pub fn dispatch_notification(
    settings: &impl NotificationSettings,
    backend: &mut impl NotificationBackend,
    message: NotificationMessage,
) -> Result<NotificationDispatchOutcome, String> {
    if !settings.notifications_enabled()? {
        return Ok(NotificationDispatchOutcome::Disabled);
    }

    let permission = match backend.permission_state()? {
        NotificationPermission::Unknown => backend.request_permission()?,
        permission => permission,
    };

    if permission != NotificationPermission::Granted {
        return Ok(NotificationDispatchOutcome::PermissionDenied);
    }

    backend.show(&message)?;
    Ok(NotificationDispatchOutcome::Sent)
}

pub fn request_permission_if_enabled<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let settings = AppSettingsStore::new(app.clone());
    if !settings.notifications_enabled()? {
        return Ok(());
    }

    let mut backend = TauriNotificationBackend::new(app);
    if backend.permission_state()? == NotificationPermission::Unknown {
        let _ = backend.request_permission()?;
    }

    Ok(())
}

pub fn dispatch_app_notification<R: Runtime>(
    app: AppHandle<R>,
    message: NotificationMessage,
) -> Result<NotificationDispatchOutcome, String> {
    let settings = AppSettingsStore::new(app.clone());
    let mut backend = TauriNotificationBackend::new(app);
    dispatch_notification(&settings, &mut backend, message)
}
