type MetadataWaitingProps = {
  title?: string;
  description?: string;
  onCancel: () => void;
};

export const MetadataWaiting = ({
  title = "Fetching torrent metadata",
  description = "Fetching file list before download.",
  onCancel,
}: MetadataWaitingProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 px-4 py-6 backdrop-blur-sm">
    <div className="w-full max-w-md rounded-md border border-border bg-card p-6 shadow-xl">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:border-ring hover:bg-accent"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);
