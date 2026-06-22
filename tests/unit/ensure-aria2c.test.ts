import { describe, expect, it } from "vitest";
import { getTarget } from "../../scripts/ensure-aria2c.mjs";

describe("ensure-aria2c target resolution", () => {
  it("falls back to host platform and architecture when no env variables are set", () => {
    const { targetPlatform, targetArch, isCrossCompiling } = getTarget({});

    // On the current testing machine, host is macos-arm64
    expect(targetPlatform).toBe("macos");
    expect(targetArch).toBe("arm64");
    expect(isCrossCompiling).toBe(false);
  });

  it("resolves target from TAURI_ENV_TARGET_TRIPLE for Windows x64", () => {
    const { targetPlatform, targetArch, isCrossCompiling } = getTarget({
      TAURI_ENV_TARGET_TRIPLE: "x86_64-pc-windows-msvc",
    });
    expect(targetPlatform).toBe("windows");
    expect(targetArch).toBe("x64");
    // Since host is macos-arm64, this represents cross-compilation
    expect(isCrossCompiling).toBe(true);
  });

  it("resolves target from TAURI_ENV_TARGET_TRIPLE for macOS arm64", () => {
    const { targetPlatform, targetArch, isCrossCompiling } = getTarget({
      TAURI_ENV_TARGET_TRIPLE: "aarch64-apple-darwin",
    });
    expect(targetPlatform).toBe("macos");
    expect(targetArch).toBe("arm64");
    expect(isCrossCompiling).toBe(false);
  });

  it("resolves target from TAURI_ENV_TARGET_TRIPLE for Linux x64", () => {
    const { targetPlatform, targetArch, isCrossCompiling } = getTarget({
      TAURI_ENV_TARGET_TRIPLE: "x86_64-unknown-linux-gnu",
    });
    expect(targetPlatform).toBe("linux");
    expect(targetArch).toBe("x64");
    expect(isCrossCompiling).toBe(true);
  });

  it("resolves target from TAURI_ENV_PLATFORM / TAURI_ENV_ARCH for Linux arm64", () => {
    const { targetPlatform, targetArch, isCrossCompiling } = getTarget({
      TAURI_ENV_PLATFORM: "linux",
      TAURI_ENV_ARCH: "aarch64",
    });
    expect(targetPlatform).toBe("linux");
    expect(targetArch).toBe("arm64");
    expect(isCrossCompiling).toBe(true);
  });
});
