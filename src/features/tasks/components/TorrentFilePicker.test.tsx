import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { TorrentFilePicker } from "./TorrentFilePicker";

const metadata = {
  info_hash: "abcd",
  name: "Example",
  total_bytes: 2048,
  files: [
    {
      index: 1,
      path: "Example/file-a.bin",
      bytes: 1024,
      completed_bytes: 0,
      selected: true,
    },
    {
      index: 2,
      path: "Example/file-b.bin",
      bytes: 1024,
      completed_bytes: 0,
      selected: true,
    },
  ],
  trackers: ["udp://tracker"],
  peers: 2,
  seeders: 1,
};

describe("TorrentFilePicker", () => {
  it("renders files and confirms selection", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <TorrentFilePicker
        metadata={metadata}
        destination="C:/Users/Test/Downloads"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Example/file-a.bin")).toBeInTheDocument();
    expect(screen.getByText("Example/file-b.bin")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add torrent/i }));

    expect(onConfirm).toHaveBeenCalledWith({
      selectedFiles: ["Example/file-a.bin", "Example/file-b.bin"],
      selectedIndices: [1, 2],
    });
  });

  it("disables add when no selection", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <TorrentFilePicker
        metadata={metadata}
        destination="C:/Users/Test/Downloads"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /select none/i }));

    const addButton = screen.getByRole("button", { name: /add torrent/i });
    expect(addButton).toBeDisabled();
  });

  it("moves initial focus into the primary action, traps tab focus, closes on Esc, and restores trigger focus", async () => {
    const user = userEvent.setup();

    const Harness = () => {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open torrent picker
          </button>
          {open ? (
            <TorrentFilePicker
              metadata={metadata}
              destination="C:/Users/Test/Downloads"
              onConfirm={vi.fn()}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </>
      );
    };

    render(<Harness />);

    const trigger = screen.getByRole("button", {
      name: /open torrent picker/i,
    });
    await user.click(trigger);

    expect(screen.getByRole("button", { name: /add torrent/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /select all/i })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
