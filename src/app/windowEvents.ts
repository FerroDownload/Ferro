import { getCurrentWindow } from "@tauri-apps/api/window";

import { invokeWindowCloseRequested } from "@/shared/lib/tauri";

export async function registerWindowCloseHandler(): Promise<() => void> {
  const appWindow = getCurrentWindow();
  return appWindow.onCloseRequested((event) => {
    event.preventDefault();
    void invokeWindowCloseRequested().catch((error: unknown) => {
      console.error("Failed to handle window close request", error);
    });
  });
}
