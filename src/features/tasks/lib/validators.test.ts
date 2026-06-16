import { describe, expect, it } from "vitest";

import {
  findDuplicateTask,
  normalizeSourceUri,
  validateDownloadUrl,
} from "./validators";
import type { Task } from "@/shared/lib/types";

const createTask = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  aria2_gid: null,
  source_uri: "https://example.com/file.zip",
  display_name: "Example File",
  destination_path: "C:/Users/Test/Downloads/file.zip",
  status: "active",
  progress_percent: 10,
  downloaded_bytes: 100,
  total_bytes: 1000,
  download_speed_bps: 0,
  upload_speed_bps: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  completed_at: null,

  uploaded_bytes: 0,

  orphan_imported: false,
  error_message: null,
  is_torrent: false,
  torrent_info_hash: null,
  selected_files: null,
  ...overrides,
});

describe("validateDownloadUrl", () => {
  it("rejects empty URLs", () => {
    expect(validateDownloadUrl("")).toEqual({
      isValid: false,
      error: "Enter a URL to download.",
    });
  });

  it("rejects malformed URLs", () => {
    expect(validateDownloadUrl("not-a-url")).toEqual({
      isValid: false,
      error: "Enter a valid URL.",
    });
  });

  it("rejects unsupported protocols", () => {
    expect(validateDownloadUrl("file://local/path")).toEqual({
      isValid: false,
      error: "Use an http, https, ftp, or magnet link.",
    });
  });

  it("accepts http/https/ftp URLs", () => {
    expect(validateDownloadUrl("https://example.com/file.zip")).toEqual({
      isValid: true,
      error: null,
    });
    expect(validateDownloadUrl("ftp://example.com/file.zip")).toEqual({
      isValid: true,
      error: null,
    });
    expect(
      validateDownloadUrl(
        "magnet:?xt=urn:btih:abcdef&dn=Example&tr=udp://tracker",
      ),
    ).toEqual({
      isValid: true,
      error: null,
    });
  });
});

describe("findDuplicateTask", () => {
  it("returns the matching task when url exists", () => {
    const tasks = [
      createTask({ id: "task-1", source_uri: "https://example.com/file.zip" }),
    ];

    expect(findDuplicateTask("https://example.com/file.zip", tasks)?.id).toBe(
      "task-1",
    );
  });

  it("trims url before comparing", () => {
    const tasks = [
      createTask({ id: "task-2", source_uri: "https://example.com/file.zip" }),
    ];

    expect(
      findDuplicateTask("  https://example.com/file.zip ", tasks)?.id,
    ).toBe("task-2");
  });

  it("returns null when no matches", () => {
    const tasks = [
      createTask({ id: "task-3", source_uri: "https://example.com/file.zip" }),
    ];

    expect(
      findDuplicateTask("https://example.com/other.zip", tasks),
    ).toBeNull();
  });

  it("compares normalized http, https, and ftp source uris", () => {
    const tasks = [
      createTask({
        id: "task-http",
        source_uri: "HTTP://Example.COM:80/File.Zip?Token=ABC#Part",
      }),
      createTask({
        id: "task-https",
        source_uri: "https://Example.COM:443/Path/File.Zip",
      }),
      createTask({
        id: "task-ftp",
        source_uri: "ftp://Example.COM:21/Archive/File.Zip",
      }),
    ];

    expect(
      findDuplicateTask(" http://example.com/File.Zip?Token=ABC#Part ", tasks)
        ?.id,
    ).toBe("task-http");
    expect(
      findDuplicateTask("https://example.com/Path/File.Zip", tasks)?.id,
    ).toBe("task-https");
    expect(
      findDuplicateTask("ftp://example.com/Archive/File.Zip", tasks)?.id,
    ).toBe("task-ftp");
  });

  it("preserves path, query, and fragment casing when comparing URLs", () => {
    const tasks = [
      createTask({
        id: "task-4",
        source_uri: "https://example.com/File.Zip?Token=ABC#Part",
      }),
    ];

    expect(
      findDuplicateTask("https://example.com/file.zip?Token=ABC#Part", tasks),
    ).toBeNull();
    expect(
      findDuplicateTask("https://example.com/File.Zip?token=ABC#Part", tasks),
    ).toBeNull();
    expect(
      findDuplicateTask("https://example.com/File.Zip?Token=ABC#part", tasks),
    ).toBeNull();
  });

  it("lowercases only the magnet scheme and preserves magnet payload casing", () => {
    const tasks = [
      createTask({
        id: "task-magnet",
        source_uri: "MAGNET:?xt=urn:btih:ABCDEF&dn=Example",
      }),
    ];

    expect(
      findDuplicateTask("magnet:?xt=urn:btih:ABCDEF&dn=Example", tasks)?.id,
    ).toBe("task-magnet");
    expect(
      findDuplicateTask("magnet:?xt=urn:btih:abcdef&dn=Example", tasks),
    ).toBeNull();
    expect(
      findDuplicateTask("magnet:?xt=urn:btih:ABCDEF&dn=example", tasks),
    ).toBeNull();
  });

  it("only reports duplicates for active-view task statuses", () => {
    const historyTasks: Task[] = [
      createTask({ id: "complete", status: "complete" }),
      createTask({ id: "stopped", status: "stopped" }),
      createTask({ id: "error", status: "error" }),
    ];

    expect(
      findDuplicateTask("https://example.com/file.zip", historyTasks),
    ).toBeNull();

    expect(
      findDuplicateTask("https://example.com/file.zip", [
        createTask({ id: "paused", status: "paused" }),
      ])?.id,
    ).toBe("paused");
  });
});

describe("normalizeSourceUri", () => {
  it.each([
    [
      " HTTP://Example.COM:80/File.Zip?Token=ABC#Part ",
      "http://example.com/File.Zip?Token=ABC#Part",
    ],
    [
      "HTTPS://Example.COM:443/File.Zip?Token=ABC#Part",
      "https://example.com/File.Zip?Token=ABC#Part",
    ],
    [
      "FTP://Example.COM:21/File.Zip?Token=ABC#Part",
      "ftp://example.com/File.Zip?Token=ABC#Part",
    ],
    [
      "http://Example.COM:8080/File.Zip?Token=ABC#Part",
      "http://example.com:8080/File.Zip?Token=ABC#Part",
    ],
    [
      "MAGNET:?xt=urn:btih:ABCDEF&dn=Example",
      "magnet:?xt=urn:btih:ABCDEF&dn=Example",
    ],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeSourceUri(input)).toBe(expected);
  });
});
