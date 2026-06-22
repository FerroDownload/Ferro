import { describe, expect, it } from "vitest";
import { getTarget } from "../../scripts/ensure-aria2c.mjs";

const hostPlatform =
  process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "macos"
      : "linux";
const hostArch =
  process.arch === "x64"
    ? "x64"
    : process.arch === "arm64"
      ? "arm64"
      : process.arch;

describe("ensure-aria2c target resolution", () => {
  it("falls back to host platform and architecture when no env variables are set", () => {
    const { targetPlatform, targetArch, isCrossCompiling } = getTarget({});

    expect(targetPlatform).toBe(hostPlatform);
    expect(targetArch).toBe(hostArch);
    expect(isCrossCompiling).toBe(false);
  });

  it("resolves target from TAURI_ENV_TARGET_TRIPLE for Windows x64", () => {
    const { targetPlatform, targetArch, isCrossCompiling } = getTarget({
      TAURI_ENV_TARGET_TRIPLE: "x86_64-pc-windows-msvc",
    });
    expect(targetPlatform).toBe("windows");
    expect(targetArch).toBe("x64");

    const expectedCross = hostPlatform !== "windows" || hostArch !== "x64";
    expect(isCrossCompiling).toBe(expectedCross);
  });

  it("resolves target from TAURI_ENV_TARGET_TRIPLE for macOS arm64", () => {
    const { targetPlatform, targetArch, isCrossCompiling } = getTarget({
      TAURI_ENV_TARGET_TRIPLE: "aarch64-apple-darwin",
    });
    expect(targetPlatform).toBe("macos");
    expect(targetArch).toBe("arm64");

    const expectedCross = hostPlatform !== "macos" || hostArch !== "arm64";
    expect(isCrossCompiling).toBe(expectedCross);
  });

  it("resolves target from TAURI_ENV_TARGET_TRIPLE for Linux x64", () => {
    const { targetPlatform, targetArch, isCrossCompiling } = getTarget({
      TAURI_ENV_TARGET_TRIPLE: "x86_64-unknown-linux-gnu",
    });
    expect(targetPlatform).toBe("linux");
    expect(targetArch).toBe("x64");

    const expectedCross = hostPlatform !== "linux" || hostArch !== "x64";
    expect(isCrossCompiling).toBe(expectedCross);
  });

  it("resolves target from TAURI_ENV_PLATFORM / TAURI_ENV_ARCH for Linux arm64", () => {
    const { targetPlatform, targetArch, isCrossCompiling } = getTarget({
      TAURI_ENV_PLATFORM: "linux",
      TAURI_ENV_ARCH: "aarch64",
    });
    expect(targetPlatform).toBe("linux");
    expect(targetArch).toBe("arm64");

    const expectedCross = hostPlatform !== "linux" || hostArch !== "arm64";
    expect(isCrossCompiling).toBe(expectedCross);
  });
});
