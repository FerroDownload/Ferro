import type { TorrentMetadata } from "@/shared/lib/types";
import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";

type TorrentDetailsProps = {
  metadata: TorrentMetadata;
  onClose: () => void;
};

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  if (value >= 1024 ** 3) {
    return `${(value / 1024 ** 3).toFixed(2)} GB`;
  }
  if (value >= 1024 ** 2) {
    return `${(value / 1024 ** 2).toFixed(2)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(2)} KB`;
  }
  return `${value} B`;
};

export const TorrentDetails = ({ metadata, onClose }: TorrentDetailsProps) => {
  const seedRatioTarget =
    useSettingsStore((s) => s.settings)?.seed_ratio_target ?? 1.0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col rounded-md border border-border bg-card p-6 text-card-foreground shadow-xl">
        <header className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Torrent details
          </p>
          <h2 className="text-xl font-semibold">{metadata.name}</h2>
          <p className="text-sm text-muted-foreground">
            {metadata.files.length} files · {formatBytes(metadata.total_bytes)}
          </p>
        </header>

        <div className="mt-4 grid gap-3 rounded-md border border-border bg-background p-4 text-sm text-foreground sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Peers</p>
            <p className="text-lg font-semibold">{metadata.peers}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Seeders</p>
            <p className="text-lg font-semibold">{metadata.seeders}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Seed ratio
            </p>
            <p className="text-lg font-semibold">
              {seedRatioTarget.toFixed(1)}x
            </p>
          </div>
        </div>

        <div className="mt-4 min-h-0 max-h-80 flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-background p-4 text-sm text-foreground">
          {metadata.files.map((file) => (
            <div
              key={file.index}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate">{file.path}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.completed_bytes)} /{" "}
                  {formatBytes(file.bytes)}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {file.selected ? "Selected" : "Skipped"}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:border-ring hover:bg-accent"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
