import { describe, expect, it } from "vitest";

import { displayUrl } from "./displayUrl";

describe("displayUrl", () => {
  it("strips URL-embedded credentials and query strings for rendering", () => {
    expect(
      displayUrl("https://user:pass@example.com/private/file.zip?token=secret"),
    ).toBe("https://example.com/private/file.zip");
  });

  it("preserves the stored URL value when parsing is not possible except for query text", () => {
    expect(displayUrl("not a url?token=secret")).toBe("not a url");
  });
});
