import fs from "fs";
import http from "node:http";
import os from "os";
import path from "path";
import { Buffer } from "node:buffer";
import { spawn, spawnSync } from "child_process";
import net from "net";
import { expect } from "chai";
import { Builder, By, Capabilities, until } from "selenium-webdriver";
import { fileURLToPath } from "url";

// Ref: https://v2.tauri.app/develop/tests/webdriver/

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const binaryName = process.platform === "win32" ? "ferro.exe" : "ferro";
const bundledEdgeDriverPath = path.resolve(repoRoot, "msedgedriver.exe");
const bundledAria2Path = path.resolve(
  repoRoot,
  "src-tauri",
  "resources",
  process.platform === "win32" ? "aria2c.exe" : "aria2c",
);
const testDownloadUrl = "http://ash-speed.hetzner.com/100MB.bin";
const localFixtureName = "ferro-local-fixture.bin";
const localFixtureBytes = Buffer.from("ferro local download fixture\n", "utf8");
const pnpmBuildCommand =
  process.platform === "win32"
    ? {
        command: process.env.ComSpec || "cmd.exe",
        args: ["/d", "/s", "/c", "pnpm tauri build --no-bundle --debug"],
      }
    : {
        command: "pnpm",
        args: ["tauri", "build", "--no-bundle", "--debug"],
      };
const powershellPath = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

let driver;
let tauriDriver;
let downloadDir;
let dbPath;
let localServer;
let localServerUrl;
let localServerRequests = [];
let shutdownStarted = false;

function resolveApplicationPath() {
  const debugPath = path.resolve(
    repoRoot,
    "src-tauri",
    "target",
    "debug",
    binaryName,
  );
  if (fs.existsSync(debugPath)) {
    return debugPath;
  }

  const releasePath = path.resolve(
    repoRoot,
    "src-tauri",
    "target",
    "release",
    binaryName,
  );
  if (fs.existsSync(releasePath)) {
    return releasePath;
  }

  throw new Error(
    `Unable to locate Tauri binary at ${debugPath} or ${releasePath}`,
  );
}

function escapePowerShellLiteral(value) {
  return value.replace(/'/g, "''");
}

function readFileVersion(executablePath) {
  if (!executablePath || !fs.existsSync(executablePath)) {
    return null;
  }

  const script = `(Get-Item -LiteralPath '${escapePowerShellLiteral(
    executablePath,
  )}').VersionInfo.ProductVersion`;
  const result = spawnSync(powershellPath, ["-NoProfile", "-Command", script], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return null;
  }

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const match = output.match(/(\d+\.\d+\.\d+\.\d+)/);
  return match?.[1] || null;
}

function resolveWebView2RuntimePath() {
  const roots = [
    path.join(
      process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
      "Microsoft",
      "EdgeWebView",
      "Application",
    ),
    path.join(
      process.env.PROGRAMFILES || "C:\\Program Files",
      "Microsoft",
      "EdgeWebView",
      "Application",
    ),
    path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "Microsoft",
      "EdgeWebView",
      "Application",
    ),
  ];

  const candidates = roots.flatMap((root) => {
    if (!fs.existsSync(root)) {
      return [];
    }

    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, "msedgewebview2.exe"))
      .filter((candidate) => fs.existsSync(candidate));
  });

  return (
    candidates.sort((left, right) =>
      (readFileVersion(right) || "").localeCompare(
        readFileVersion(left) || "",
        undefined,
        { numeric: true },
      ),
    )[0] || null
  );
}

function readDriverVersion(executablePath) {
  if (!executablePath || !fs.existsSync(executablePath)) {
    return null;
  }

  const result = spawnSync(executablePath, ["--version"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return null;
  }

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const match = output.match(/(\d+\.\d+\.\d+\.\d+)/);
  return match?.[1] || null;
}

async function downloadFile(url, destinationPath) {
  const response = await globalThis.fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destinationPath, bytes);
}

