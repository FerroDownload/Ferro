import { describe, expect, it } from "vitest";

import { formatSpeed } from "./formatters";

// Ref: https://github.com/vitest-dev/vitest/blob/main/docs/api/test.md

describe("formatSpeed", () => {
  it.each([
    [0, "0.00 KB/s"],
    [512, "0.50 KB/s"],
    [1024, "1.00 KB/s"],
    [1024 * 1024, "1.00 MB/s"],
    [1024 * 1024 * 12.5, "12.50 MB/s"],
    [1024 * 1024 * 1024, "1.00 GB/s"],
  ])("formats %d bytes", (bytes, expected) => {
    expect(formatSpeed(bytes)).toBe(expected);
  });

  it("guards against invalid values", () => {
    expect(formatSpeed(-5)).toBe("0 KB/s");
    expect(formatSpeed(Number.NaN)).toBe("0 KB/s");
  });
});
