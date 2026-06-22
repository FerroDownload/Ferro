import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

const version = "1.37.0";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const resourcesDir = path.join(repoRoot, "src-tauri", "resources");
const cacheDir = path.join(repoRoot, ".cache", "aria2");

export function getTarget(env = process.env) {
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

  let targetPlatform = hostPlatform;
  let targetArch = hostArch;

  const targetTriple = env.TAURI_ENV_TARGET_TRIPLE;
  if (targetTriple) {
    const parts = targetTriple.toLowerCase().split("-");
    if (targetTriple.includes("windows")) {
      targetPlatform = "windows";
    } else if (targetTriple.includes("apple-darwin")) {
      targetPlatform = "macos";
    } else if (targetTriple.includes("linux")) {
      targetPlatform = "linux";
    }
    if (parts[0] === "x86_64") {
      targetArch = "x64";
    } else if (parts[0] === "aarch64" || parts[0] === "arm64") {
      targetArch = "arm64";
    }
  } else {
    const tauriPlatform = env.TAURI_ENV_PLATFORM;
    const tauriArch = env.TAURI_ENV_ARCH;

    if (tauriPlatform) {
      if (tauriPlatform === "windows" || tauriPlatform === "win32") {
        targetPlatform = "windows";
      } else if (tauriPlatform === "darwin" || tauriPlatform === "macos") {
        targetPlatform = "macos";
      } else if (tauriPlatform === "linux") {
        targetPlatform = "linux";
      }
    }

    if (tauriArch) {
      if (tauriArch === "x86_64" || tauriArch === "x64") {
        targetArch = "x64";
      } else if (tauriArch === "aarch64" || tauriArch === "arm64") {
        targetArch = "arm64";
      }
    }
  }

  const isCrossCompiling =
    targetPlatform !== hostPlatform || targetArch !== hostArch;
  return { targetPlatform, targetArch, isCrossCompiling };
}

const { targetPlatform, targetArch, isCrossCompiling } = getTarget();
const binaryName = targetPlatform === "windows" ? "aria2c.exe" : "aria2c";
const binaryPath = path.join(resourcesDir, binaryName);
const versionFilePath = binaryPath + ".version";
const expectedVersionContent = `${version}-${targetPlatform}-${targetArch}`;

function hasExpectedAria2(binary) {
  if (!fs.existsSync(binary)) {
    return false;
  }

  const result = spawnSync(binary, ["--version"], {
    encoding: "utf8",
  });

  return (
    result.status === 0 &&
    `${result.stdout || ""}${result.stderr || ""}`.includes(
      `aria2 version ${version}`,
    )
  );
}

async function downloadFile(url, destPath) {
  console.log(`Downloading aria2c ${version} from ${url}`);
  const res = await globalThis.fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download from ${url}: ${res.statusText}`);
  }
  const fileStream = fs.createWriteStream(destPath);
  await finished(Readable.fromWeb(res.body).pipe(fileStream));
}

function verifyHash(filePath, expectedHash) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);
  const actualHash = hashSum.digest("hex").toLowerCase();
  return actualHash === expectedHash.toLowerCase();
}

async function main() {
  try {
    // Check if we already have the expected binary
    if (fs.existsSync(binaryPath) && fs.existsSync(versionFilePath)) {
      const currentVersionContent = fs
        .readFileSync(versionFilePath, "utf8")
        .trim();
      if (currentVersionContent === expectedVersionContent) {
        if (isCrossCompiling) {
          console.log(
            `aria2c ${version} for target ${targetPlatform}-${targetArch} already exists (cross-compiled target, execution verification skipped).`,
          );
          return;
        } else if (hasExpectedAria2(binaryPath)) {
          console.log(
            `aria2c ${version} already available and verified at ${binaryPath}`,
          );
          return;
        }
      }
    }

    console.log(
      `Preparing to fetch aria2c for target: ${targetPlatform}-${targetArch}`,
    );

    const ext = targetPlatform === "windows" ? ".exe" : "";
    const filename = `aria2c-${version}-${targetPlatform}-${targetArch}${ext}`;
    const downloadUrl = `https://github.com/FerroDownload/aria2-static-builds/releases/download/v${version}/${filename}`;

    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });

    const archivePath = path.join(cacheDir, filename);
    const shaPath = archivePath + ".sha256";

    // Download both files
    await downloadFile(downloadUrl, archivePath);
    await downloadFile(downloadUrl + ".sha256", shaPath);

    // Read and verify hash
    const shaContent = fs.readFileSync(shaPath, "utf8").trim();
    const expectedHash = shaContent.split(/\s+/)[0];

    if (!verifyHash(archivePath, expectedHash)) {
      throw new Error(
        `Downloaded binary hash mismatch. Expected ${expectedHash}`,
      );
    }

    // Clean up older version files or files with different extensions if we switched platforms
    if (targetPlatform === "windows") {
      const macLinuxBinary = path.join(resourcesDir, "aria2c");
      if (fs.existsSync(macLinuxBinary)) {
        fs.rmSync(macLinuxBinary, { force: true });
      }
      const macLinuxVersion = macLinuxBinary + ".version";
      if (fs.existsSync(macLinuxVersion)) {
        fs.rmSync(macLinuxVersion, { force: true });
      }
    } else {
      const winBinary = path.join(resourcesDir, "aria2c.exe");
      if (fs.existsSync(winBinary)) {
        fs.rmSync(winBinary, { force: true });
      }
      const winVersion = winBinary + ".version";
      if (fs.existsSync(winVersion)) {
        fs.rmSync(winVersion, { force: true });
      }
    }

    // Copy to resources
    fs.copyFileSync(archivePath, binaryPath);

    // Make executable if non-Windows
    if (targetPlatform !== "windows") {
      fs.chmodSync(binaryPath, 0o755);
    }

    // Write version file
    fs.writeFileSync(versionFilePath, expectedVersionContent, "utf8");

    // Clean up cache files
    fs.rmSync(archivePath, { force: true });
    fs.rmSync(shaPath, { force: true });

    // Validate execution if not cross-compiling
    if (!isCrossCompiling) {
      if (!hasExpectedAria2(binaryPath)) {
        throw new Error(
          `Downloaded aria2c did not run or did not report version ${version}.`,
        );
      }
    }

    console.log(
      `Successfully provisioned aria2c ${version} for target ${targetPlatform}-${targetArch} at ${binaryPath}`,
    );
  } catch (error) {
    console.error("Error ensuring aria2c binary:", error.message);
    process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("ensure-aria2c.mjs") ||
    process.argv[1] === fileURLToPath(import.meta.url));

if (isMain) {
  main();
}
