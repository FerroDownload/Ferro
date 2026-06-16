import { useEffect, useRef } from "react";
import { Outlet } from "react-router";

import { triggerRestartRecovery } from "@/features/tasks/services/taskCommands";
import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";
import { UpdatePromptHost } from "@/features/updater/components/UpdatePromptHost";
import { AppNavigation } from "@/shared/components/AppNavigation";
import { ToastProvider } from "@/shared/components/ToastProvider";
import { ThemeProvider } from "./themeProvider";
import { registerWindowCloseHandler } from "./windowEvents";

export default function AppShell() {
  const settings = useSettingsStore((state) => state.settings);
  const isLoading = useSettingsStore((state) => state.isLoading);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const recoveryTriggered = useRef(false);

  useEffect(() => {
    if (!settings && !isLoading) {
      void loadSettings();
    }
  }, [isLoading, loadSettings, settings]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let cleanup: (() => void) | null = null;
    let disposed = false;

    void registerWindowCloseHandler().then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      cleanup = unlisten;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (recoveryTriggered.current) {
      return;
    }
    if (settings) {
      recoveryTriggered.current = true;
      // Always auto-resume on startup
      void triggerRestartRecovery();
    }
  }, [settings]);

  return (
    <ThemeProvider>
      <div className="h-screen overflow-hidden bg-muted/35 text-foreground">
        <div className="flex h-full overflow-hidden">
          <AppNavigation />
          <main
            aria-label="Transfer workspace"
            className="min-w-0 flex-1 overflow-auto bg-background"
          >
            <div className="mx-auto flex min-h-full w-full max-w-[1480px] flex-col px-4 py-3 lg:px-5 lg:py-4">
              <Outlet />
            </div>
          </main>
        </div>
        <UpdatePromptHost />
        <ToastProvider />
      </div>
    </ThemeProvider>
  );
}