function expandArchive(zipPath, destinationDir) {
  const script = `Expand-Archive -LiteralPath '${escapePowerShellLiteral(
    zipPath,
  )}' -DestinationPath '${escapePowerShellLiteral(destinationDir)}' -Force`;
  const result = spawnSync(powershellPath, ["-NoProfile", "-Command", script], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `Failed to extract ${zipPath}: ${result.stderr || result.stdout || "unknown error"}`,
    );
  }
}

function resolveEdgeBinaryPath() {
  const candidates = [
    path.join(
      process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    ),
    path.join(
      process.env.PROGRAMFILES || "C:\\Program Files",
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    ),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function ensureMatchingEdgeDriver() {
  if (process.platform !== "win32") {
    throw new Error(
      "This e2e harness currently supports Windows WebDriver only.",
    );
  }

  const browserBinaryPath =
    resolveWebView2RuntimePath() || resolveEdgeBinaryPath();
  if (!browserBinaryPath) {
    throw new Error(
      "Unable to locate the WebView2 runtime or msedge.exe to determine the required WebDriver version.",
    );
  }

  const requiredVersion = readFileVersion(browserBinaryPath);
  if (!requiredVersion) {
    throw new Error(
      `Unable to determine WebDriver target version from ${browserBinaryPath}.`,
    );
  }

  const bundledVersion = readDriverVersion(bundledEdgeDriverPath);
  if (bundledVersion === requiredVersion) {
    return bundledEdgeDriverPath;
  }

  const cacheDir = path.join(
    os.tmpdir(),
    "ferro-msedgedriver",
    requiredVersion,
  );
  const cachedDriverPath = path.join(cacheDir, "msedgedriver.exe");
  if (readDriverVersion(cachedDriverPath) === requiredVersion) {
    return cachedDriverPath;
  }

  fs.mkdirSync(cacheDir, { recursive: true });

  const archivePath = path.join(cacheDir, "edgedriver_win64.zip");
  const downloadUrl = `https://msedgedriver.microsoft.com/${requiredVersion}/edgedriver_win64.zip`;

  await downloadFile(downloadUrl, archivePath);
  expandArchive(archivePath, cacheDir);

  const downloadedVersion = readDriverVersion(cachedDriverPath);
  if (downloadedVersion !== requiredVersion) {
    throw new Error(
      `Downloaded Edge driver version ${downloadedVersion || "unknown"} does not match required WebView2/Edge version ${requiredVersion}.`,
    );
  }

  return cachedDriverPath;
}

function resolveTauriDriverPath() {
  const tauriDriverPath = path.resolve(
    os.homedir(),
    ".cargo",
    "bin",
    process.platform === "win32" ? "tauri-driver.exe" : "tauri-driver",
  );

  if (!fs.existsSync(tauriDriverPath)) {
    throw new Error(
      `tauri-driver was not found at ${tauriDriverPath}. Install it with: cargo install tauri-driver --locked`,
    );
  }

  return tauriDriverPath;
}

function checkLiveDownloadPreflight() {
  if (!fs.existsSync(bundledAria2Path)) {
    return {
      ok: false,
      reason: `bundled aria2c is missing at ${bundledAria2Path}`,
    };
  }

  const preflightDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ferro-hetzner-preflight-"),
  );
  const result = spawnSync(
    bundledAria2Path,
    [
      "--disable-ipv6=true",
      "--file-allocation=none",
      "--allow-overwrite=true",
      `--dir=${preflightDir}`,
      "--out=preflight.bin",
      "--max-download-limit=64K",
      "--stop=3",
      testDownloadUrl,
    ],
    {
      encoding: "utf8",
      timeout: 10000,
    },
  );
  const preflightPath = path.join(preflightDir, "preflight.bin");
  const downloadedBytes = fs.existsSync(preflightPath)
    ? fs.statSync(preflightPath).size
    : 0;
  fs.rmSync(preflightDir, { force: true, recursive: true });

  if (downloadedBytes > 0) {
    return { ok: true, reason: "" };
  }

  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return {
    ok: false,
    reason:
      output ||
      result.error?.message ||
      `aria2c dry-run exited with status ${result.status}`,
  };
}

function waitForPort(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const attempt = () => {
      const socket = new net.Socket();
      socket.setTimeout(1500);

      const onFailure = () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(
            new Error(`Timed out waiting for WebDriver on ${host}:${port}`),
          );
          return;
        }
        setTimeout(attempt, 300);
      };

      socket.once("error", onFailure);
      socket.once("timeout", onFailure);
      socket.connect(port, host, () => {
        socket.end();
        resolve();
      });
    };

    attempt();
  });
}

