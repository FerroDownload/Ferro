import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock3,
  ListFilter,
  PauseCircle,
  PlayCircle,
  XCircle,
} from "lucide-react";
import {
  createHashRouter,
  createMemoryRouter,
  Link,
  RouterProvider,
} from "react-router";
import { EngineFailedView } from "@/features/engine/components/EngineFailedView";
import { RestartBanner } from "@/features/engine/components/RestartBanner";
import { useEngineStatus } from "@/features/engine/hooks/useEngineStatus";
import { useStartupUpdateCheck } from "@/features/updater/hooks/useStartupUpdateCheck";
import {
  AddDownloadDialog,
  type AddDownloadSubmission,
} from "@/features/tasks/components/AddDownloadDialog";
import { HistoryList } from "@/features/tasks/components/HistoryList";
import { MetadataWaiting } from "@/features/tasks/components/MetadataWaiting";
import { TaskList } from "@/features/tasks/components/TaskList";
import {
  filterTasksBySearchQuery,
  TaskSearchInput,
} from "@/features/tasks/components/TaskSearchInput";
import { SettingsPage } from "@/features/settings/components/SettingsPage";
import { Toolbar } from "@/features/tasks/components/Toolbar";
import { TorrentFilePicker } from "@/features/tasks/components/TorrentFilePicker";
import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";
import { useTasks } from "@/features/tasks/hooks/useTasks";
import { validateDownloadUrl } from "@/features/tasks/lib/validators";
import {
  addTask,
  addTorrentTask,
  pauseAllTasks,
  resumeAllTasks,
} from "@/features/tasks/services/taskCommands";
import {
  fetchTorrentMetadata,
  type TorrentSource,
} from "@/features/tasks/services/torrentCommands";
import type { TorrentMetadata } from "@/shared/lib/types";
import { LiveAnnouncer } from "@/shared/components/LiveAnnouncer";
import { SessionDetails } from "@/shared/components/SessionDetails";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { WorkspaceFrame } from "@/shared/components/WorkspaceFrame";
import {
  invokeEngineOpenLogsFolder,
  invokeEngineRetry,
  invokeUpdaterCheck,
} from "@/shared/lib/tauri";
import AppShell from "./App";
import { registerProtocolListener } from "./protocolListener";
import { useAppShortcuts } from "./shortcuts";

type ActiveStatusFilter = "all" | "active" | "waiting" | "paused";
type HistoryStatusFilter = "all" | "complete" | "stopped" | "error";

const activeStatusOptions: Array<{
  label: string;
  value: ActiveStatusFilter;
  icon?: typeof ListFilter;
}> = [
  { label: "All", value: "all", icon: ListFilter },
  { label: "Active", value: "active", icon: PlayCircle },
  { label: "Queued", value: "waiting", icon: Clock3 },
  { label: "Paused", value: "paused", icon: PauseCircle },
];

const historyStatusOptions: Array<{
  label: string;
  value: HistoryStatusFilter;
  icon?: typeof ListFilter;
}> = [
  { label: "All", value: "all", icon: Circle },
  { label: "Complete", value: "complete", icon: CheckCircle2 },
  { label: "Cancelled", value: "stopped", icon: XCircle },
  { label: "Failed", value: "error", icon: AlertCircle },
];

