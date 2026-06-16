import type { Task } from "@/shared/lib/types";

type ValidationResult = {
  isValid: boolean;
  error: string | null;
};

const allowedProtocols = new Set(["http:", "https:", "ftp:", "magnet:"]);
const activeDuplicateStatuses = new Set<Task["status"]>([
  "active",
  "waiting",
  "paused",
]);

export function validateDownloadUrl(url: string): ValidationResult {
  const trimmed = url.trim();
  if (!trimmed) {
    return { isValid: false, error: "Enter a URL to download." };
  }

  try {
    const parsed = new URL(trimmed);
    if (!allowedProtocols.has(parsed.protocol)) {
      return {
        isValid: false,
        error: "Use an http, https, ftp, or magnet link.",
      };
    }
  } catch {
    return { isValid: false, error: "Enter a valid URL." };
  }

  return { isValid: true, error: null };
}

export function findDuplicateTask(url: string, tasks: Task[]): Task | null {
  const normalized = normalizeSourceUri(url);
  if (!normalized) {
    return null;
  }

  return (
    tasks.find(
      (task) =>
        activeDuplicateStatuses.has(task.status) &&
        normalizeSourceUri(task.source_uri) === normalized,
    ) ?? null
  );
}

export function normalizeSourceUri(sourceUri: string): string {
  const trimmed = sourceUri.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.slice(0, 7).toLowerCase() === "magnet:") {
    return `magnet:${trimmed.slice(7)}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:" &&
      parsed.protocol !== "ftp:"
    ) {
      return trimmed;
    }

    const credentials =
      parsed.username || parsed.password
        ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@`
        : "";
    const port = parsed.port ? `:${parsed.port}` : "";

    return `${parsed.protocol}//${credentials}${parsed.hostname}${port}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed;
  }
}
