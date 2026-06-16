const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 0) {
    return "0 KB/s";
  }

  if (bytesPerSecond >= GB) {
    return `${(bytesPerSecond / GB).toFixed(2)} GB/s`;
  }

  if (bytesPerSecond >= MB) {
    return `${(bytesPerSecond / MB).toFixed(2)} MB/s`;
  }

  return `${Math.max(bytesPerSecond / KB, 0).toFixed(2)} KB/s`;
}
