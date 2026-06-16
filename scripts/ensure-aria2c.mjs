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
const binaryName = process.platform === "win32" ? "aria2c.exe" : "aria2c";
const binaryPath = path.join(resourcesDir, binaryName);
const cacheDir = path.join(repoRoot, ".cache", "aria2");

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

function resolveExecutableFromPath(executableName) {
  const pathValue = process.env.PATH || "";
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, executableName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
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

function extractZip(archivePath, extractDir) {
  fs.mkdirSync(extractDir, { recursive: true });

  // Try tar first
  const tarResult = spawnSync("tar", ["-xf", archivePath, "-C", extractDir]);
  if (tarResult.status === 0) {
    return;
  }

  // Fallback to powershell Expand-Archive on Windows
  if (process.platform === "win32") {
    const psResult = spawnSync("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${archivePath}' -DestinationPath '${extractDir}' -Force`,
    ]);
    if (psResult.status === 0) {
      return;
    }
  }

  throw new Error("Failed to extract zip archive using tar or PowerShell.");
}

async function main() {
  try {
    if (hasExpectedAria2(binaryPath)) {
      console.log(`aria2c ${version} already available at ${binaryPath}`);
      return;
    }

    if (
      process.env.FERRO_CI_USE_SYSTEM_ARIA2 === "1" &&
      process.platform !== "win32"
    ) {
      const systemAria2 = resolveExecutableFromPath("aria2c");
      if (!systemAria2) {
        console.error(
          "FERRO_CI_USE_SYSTEM_ARIA2 is set, but aria2c was not found in PATH.",
        );
        process.exit(1);
      }

      fs.mkdirSync(resourcesDir, { recursive: true });
      fs.copyFileSync(systemAria2, binaryPath);
      fs.chmodSync(binaryPath, 0o755);
      console.log(`Copied CI aria2c from ${systemAria2} to ${binaryPath}`);
      return;
    }

    if (process.platform !== "win32") {
      console.error(
        [
          `Bundled aria2c ${version} is missing at ${binaryPath}.`,
          "Ferro does not fall back to a system aria2c from PATH.",
          "Provision a platform-specific aria2c binary in src-tauri/resources before building this target.",
        ].join("\n"),
      );
      process.exit(1);
    }

    // Windows setup flow using pure Node.js
    const archiveName = `aria2-${version}-win-64bit-build1.zip`;
    const archivePath = path.join(cacheDir, archiveName);
    const extractDir = path.join(cacheDir, `extract-${version}`);
    const downloadUrl = `https://github.com/aria2/aria2/releases/download/release-${version}/${archiveName}`;
    const expectedSha256 =
      "67d015301eef0b612191212d564c5bb0a14b5b9c4796b76454276a4d28d9b288";

    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });

    if (!fs.existsSync(archivePath)) {
      await downloadFile(downloadUrl, archivePath);
    }

    if (!verifyHash(archivePath, expectedSha256)) {
      throw new Error(
        `Downloaded archive hash mismatch. Expected ${expectedSha256}`,
      );
    }

    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }

    extractZip(archivePath, extractDir);

    // Recursively find aria2c.exe in the extracted folder
    const findBinary = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const found = findBinary(fullPath);
          if (found) return found;
        } else if (file === "aria2c.exe") {
          return fullPath;
        }
      }
      return null;
    };

    const extractedBinary = findBinary(extractDir);
    if (!extractedBinary) {
      throw new Error(`aria2c.exe was not found in extracted archive.`);
    }

    fs.copyFileSync(extractedBinary, binaryPath);

    if (!hasExpectedAria2(binaryPath)) {
      throw new Error(
        `Fetched aria2c did not run or did not report version ${version}.`,
      );
    }

    console.log(`aria2c ${version} available at ${binaryPath}`);
  } catch (error) {
    console.error("Error ensuring aria2c binary:", error.message);
    process.exit(1);
  }
}

main();
