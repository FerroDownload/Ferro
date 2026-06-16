import { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import { parseSettings } from "@/shared/lib/rpcSchemas";
import { invokeGetSettings, invokeUpdateSettings } from "@/shared/lib/tauri";
import type { Settings } from "@/shared/lib/types";

export const settingsQueryClient = new QueryClient();

type SettingsStoreState = {
  settings: Settings | null;
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
};

export const useSettingsStore = create<SettingsStoreState>()((set) => ({
  settings: null,
  isLoading: false,
  isUpdating: false,
  error: null,
  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await settingsQueryClient.fetchQuery({
        queryKey: ["settings"],
        queryFn: async () => parseSettings(await invokeGetSettings()),
      });
      set({ settings, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Unknown error",
        isLoading: false,
      });
    }
  },
  updateSettings: async (patch) => {
    const current = useSettingsStore.getState().settings;
    if (!current) {
      set({ error: "Settings are not loaded" });
      return;
    }

    set({ isUpdating: true, error: null });
    try {
      const settings = await invokeUpdateSettings({ ...current, ...patch });
      const parsed = parseSettings(settings);
      settingsQueryClient.setQueryData(["settings"], parsed);
      set({ settings: parsed, isUpdating: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Unknown error",
        isUpdating: false,
      });
    }
  },
}));