const TasksRoute = () => {
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [initialUrl, setInitialUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ActiveStatusFilter>("all");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { activeTasks, reload } = useTasks();
  const { engine, mutationsAllowed } = useEngineStatus();
  useStartupUpdateCheck(engine);
  const settings = useSettingsStore((state) => state.settings);
  const [metadata, setMetadata] = useState<TorrentMetadata | null>(null);
  const [metadataSource, setMetadataSource] = useState<TorrentSource | null>(
    null,
  );
  const [metadataDestination, setMetadataDestination] = useState("");
  const [metadataLoading, setMetadataLoading] = useState(false);
  const requestId = useRef(0);
  const defaultDestination = settings?.download_directory || "";
  const statusFilteredActiveTasks = useMemo(
    () =>
      statusFilter === "all"
        ? activeTasks
        : activeTasks.filter((task) => task.status === statusFilter),
    [activeTasks, statusFilter],
  );
  const visibleActiveTasks = useMemo(
    () => filterTasksBySearchQuery(statusFilteredActiveTasks, searchQuery),
    [searchQuery, statusFilteredActiveTasks],
  );
  const progressAnnouncements = useMemo(
    () =>
      activeTasks
        .filter((task) => task.status === "active")
        .map((task) => ({
          taskId: task.id,
          displayName: task.display_name,
          progressPercent: task.progress_percent,
        })),
    [activeTasks],
  );
  const activeStats = useMemo(
    () => [
      {
        label: "active",
        value: activeTasks.filter((task) => task.status === "active").length,
      },
      {
        label: "queued",
        value: activeTasks.filter((task) => task.status === "waiting").length,
      },
      {
        label: "paused",
        value: activeTasks.filter((task) => task.status === "paused").length,
      },
    ],
    [activeTasks],
  );

  const openAddDownloadDialog = useCallback(
    (url = "") => {
      if (!mutationsAllowed) {
        return;
      }

      setInitialUrl(url);
      setDialogOpen(true);
    },
    [mutationsAllowed],
  );

  const openProtocolDownloadDialog = useCallback((url: string) => {
    setInitialUrl(url);
    setDialogOpen(true);
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let disposed = false;

    void registerProtocolListener(openProtocolDownloadDialog)
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        cleanup = unlisten;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [openProtocolDownloadDialog]);

  const handleEngineRetry = useCallback(async () => {
    try {
      await invokeEngineRetry();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to retry engine";
      window.alert(message);
    }
  }, []);

  const handleOpenLogsFolder = useCallback(async () => {
    try {
      await invokeEngineOpenLogsFolder();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to open logs folder";
      window.alert(message);
    }
  }, []);

  const handlePasteUrlShortcut = useCallback(async () => {
    const clipboardText = await navigator.clipboard?.readText().catch(() => "");
    const trimmed = clipboardText?.trim() ?? "";
    if (!validateDownloadUrl(trimmed).isValid) {
      return;
    }

    openAddDownloadDialog(trimmed);
  }, [openAddDownloadDialog]);

  const pauseAllActiveTasks = useCallback(async () => {
    await pauseAllTasks();
    await reload();
  }, [reload]);

  const resumeAllPausedTasks = useCallback(async () => {
    await resumeAllTasks();
    await reload();
  }, [reload]);

  useAppShortcuts({
    onNewDownload: () => openAddDownloadDialog(),
    onPasteUrl: () => {
      void handlePasteUrlShortcut();
    },
    onPause: () => {
      void pauseAllActiveTasks();
    },
    onResume: () => {
      void resumeAllPausedTasks();
    },
    onFocusSearch: () => {
      searchInputRef.current?.focus();
    },
  });

  const startMetadataFetch = async (
    source: TorrentSource,
    destination: string,
  ) => {
    const nextId = requestId.current + 1;
    requestId.current = nextId;
    setMetadataSource(source);
    setMetadataDestination(destination);
    setMetadata(null);
    setMetadataLoading(true);
    try {
      const response = await fetchTorrentMetadata(source);
      if (requestId.current !== nextId) {
        return;
      }
      setMetadata(response);
    } catch (error) {
      if (requestId.current !== nextId) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Unable to fetch metadata";
      window.alert(message);
      setMetadataSource(null);
    } finally {
      if (requestId.current === nextId) {
        setMetadataLoading(false);
      }
    }
  };

  const handleMetadataCancel = () => {
    requestId.current += 1;
    setMetadataLoading(false);
    setMetadataSource(null);
    setMetadata(null);
  };

  const handleTorrentConfirm = async (payload: {
    selectedFiles: string[];
    selectedIndices: number[];
  }) => {
    if (!metadata || !metadataSource) {
      return;
    }
    try {
      await addTorrentTask({
        source: metadataSource,
        destination: metadataDestination,
        selectedFiles: payload.selectedFiles,
        selectedIndices: payload.selectedIndices,
        seedRatioTarget: settings?.seed_ratio_target ?? 1.0,
        metadata,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unable to add torrent";
      window.alert(message);
      return;
    } finally {
      setMetadata(null);
      setMetadataSource(null);
    }
    void reload();
  };

  const handleAddDownload = async (payload: AddDownloadSubmission) => {
    if (payload.kind === "torrent") {
      setDialogOpen(false);
      await startMetadataFetch(
        { torrentPath: payload.torrentPath },
        payload.destination || defaultDestination,
      );
      return;
    }

    const trimmed = payload.url.trim();
    if (trimmed.startsWith("magnet:")) {
      setDialogOpen(false);
      await startMetadataFetch(
        { magnet: trimmed },
        payload.destination || defaultDestination,
      );
      return;
    }

    await addTask(trimmed, payload.destination || defaultDestination);
    setDialogOpen(false);
    await reload();
  };

  const sessionDetails = useMemo(
    () => [
      {
        label: "Destination",
        value: defaultDestination || "Not set",
      },
      {
        label: "Engine",
        value: engine?.process_state ?? "unknown",
      },
    ],
    [defaultDestination, engine],
  );

  return (
    <>
      <LiveAnnouncer progressAnnouncements={progressAnnouncements} />
      <WorkspaceFrame
        title="Downloads"
        stats={activeStats}
        controlsLabel="Queue controls"
        contentLabel="Download queue"
        controls={
          <>
            <StatusFilter
              label="Download status"
              value={statusFilter}
              options={activeStatusOptions}
              onValueChange={setStatusFilter}
            />
            <TaskSearchInput
              ref={searchInputRef}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              label="Search downloads"
              variant="inline"
            />
            <Toolbar
              mutationsAllowed={mutationsAllowed}
              onNewDownload={() => openAddDownloadDialog()}
              onPauseAll={() => {
                void pauseAllActiveTasks();
              }}
              onResumeAll={() => {
                void resumeAllPausedTasks();
              }}
            />
          </>
        }
        aside={<SessionDetails details={sessionDetails} />}
      >
        <RestartBanner
          hidden={engine?.process_state !== "restarting"}
          restartAttempts={engine?.restart_attempts_in_current_burst ?? 0}
        />
        <EngineFailedView
          engine={engine}
          onRetry={handleEngineRetry}
          onOpenLogsFolder={handleOpenLogsFolder}
        />
        <TaskList
          tasks={visibleActiveTasks}
          mutationsAllowed={mutationsAllowed}
          onAddDownload={() => openAddDownloadDialog()}
          emptySearchQuery={
            activeTasks.length > 0
              ? searchQuery || (statusFilter === "all" ? "" : statusFilter)
              : ""
          }
        />
      </WorkspaceFrame>
      <AddDownloadDialog
        isOpen={isDialogOpen}
        tasks={activeTasks}
        initialUrl={initialUrl}
        disabled={!mutationsAllowed}
        onClose={() => {
          setDialogOpen(false);
          setInitialUrl("");
        }}
        onSubmit={handleAddDownload}
      />
      {metadataLoading ? (
        <MetadataWaiting onCancel={handleMetadataCancel} />
      ) : null}
      {metadata && metadataSource ? (
        <TorrentFilePicker
          metadata={metadata}
          destination={metadataDestination}
          onCancel={handleMetadataCancel}
          onConfirm={handleTorrentConfirm}
        />
      ) : null}
    </>
  );
};

const HistoryRoute = () => <HistoryRouteContent />;

const HistoryRouteContent = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { historyTasks } = useTasks();
  const { mutationsAllowed } = useEngineStatus();
  const statusFilteredHistoryTasks = useMemo(
    () =>
      statusFilter === "all"
        ? historyTasks
        : historyTasks.filter((task) => task.status === statusFilter),
    [historyTasks, statusFilter],
  );
  const visibleHistoryTasks = useMemo(
    () => filterTasksBySearchQuery(statusFilteredHistoryTasks, searchQuery),
    [searchQuery, statusFilteredHistoryTasks],
  );
  const historyStats = useMemo(
    () => [
      {
        label: "complete",
        value: historyTasks.filter((task) => task.status === "complete").length,
      },
      {
        label: "cancelled",
        value: historyTasks.filter((task) => task.status === "stopped").length,
      },
      {
        label: "failed",
        value: historyTasks.filter((task) => task.status === "error").length,
      },
    ],
    [historyTasks],
  );
  const historyDetails = useMemo(
    () => [
      {
        label: "Records",
        value: String(historyTasks.length),
      },
      {
        label: "Complete",
        value: String(
          historyTasks.filter((task) => task.status === "complete").length,
        ),
      },
      {
        label: "Cancelled",
        value: String(
          historyTasks.filter((task) => task.status === "stopped").length,
        ),
      },
      {
        label: "Failed",
        value: String(
          historyTasks.filter((task) => task.status === "error").length,
        ),
      },
    ],
    [historyTasks],
  );

  useAppShortcuts({
    onFocusSearch: () => {
      searchInputRef.current?.focus();
    },
  });

  return (
    <WorkspaceFrame
      title="History"
      stats={historyStats}
      controlsLabel="History controls"
      contentLabel="History records"
      controls={
        <>
          <StatusFilter
            label="History outcome"
            value={statusFilter}
            options={historyStatusOptions}
            onValueChange={setStatusFilter}
          />
          <TaskSearchInput
            ref={searchInputRef}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            label="Search history"
            variant="inline"
          />
        </>
      }
      aside={
        <SessionDetails
          title="Records"
          ariaLabel="History details"
          details={historyDetails}
        />
      }
    >
      <HistoryList
        tasks={visibleHistoryTasks}
        mutationsAllowed={mutationsAllowed}
        emptySearchQuery={
          historyTasks.length > 0
            ? searchQuery || (statusFilter === "all" ? "" : statusFilter)
            : ""
        }
      />
    </WorkspaceFrame>
  );
};

const SettingsRoute = () => {
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [isChecking, setChecking] = useState(false);

  const handleCheckForUpdates = async () => {
    setChecking(true);
    setUpdateMessage(null);
    try {
      const result = await invokeUpdaterCheck();
      setUpdateMessage(
        result.available
          ? `Ferro ${result.update?.version ?? "update"} is available.`
          : "Ferro is up to date.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to check for updates";
      setUpdateMessage(message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <SettingsPage
      isCheckingForUpdates={isChecking}
      updateMessage={updateMessage}
      onCheckForUpdates={() => {
        void handleCheckForUpdates();
      }}
      onToast={(notification) => {
        window.alert(notification.message);
      }}
    />
  );
};

const NotFoundRoute = () => (
  <section className="flex min-h-0 flex-1 flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
    <header className="border-b border-border/80 pb-3">
      <h1 className="text-xl font-semibold text-foreground">Not found</h1>
    </header>
    <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border bg-card p-8 text-center">
      <div className="max-w-sm space-y-4">
        <p className="text-sm text-muted-foreground">
          This view is not available.
        </p>
        <Link
          to="/"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-1 focus-visible:ring-ring"
        >
          Downloads
        </Link>
      </div>
    </div>
  </section>
);

// Ref: https://github.com/remix-run/react-router/blob/main/docs/start/data/routing.md
export const appRoutes = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <TasksRoute /> },
      { path: "history", element: <HistoryRoute /> },
      { path: "settings", element: <SettingsRoute /> },
      { path: "*", element: <NotFoundRoute /> },
    ],
  },
];

export const router = createHashRouter(appRoutes);

export const createAppRouter = (initialEntries: string[] = ["/"]) =>
  createMemoryRouter(appRoutes, { initialEntries });

export const AppRouter = () => <RouterProvider router={router} />;
