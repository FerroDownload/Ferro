import { invoke } from "@tauri-apps/api/core";

import { parseTorrentMetadata } from "@/shared/lib/rpcSchemas";
import type { TorrentMetadata } from "@/shared/lib/types";

export type TorrentSource = {
  magnet?: string;
  torrentPath?: string;
};

export type AddTorrentPayload = {
  source: TorrentSource;
  destination: string;
  selectedFiles: string[];
  selectedIndices: number[];
  seedRatioTarget: number;
  infoHash: string;
  displayName: string;
  metadata: TorrentMetadata;
};

export async function fetchTorrentMetadata(
  source: TorrentSource,
): Promise<TorrentMetadata> {
  const response = await invoke("torrent_metadata", { source });
  return parseTorrentMetadata(response);
}

export async function addTorrentTask(
  payload: AddTorrentPayload,
): Promise<void> {
  await invoke("add_torrent_task", { payload });
}

export async function fetchStoredTorrentMetadata(
  infoHash: string,
): Promise<TorrentMetadata> {
  const response = await invoke("get_torrent_metadata", { infoHash });
  return parseTorrentMetadata(response);
}
