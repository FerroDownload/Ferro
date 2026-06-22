<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" alt="Ferro logo">

# Ferro

_A fast, modern desktop download manager powered by Tauri v2 and aria2_

[![CI](https://github.com/FerroDownload/Ferro/actions/workflows/ci.yml/badge.svg?style=flat-square)](https://github.com/FerroDownload/Ferro/actions/workflows/ci.yml)
[![Release](https://github.com/FerroDownload/Ferro/actions/workflows/release.yml/badge.svg?style=flat-square)](https://github.com/FerroDownload/Ferro/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

⭐ If you like this project, star it on GitHub!

[Website (ferro.lol)](https://ferro.lol) • [Features](#features) • [Platform Support](#platform-support) • [Installation](#installation) • [Usage](#usage) • [Development](#development)

</div>

---

Ferro is a fast, modern desktop download manager built with **Tauri v2** and powered by the **aria2** engine. Ferro downloads over HTTP, HTTPS, FTP, BitTorrent, and magnet links behind a clean, keyboard-friendly interface that stays smooth even with thousands of active tasks.

## Features

- **Multi-protocol downloads** — HTTP, HTTPS, FTP, BitTorrent, and `magnet:` links.
- **Torrent control** — resolve magnet/torrent metadata and pick exactly which files to download.
- **Built for scale** — a virtualized task list stays at 60 fps with 1,000+ tasks.
- **Full task control** — pause, resume, cancel, retry, reorder, and bulk pause/resume.
- **Instant feedback** — optimistic UI updates respond in under 100 ms.
- **Live search & filters** — find downloads by file name or source across Active and History views.
- **Crash-safe engine** — the bundled aria2 sidecar auto-recovers, with a visible restart banner and bounded retry.
- **Resume across restarts** — in-progress downloads are restored automatically on launch.
- **System tray** — live speed display and quick access while running in the background.
- **Magnet deep links** — open `magnet:` links straight from your browser into Ferro.
- **Desktop notifications** and optional **launch on startup**.
- **In-app auto-update** — signed updates delivered through GitHub Releases.
- **Accessible & themed** — WCAG 2.1 AA target, keyboard navigation, and light/dark/system themes.

## Platform support

| Platform | Architecture     | Status      |
| -------- | ---------------- | ----------- |
| Windows  | x86_64 / aarch64 | ✅ Released |
| macOS    | x86_64 / aarch64 | ✅ Released |
| Linux    | x86_64 / aarch64 | ✅ Released |

## Installation

1. Download the latest installer for your platform (Windows `.msi`/`.exe`, macOS `.dmg`, or Linux `.deb`/`.AppImage`) from the [**Releases**](https://github.com/FerroDownload/Ferro/releases/latest) page.
2. Install and launch **Ferro**.

Ferro checks for updates on startup and can install signed updates in place — no manual re-download required.

## Usage

- **Add a download** — press <kbd>Ctrl</kbd>+<kbd>N</kbd>, then paste a URL or magnet link, or pick a `.torrent` file.
- **Torrents** — after metadata resolves, choose which files to download before starting.
- **Manage tasks** — pause, resume, cancel, or retry from each task row, or pause/resume everything at once.
- **Find tasks** — use the always-visible search box to filter by file name or source URL.
- **History** — completed, cancelled, and failed downloads are kept in the History view.

Downloads, concurrency limits, connection limits, speed limits, BitTorrent options, and tracker auto-update can all be adjusted in **Settings**.

<details>
<summary>🛠️ Development & Architecture Details</summary>

## Build from source

### Prerequisites

- **Rust** (stable) via [rustup](https://rustup.rs/) with the Tauri v2 toolchain.
- **Node.js 20+** and **pnpm 10** (`corepack enable` or install pnpm directly).
- Platform build dependencies for Tauri v2 — see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

### Setup

```bash
pnpm install
pnpm setup:aria2   # fetches the pinned aria2c 1.37.0 sidecar for your platform
```

`pnpm setup:aria2` downloads the official aria2 1.37.0 release asset matching your target platform and architecture, verifies its pinned SHA-256 hash, and places the binary in `src-tauri/resources/`. It also runs automatically before `tauri dev` and `tauri build`.

### Develop

```bash
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

## Testing

### Frontend

Frontend (Vitest + React Testing Library) and project checks:

```bash
pnpm run lint          # ESLint
pnpm run format:check  # Prettier
pnpm exec tsc --noEmit # TypeScript type check
pnpm test              # unit + integration tests
```

### Backend

Backend (Rust) checks, run from `src-tauri/`:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
```

### End-to-end (E2E)

End-to-end testing (Tauri WebDriver) — drives a real application build using WebDriver. Note that Tauri's native WebDriver infra currently **supports Windows and Linux only** (as macOS's WKWebView does not ship with an out-of-the-box driver tool):

```bash
cargo install tauri-driver --locked   # one-time
pnpm run test:e2e
```

- **Windows**: The E2E harness detects the installed Edge/WebView2 runtime version, downloads the matching `msedgedriver`, and connects using `tauri-driver`.
- **Linux**: The harness expects `WebKitWebDriver` in the system path (install the `webkit2gtk-driver` package on Debian/Ubuntu-based distributions).
- **macOS**: Since WKWebView lacks a native driver tool, E2E tests are unsupported. Use the unit and smoke tests for macOS coverage.

For more details, see the [Tauri WebDriver documentation](https://v2.tauri.app/develop/tests/webdriver/).

## Architecture

Ferro is a Tauri v2 desktop app.

- **Frontend** (`src/`) — React 19 + Vite + Tailwind CSS + shadcn/ui, organized by feature (`tasks`, `settings`, `engine`, `updater`, `onboarding`). TanStack Query manages server state; Zustand manages UI state.
- **Backend** (`src-tauri/`) — Rust owns the bundled `aria2c` sidecar and exposes a typed Tauri command boundary. The aria2 JSON-RPC endpoint binds to localhost on an OS-assigned random port with an in-memory, per-launch secret. Task history is stored in SQLite via `sqlx`; settings use `tauri-plugin-store`.

</details>
