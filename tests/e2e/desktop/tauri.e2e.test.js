import fs from "fs";
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

function findRepoRoot(startDir) {
  let currentDir = startDir;

  while (true) {
    if (
      fs.existsSync(path.join(currentDir, "package.json")) &&
      fs.existsSync(path.join(currentDir, "src-tauri", "tauri.conf.json"))
    ) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Unable to locate Ferro repo root from ${startDir}`);
    }
    currentDir = parentDir;
  }
}

const repoRoot = findRepoRoot(__dirname);
const binaryName = process.platform === "win32" ? "ferro.exe" : "ferro";
const bundledEdgeDriverPath = path.resolve(repoRoot, "msedgedriver.exe");
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
let dbPath;
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

function createTempDbPath() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferro-e2e-"));
  return path.join(tempDir, "ferro.db");
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

async function ensureMatchingEdgeDriver() {
  if (process.platform !== "win32") {
    throw new Error(
      "Windows Edge/WebView2 WebDriver setup requires process.platform === 'win32'.",
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

function resolveExecutableFromPath(executableNames) {
  const pathValue = process.env.PATH || "";
  const directories = pathValue.split(path.delimiter).filter(Boolean);

  for (const directory of directories) {
    for (const executableName of executableNames) {
      const candidate = path.join(directory, executableName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

async function resolveNativeDriverArgs() {
  if (process.platform === "win32") {
    return ["--native-driver", await ensureMatchingEdgeDriver()];
  }

  if (process.platform === "linux") {
    const webkitDriverPath = resolveExecutableFromPath(["WebKitWebDriver"]);
    if (!webkitDriverPath) {
      throw new Error(
        "WebKitWebDriver was not found in PATH. Install the webkit2gtk-driver package before running Tauri WebDriver e2e on Linux.",
      );
    }

    return ["--native-driver", webkitDriverPath];
  }

  throw new Error(
    "Tauri v2 desktop WebDriver supports Windows and Linux only; macOS desktop WebDriver is not available because WKWebView has no driver tool. Use the CI desktop build smoke job for macOS coverage.",
  );
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

async function waitForDialogClosed() {
  try {
    await driver.wait(async () => {
      const dialogs = await driver.findElements(
        By.xpath("//h2[normalize-space()='Add download']"),
      );
      return dialogs.length === 0;
    }, 10000);
  } catch {
    const urlInput = await driver.findElements(By.css("#download-url"));
    const alerts = await driver.findElements(By.css("[role='alert']"));
    const urlValue =
      urlInput.length > 0
        ? await urlInput[0].getAttribute("value")
        : "<missing>";
    const alertText = alerts.length > 0 ? await alerts[0].getText() : "<none>";
    throw new Error(
      `Add download dialog did not close. URL value: ${urlValue}. Alert: ${alertText}.`,
    );
  }
}

async function waitForPickerClosed() {
  await driver.wait(async () => {
    const pickers = await driver.findElements(
      By.xpath("//h2[normalize-space()='Select files to download']"),
    );
    return pickers.length === 0;
  }, 20000);
}

async function waitForEmptyStateGone() {
  await driver.wait(async () => {
    const emptyStates = await driver.findElements(
      By.xpath("//*[normalize-space()='URL / Magnet / Torrent']"),
    );
    return emptyStates.length === 0;
  }, 20000);
}

async function clearReactInputValue(element) {
  await driver.executeScript(
    `
      const input = arguments[0];
      const descriptor = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      );
      const setValue = descriptor && descriptor.set;
      if (!setValue) {
        input.value = "";
      } else {
        const previousValue = input.value;
        setValue.call(input, "");
        if (input._valueTracker) {
          input._valueTracker.setValue(previousValue);
        }
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    `,
    element,
  );
}

async function typeIntoInput(element, value) {
  await element.click();
  await clearReactInputValue(element);

  for (const character of value) {
    await element.sendKeys(character);
  }

  await driver.wait(
    async () => (await element.getAttribute("value")) === value,
    5000,
  );
}

async function clickElement(element) {
  await driver.executeScript("arguments[0].click()", element);
}

async function closeModalIfPresent() {
  if (!driver) {
    return;
  }
  const cancelButtons = await driver.findElements(
    By.xpath("//*[@role='dialog']//button[normalize-space()='Cancel']"),
  );
  if (cancelButtons.length > 0) {
    const cancelButton = cancelButtons[0];
    await clickElement(cancelButton);
    await driver
      .wait(async () => {
        const remainingButtons = await driver.findElements(
          By.xpath("//*[@role='dialog']//button[normalize-space()='Cancel']"),
        );
        return remainingButtons.length === 0;
      }, 5000)
      .catch(() => {});
  }
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

onShutdown(() => {
  void closeTauriDriver();
});

before(async function () {
  this.timeout(120000);

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

  dbPath = createTempDbPath();

  const tauriDriverPath = resolveTauriDriverPath();
  const nativeDriverArgs = await resolveNativeDriverArgs();

  tauriDriver = spawn(tauriDriverPath, nativeDriverArgs, {
    stdio: [null, process.stdout, process.stderr],
    env: {
      ...process.env,
      FERRO_E2E: "1",
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
});

after(async function () {
  await closeTauriDriver();
});

describe("Ferro desktop app", function () {
  this.timeout(60000);

  beforeEach(async () => {
    await closeModalIfPresent();
  });

  it("renders the downloads screen", async () => {
    const heading = await driver.wait(
      until.elementLocated(By.css("h1")),
      10000,
    );
    const headingText = await heading.getText();
    expect(headingText).to.equal("Downloads");

    const emptyStateTitle = await driver.findElement(
      By.xpath("//*[normalize-space()='URL / Magnet / Torrent']"),
    );
    expect(await emptyStateTitle.isDisplayed()).to.equal(true);
  });

  it("navigates to History and Settings", async () => {
    await driver.findElement(By.linkText("History")).click();
    await driver.wait(
      async () =>
        (await driver.findElement(By.css("h1")).getText()) === "History",
      10000,
    );

    await driver.findElement(By.linkText("Settings")).click();
    await driver.wait(
      async () =>
        (await driver.findElement(By.css("h1")).getText()) === "Settings",
      10000,
    );
  });

  it("keeps settings section navigation inside Settings", async () => {
    await driver.findElement(By.linkText("Settings")).click();
    await driver.wait(
      async () =>
        (await driver.findElement(By.css("h1")).getText()) === "Settings",
      10000,
    );

    await driver
      .findElement(
        By.xpath(
          "//nav[@aria-label='Settings sections']//button[normalize-space()='Downloads']",
        ),
      )
      .click();

    const headingText = await driver.findElement(By.css("h1")).getText();
    expect(headingText).to.equal("Settings");
    const downloadsLinks = await driver.findElements(By.linkText("Downloads"));
    expect(downloadsLinks.length).to.be.greaterThan(0);
  });

  it("updates the task search input", async () => {
    await driver.findElement(By.linkText("Downloads")).click();
    await driver.wait(
      async () =>
        (await driver.findElement(By.css("h1")).getText()) === "Downloads",
      10000,
    );

    const searchInput = await driver.findElement(
      By.css("input[type='search']"),
    );
    await typeIntoInput(searchInput, "example");
    expect(await searchInput.getAttribute("value")).to.equal("example");
  });

  it("opens the add download dialog", async () => {
    await driver.findElement(By.linkText("Downloads")).click();
    await driver.wait(
      async () =>
        (await driver.findElement(By.css("h1")).getText()) === "Downloads",
      10000,
    );

    await driver
      .findElement(By.xpath("//button[normalize-space()='New download']"))
      .click();

    const dialogTitle = await driver.wait(
      until.elementLocated(By.xpath("//h2[normalize-space()='Add download']")),
      10000,
    );
    expect(await dialogTitle.isDisplayed()).to.equal(true);

    const urlInput = await driver.findElement(By.css("#download-url"));
    await typeIntoInput(urlInput, "https://example.com/file.zip");

    await driver
      .findElement(
        By.xpath(
          "//*[@role='dialog']//button[normalize-space()='Add download']",
        ),
      )
      .click();

    await waitForDialogClosed();
  });

  it("adds a magnet download with file selection", async () => {
    await driver.findElement(By.linkText("Downloads")).click();
    await driver.wait(
      async () =>
        (await driver.findElement(By.css("h1")).getText()) === "Downloads",
      10000,
    );

    await driver
      .findElement(By.xpath("//button[normalize-space()='New download']"))
      .click();

    await driver.wait(
      until.elementLocated(By.xpath("//h2[normalize-space()='Add download']")),
      10000,
    );

    const urlInput = await driver.findElement(By.css("#download-url"));
    await typeIntoInput(urlInput, "magnet:?xt=urn:btih:abcd&dn=Example");

    await driver
      .findElement(
        By.xpath(
          "//*[@role='dialog']//button[normalize-space()='Add download']",
        ),
      )
      .click();

    const pickerTitle = await driver.wait(
      until.elementLocated(
        By.xpath("//h2[normalize-space()='Select files to download']"),
      ),
      10000,
    );
    expect(await pickerTitle.isDisplayed()).to.equal(true);

    const selectAllButton = await driver.findElement(
      By.xpath("//button[normalize-space()='Select all']"),
    );
    await selectAllButton.click();

    const addTorrentButton = await driver.findElement(
      By.xpath("//button[normalize-space()='Add torrent']"),
    );
    await driver.wait(async () => {
      const disabled = await addTorrentButton.getAttribute("disabled");
      return disabled === null;
    }, 10000);

    await driver
      .findElement(By.xpath("//button[normalize-space()='Add torrent']"))
      .click();

    await waitForPickerClosed();
    await waitForEmptyStateGone();

    const detailsButton = await driver.wait(
      until.elementLocated(By.css("button[aria-label='Details']")),
      20000,
    );
    expect(await detailsButton.isDisplayed()).to.equal(true);

    await closeModalIfPresent();
  });

  it("shows validation error for unsupported URL scheme", async () => {
    await driver
      .findElement(By.xpath("//button[normalize-space()='New download']"))
      .click();

    await driver.wait(
      until.elementLocated(By.xpath("//h2[normalize-space()='Add download']")),
      10000,
    );

    const urlInput = await driver.findElement(By.css("#download-url"));
    await typeIntoInput(urlInput, "file://example.txt");

    await driver
      .findElement(
        By.xpath(
          "//*[@role='dialog']//button[normalize-space()='Add download']",
        ),
      )
      .click();

    const alert = await driver.wait(
      until.elementLocated(By.css("[role='alert']")),
      10000,
    );
    expect(await alert.getText()).to.equal(
      "Use an http, https, ftp, or magnet link.",
    );

    await closeModalIfPresent();
    await waitForDialogClosed();
  });

  it("shows validation error when submitting without a URL", async () => {
    await driver
      .findElement(By.xpath("//button[normalize-space()='New download']"))
      .click();

    await driver.wait(
      until.elementLocated(By.xpath("//h2[normalize-space()='Add download']")),
      10000,
    );

    await driver
      .findElement(
        By.xpath(
          "//*[@role='dialog']//button[normalize-space()='Add download']",
        ),
      )
      .click();

    const alert = await driver.wait(
      until.elementLocated(By.css("[role='alert']")),
      10000,
    );
    expect(await alert.getText()).to.equal("Enter a URL to download.");

    await closeModalIfPresent();
    await waitForDialogClosed();
  });
});
