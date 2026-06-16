import { useEffect, type ReactNode } from "react";

import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";
import type { ThemePreference } from "@/shared/lib/types";

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

type ThemeProviderProps = {
  children?: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const preference =
    useSettingsStore((state) => state.settings?.theme_preference) ?? "system";

  useEffect(() => {
    const media = window.matchMedia?.(DARK_SCHEME_QUERY);
    const apply = () => {
      applyThemePreference(preference, media?.matches ?? false);
    };

    apply();

    if (preference !== "system" || !media) {
      return;
    }

    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  return <>{children}</>;
}

export function applyThemePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean,
) {
  const shouldUseDark =
    preference === "dark" || (preference === "system" && systemPrefersDark);

  document.documentElement.classList.toggle("dark", shouldUseDark);
  document.documentElement.style.colorScheme = shouldUseDark ? "dark" : "light";
}
