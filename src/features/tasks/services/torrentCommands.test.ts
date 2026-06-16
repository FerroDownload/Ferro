import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import { addTorrentTask, fetchTorrentMetadata } from "./torrentCommands";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const metadata = {
  info_hash: "abcd",
  name: "Example",
  total_bytes: 1024,
  files: [
    {
      index: 1,
      path: "Example/file.bin",
      bytes: 1024,
      completed_bytes: 0,
      selected: true,
    },
  ],
  trackers: ["udp://tracker"],
  peers: 2,
  seeders: 1,
};

describe("torrentCommands", () => {
  it("fetches metadata with magnet source", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(metadata);

    const result = await fetchTorrentMetadata({
      magnet: "magnet:?xt=urn:btih:abcd",
    });

    expect(invoke).toHaveBeenCalledWith("torrent_metadata", {
      source: { magnet: "magnet:?xt=urn:btih:abcd" },
    });
    expect(result.info_hash).toBe("abcd");
  });

  it("fetches metadata with torrent file", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(metadata);

    await fetchTorrentMetadata({
      torrentPath: "C:/Users/Test/Downloads/file.torrent",
    });

    expect(invoke).toHaveBeenCalledWith("torrent_metadata", {
      source: { torrentPath: "C:/Users/Test/Downloads/file.torrent" },
    });
  });

  it("invokes add_torrent_task", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await addTorrentTask({
      source: { magnet: "magnet:?xt=urn:btih:abcd" },
      destination: "C:/Users/Test/Downloads",
      selectedFiles: ["Example/file.bin"],
      selectedIndices: [1],
      seedRatioTarget: 1.0,
      infoHash: "abcd",
      displayName: "Example",
      metadata,
    });

    expect(invoke).toHaveBeenCalledWith("add_torrent_task", {
      payload: {
        source: { magnet: "magnet:?xt=urn:btih:abcd" },
        destination: "C:/Users/Test/Downloads",
        selectedFiles: ["Example/file.bin"],
        selectedIndices: [1],
        seedRatioTarget: 1.0,
        infoHash: "abcd",
        displayName: "Example",
        metadata,
      },
    });
  });
});
