import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TorrentDetails } from "./TorrentDetails";

const metadata = {
  info_hash: "abcd",
  name: "Example",
  total_bytes: 2048,
  files: [
    {
      index: 1,
      path: "Example/file-a.bin",
      bytes: 1024,
      completed_bytes: 512,
      selected: true,
    },
  ],
  trackers: ["udp://tracker"],
  peers: 2,
  seeders: 1,
};

describe("TorrentDetails", () => {
  it("renders metadata and closes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<TorrentDetails metadata={metadata} onClose={onClose} />);

    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(screen.getByText(/peers/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