function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      globalThis.clearTimeout(timer);
      resolve(true);
    });
  });
}

async function closeTauriDriver() {
  const currentDriver = driver;
  driver = undefined;
  if (currentDriver) {
    await currentDriver.quit().catch(() => {});
  }

  const currentTauriDriver = tauriDriver;
  tauriDriver = undefined;
  if (currentTauriDriver && currentTauriDriver.exitCode === null) {
    currentTauriDriver.kill();
    const exited = await waitForProcessExit(currentTauriDriver, 5000);
    if (!exited && currentTauriDriver.exitCode === null) {
      currentTauriDriver.kill("SIGKILL");
    }
  }
}

function onShutdown(fn) {
  const cleanup = async (exitCode) => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    try {
      await fn();
    } finally {
      process.exit(exitCode);
    }
  };

  process.once("SIGINT", () => {
    void cleanup(130);
  });
  process.once("SIGTERM", () => {
    void cleanup(143);
  });
  process.once("SIGHUP", () => {
    void cleanup(129);
  });
  process.once("SIGBREAK", () => {
    void cleanup(130);
  });
}

async function typeIntoInput(element, value) {
  await element.click();
  await driver.executeScript(
    `
      const input = arguments[0];
      const value = arguments[1];
      const descriptor = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      );
      const setValue = descriptor && descriptor.set;
      if (!setValue) {
        input.value = value;
      } else {
        const previousValue = input.value;
        setValue.call(input, value);
        if (input._valueTracker) {
          input._valueTracker.setValue(previousValue);
        }
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    `,
    element,
    value,
  );

  try {
    await driver.wait(
      async () => (await element.getAttribute("value")) === value,
      10000,
    );
  } catch (error) {
    const actual = await element.getAttribute("value");
    throw new Error(
      `Input value did not settle. Expected ${value}; got ${actual}`,
      {
        cause: error,
      },
    );
  }
}

async function clickElement(element) {
  await driver.executeScript("arguments[0].click()", element);
}

async function waitForEngineRunning() {
  await driver.wait(async () => {
    const bodyText = await driver.executeScript(
      "return document.body.innerText",
    );
    return /\bEngine\s+running\b/.test(bodyText);
  }, 30000);
}

async function waitForDialogClosed() {
  try {
    await driver.wait(async () => {
      const dialogs = await driver.findElements(
        By.xpath("//h2[normalize-space()='Add download']"),
      );
      return dialogs.length === 0;
    }, 30000);
  } catch (error) {
    const alerts = await driver.findElements(By.css("[role='alert']"));
    const alertText = alerts.length > 0 ? await alerts[0].getText() : "<none>";
    const diagnostics = await driver.executeScript(
      `
      const urlInput = document.querySelector("#download-url");
      const destinationInput = document.querySelector("#download-destination");
      return JSON.stringify({
        submitSeen: Boolean(window.__ferroSubmitSeen),
        activeElementId: document.activeElement?.id || "",
        urlValue: urlInput?.value || "",
        destinationValue: destinationInput?.value || "",
        tauriInternalsAvailable: Boolean(window.__TAURI_INTERNALS__?.invoke),
        localServerRequests: arguments[0]
      });
    `,
      localServerRequests,
    );
    const bodyText = await driver.findElement(By.css("body")).getText();
    throw new Error(
      `Add download dialog did not close. Alert: ${alertText}. Diagnostics: ${diagnostics}. Page: ${bodyText}`,
      {
        cause: error,
      },
    );
  }
}

