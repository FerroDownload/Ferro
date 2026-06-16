import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MetadataWaiting } from "./MetadataWaiting";

describe("MetadataWaiting", () => {
  it("renders loading state and cancels", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(<MetadataWaiting onCancel={onCancel} />);

    expect(
      screen.getByRole("heading", { name: /fetching torrent metadata/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
