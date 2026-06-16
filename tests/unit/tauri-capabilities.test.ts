import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type Capability = {
  permissions?: Array<string | { identifier?: string }>;
};

type TauriConfig = {
  app?: {
    security?: {
      csp?: string | null;
      devCsp?: string | null;
    };
  };
  bundle?: {
    resources?: Record<string, string>;
  };
};

const capability = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "src-tauri", "capabilities", "default.json"),
    "utf8",
  ),
) as Capability;

const tauriConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
) as TauriConfig;

const permissions = new Set(
  capability.permissions?.map((permission) =>
    typeof permission === "string" ? permission : permission.identifier,
  ),
);

describe("Tauri default capability", () => {
  it("grants the frontend APIs used by the main window", () => {
    expect([...permissions]).toEqual(
      expect.arrayContaining([
        "core:default",
        "core:event:default",
        "core:window:default",
        "dialog:allow-open",
        "deep-link:default",
        "autostart:allow-enable",
        "autostart:allow-disable",
      ]),
    );
  });

  it("bundles the platform-specific aria2 resource name", () => {
    expect(tauriConfig.bundle?.resources).toMatchObject({
      "resources/aria2c*": "",
    });
  });

  it("enables a restrictive production CSP while keeping Vite development usable", () => {
    const security = tauriConfig.app?.security;

    expect(security?.csp).toContain("default-src 'self'");
    expect(security?.csp).toContain("connect-src ipc: http://ipc.localhost");
    expect(security?.csp).toContain("object-src 'none'");
    expect(security?.csp).not.toContain("'unsafe-eval'");

    expect(security?.devCsp).toContain("http://localhost:1450");
    expect(security?.devCsp).toContain("ws://localhost:1450");
  });
});
