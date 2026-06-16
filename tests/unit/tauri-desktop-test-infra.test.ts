import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readText = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Tauri desktop test infrastructure", () => {
  it("runs desktop WebDriver e2e on the Tauri-supported desktop platforms", () => {
    const workflow = readText(".github/workflows/e2e.yml");
    const harness = readText("tests/e2e/desktop/tauri.e2e.test.js");

    expect(workflow).toContain("ubuntu-22.04");
    expect(workflow).toContain("windows-latest");
    expect(workflow).toContain("webkit2gtk-driver");
    expect(workflow).toContain("xvfb-run");

    expect(harness).toContain("findRepoRoot");
    expect(harness).toContain("src-tauri");
    expect(harness).toContain("WebKitWebDriver");
    expect(harness).not.toContain("currently supports Windows WebDriver only");
  });

  it("keeps macOS covered by desktop build smoke tests instead of unsupported WebDriver", () => {
    const ciWorkflow = readText(".github/workflows/ci.yml");
    const e2eWorkflow = readText(".github/workflows/e2e.yml");
    const aria2SetupScript = readText("scripts/ensure-aria2c.mjs");

    expect(ciWorkflow).toContain("Build desktop app");
    expect(ciWorkflow).toContain("windows-latest");
    expect(ciWorkflow).toContain("ubuntu-22.04");
    expect(ciWorkflow).toContain("macos-13");
    expect(ciWorkflow).toContain("macos-14");
    expect(ciWorkflow).toContain("pnpm tauri build --no-bundle --debug");
    expect(ciWorkflow).toContain('FERRO_CI_USE_SYSTEM_ARIA2: "1"');
    expect(aria2SetupScript).toContain("FERRO_CI_USE_SYSTEM_ARIA2");

    expect(e2eWorkflow).toContain(
      "macOS desktop WebDriver is not available in Tauri v2",
    );
  });
});