async function waitForTransferProgress() {
  const rowLocator = By.xpath(
    "//*[@role='row' and contains(normalize-space(), '100MB.bin')]",
  );
  await driver.wait(until.elementLocated(rowLocator), 30000);

  await driver.wait(async () => {
    const rows = await driver.findElements(rowLocator);
    if (rows.length === 0) {
      return false;
    }

    const row = rows[0];
    const text = await row.getText();
    if (/error/i.test(text)) {
      throw new Error(`Hetzner download entered error state: ${text}`);
    }

    const bytesMatch = text.match(/([\d,]+)\s*\/\s*([\d,]+)\s*B/);
    if (bytesMatch) {
      return Number(bytesMatch[1].replace(/,/g, "")) > 0;
    }

    const speedMatch = text.match(/↓\s*([\d.]+)\s*(B|KB|MB|GB)\/s/);
    return speedMatch ? Number(speedMatch[1]) > 0 : false;
  }, 120000);

  return driver.findElement(rowLocator);
}

async function waitForDownloadComplete(fileName, totalBytes) {
  const filePath = path.join(downloadDir, fileName);
  await driver.wait(() => {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    return fs.statSync(filePath).size === totalBytes;
  }, 60000);

  await driver.findElement(By.linkText("History")).click();
  await driver.wait(async () => {
    const headings = await driver.findElements(By.css("h1"));
    if (headings.length === 0) {
      return false;
    }

    return (await headings[0].getText()) === "History";
  }, 30000);

  const row = await driver.wait(
    until.elementLocated(
      By.xpath(
        `//*[@role='row' and contains(normalize-space(), '${fileName}')]`,
      ),
    ),
    30000,
  );

  await driver.wait(async () => {
    const text = await row.getText();
    if (/error/i.test(text)) {
      throw new Error(`Download entered error state: ${text}`);
    }

    return (
      /\bComplete\b/i.test(text) &&
      text.includes(
        `${totalBytes.toLocaleString()} / ${totalBytes.toLocaleString()} B`,
      )
    );
  }, 60000);

  return row;
}

async function cancelLiveDownload(fileName) {
  const rowLocator = By.xpath(
    `//*[@role='row' and contains(normalize-space(), '${fileName}')]`,
  );
  const row = await driver.findElement(rowLocator);
  const cancelButtons = await row.findElements(
    By.xpath(".//button[normalize-space()='Cancel']"),
  );
  if (cancelButtons.length === 0) {
    return;
  }

  await clickElement(cancelButtons[0]);
  await driver.wait(async () => {
    const rows = await driver.findElements(rowLocator);
    if (rows.length === 0) {
      return true;
    }

    const statusCells = await rows[0].findElements(
      By.xpath(".//*[contains(normalize-space(), 'Cancelled')]"),
    );
    return statusCells.length > 0;
  }, 20000);
}

async function addDownload(url, destination) {
  await driver.findElement(By.linkText("Downloads")).click();
  await driver.wait(async () => {
    const headings = await driver.findElements(By.css("h1"));
    if (headings.length === 0) {
      return false;
    }

    return (await headings[0].getText()) === "Downloads";
  }, 60000);
  await waitForEngineRunning();

  const newDownloadButton = await driver.findElement(
    By.xpath("//button[normalize-space()='New download']"),
  );
  await driver.wait(async () => {
    const disabled = await newDownloadButton.getAttribute("disabled");
    return disabled === null;
  }, 30000);
  await clickElement(newDownloadButton);

  try {
    await driver.wait(
      until.elementLocated(By.xpath("//h2[normalize-space()='Add download']")),
      10000,
    );
  } catch (error) {
    const bodyText = await driver.findElement(By.css("body")).getText();
    throw new Error(`Add download dialog did not open. Page: ${bodyText}`, {
      cause: error,
    });
  }

  await typeIntoInput(await driver.findElement(By.css("#download-url")), url);
  await typeIntoInput(
    await driver.findElement(By.css("#download-destination")),
    destination,
  );

  const submitButton = await driver.findElement(
    By.xpath("//*[@role='dialog']//button[normalize-space()='Add download']"),
  );
  await driver.wait(async () => {
    const disabled = await submitButton.getAttribute("disabled");
    return disabled === null;
  }, 30000);
  await driver.executeScript(`
    window.__ferroSubmitSeen = false;
    document.querySelector("[role='dialog'] form")?.addEventListener(
      "submit",
      () => {
        window.__ferroSubmitSeen = true;
      },
      { once: true }
    );
  `);
  await submitButton.click();

  await waitForDialogClosed();
}

function startLocalFileServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      localServerRequests.push({
        method: request.method,
        url: request.url,
        at: new Date().toISOString(),
      });
      if (request.url !== `/${localFixtureName}`) {
        response.writeHead(404);
        response.end();
        return;
      }

      response.writeHead(200, {
        "Content-Length": localFixtureBytes.length,
        "Content-Type": "application/octet-stream",
      });
      response.end(localFixtureBytes);
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to resolve local fixture server address"));
        return;
      }

      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/${localFixtureName}`,
      });
    });
  });
}

onShutdown(() => {
  void closeTauriDriver();
});

before(async function () {
  this.timeout(180000);

  const buildResult = spawnSync(
    pnpmBuildCommand.command,
    pnpmBuildCommand.args,
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );
  if (buildResult.status !== 0) {
    throw new Error(
      buildResult.error
        ? `tauri build failed: ${buildResult.error.message}`
        : "tauri build failed; see output above",
    );
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ferro-live-e2e-"));
  downloadDir = path.join(tempRoot, "downloads");
  dbPath = path.join(tempRoot, "ferro.db");
  fs.mkdirSync(downloadDir, { recursive: true });

  const server = await startLocalFileServer();
  localServer = server.server;
  localServerUrl = server.url;

  const tauriDriverPath = resolveTauriDriverPath();
  const nativeDriverPath = await ensureMatchingEdgeDriver();

  tauriDriver = spawn(tauriDriverPath, ["--native-driver", nativeDriverPath], {
    stdio: [null, process.stdout, process.stderr],
    env: {
      ...process.env,
      APPDATA: tempRoot,
      LOCALAPPDATA: tempRoot,
      FERRO_DB_PATH: dbPath,
    },
  });

  await Promise.race([
    waitForPort("127.0.0.1", 4444, 15000),
    new Promise((_, reject) => {
      tauriDriver.once("error", reject);
      tauriDriver.once("exit", (code, signal) => {
        reject(
          new Error(
            `tauri-driver exited before WebDriver opened on port 4444 (code ${code}, signal ${signal}).`,
          ),
        );
      });
    }),
  ]);

  const capabilities = new Capabilities();
  capabilities.set("tauri:options", { application: resolveApplicationPath() });
  capabilities.setBrowserName("wry");

  driver = await new Builder()
    .withCapabilities(capabilities)
    .usingServer("http://localhost:4444/")
    .build();
  await driver.manage().window().setRect({ width: 1400, height: 900 });
});

after(async function () {
  await closeTauriDriver();
  if (localServer) {
    await new Promise((resolve) => localServer.close(resolve));
  }
  if (downloadDir) {
    fs.rmSync(path.dirname(downloadDir), { force: true, recursive: true });
  }
});

describe("Ferro live download behavior", function () {
  this.timeout(150000);

  it("downloads a local HTTP file to completion", async () => {
    await addDownload(localServerUrl, downloadDir);

    await waitForDownloadComplete(localFixtureName, localFixtureBytes.length);

    expect(
      fs
        .readFileSync(path.join(downloadDir, localFixtureName))
        .equals(localFixtureBytes),
    ).to.equal(true);
  });

  it("downloads bytes from Hetzner ASH and can cancel the active task", async function () {
    const preflight = checkLiveDownloadPreflight();
    if (!preflight.ok) {
      console.warn(`Skipping Hetzner live download test: ${preflight.reason}`);
      this.skip();
      return;
    }

    await addDownload(
      testDownloadUrl,
      fs.mkdtempSync(path.join(os.tmpdir(), "ferro-live-hetzner-")),
    );
    const row = await waitForTransferProgress();
    const rowTextContent = await driver.executeScript(
      "return arguments[0].textContent",
      row,
    );
    expect(rowTextContent).to.contain("100MB.bin");

    await cancelLiveDownload("100MB.bin");
  });
});
