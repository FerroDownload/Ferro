import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";

export const setupTauriMocks = (handler: Parameters<typeof mockIPC>[0]) => {
  mockIPC(handler);
};

export const resetTauriMocks = () => {
  clearMocks();
};
