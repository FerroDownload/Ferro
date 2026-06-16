import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";
import { ThemeProvider } from "./themeProvider";

vi.mock("@/features/settings/hooks/useSettingsStore", () => ({
  useSettingsStore: vi.fn(),
}));

type MediaListener = (event: MediaQueryListEvent) => void;

function mockDarkScheme(matches: boolean) {
  const listeners = new Set<MediaListener>();
  const media = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn((_type: "change", listener: MediaListener) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: "change", listener: MediaListener) => {
      listeners.delete(listener);
    }),
    dispatch(nextMatches: boolean) {
      media.matches = nextMatches;
      listeners.forEach((listener) =>
        listener({ matches: nextMatches } as MediaQueryListEvent),
      );
    },
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => media),
  });

  return media;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    vi.resetAllMocks();
  });

  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("applies the manual dark preference", () => {
    mockDarkScheme(false);
    vi.mocked(useSettingsStore).mockImplementation((selector) =>
      selector({
        settings: { theme_preference: "dark" },
      } as Parameters<typeof selector>[0]),
    );

    render(<ThemeProvider />);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("keeps manual light mode when the OS is dark", () => {
    mockDarkScheme(true);
    vi.mocked(useSettingsStore).mockImplementation((selector) =>
      selector({
        settings: { theme_preference: "light" },
      } as Parameters<typeof selector>[0]),
    );

    render(<ThemeProvider />);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("tracks OS changes when preference is system", () => {
    const media = mockDarkScheme(false);
    vi.mocked(useSettingsStore).mockImplementation((selector) =>
      selector({
        settings: { theme_preference: "system" },
      } as Parameters<typeof selector>[0]),
    );

    render(<ThemeProvider />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    media.dispatch(true);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
