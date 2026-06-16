import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { UpdateDownloadProgress, UpdateInfo } from "@/shared/lib/types";
import { UpdatePromptDialog } from "./UpdatePromptDialog";

const update: UpdateInfo = {
  version: "0.2.0",
  current_version: "0.1.0",
  notes: "Fixes download recovery.",
  pub_date: "2026-05-01T00:00:00Z",
};

describe("UpdatePromptDialog", () => {
  it("renders nothing when no update is available", () => {
    const { container } = render(
      <UpdatePromptDialog
        update={null}
        progress={null}
        isInstalling={false}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows update details without starting installation", () => {
    const onConfirm = vi.fn();

    render(
      <UpdatePromptDialog
        update={update}
        progress={null}
        isInstalling={false}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("Ferro 0.2.0");
    expect(screen.getByText(/current version: 0.1.0/i)).toBeInTheDocument();
    expect(screen.getByText(/fixes download recovery/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before install", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onDismiss = vi.fn();

    render(
      <UpdatePromptDialog
        update={update}
        progress={null}
        isInstalling={false}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />,
    );

    await user.click(screen.getByRole("button", { name: /later/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /update now/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables actions and renders download progress while installing", () => {
    const progress: UpdateDownloadProgress = {
      downloaded_bytes: 250,
      total_bytes: 1000,
      percent: 25,
    };

    render(
      <UpdatePromptDialog
        update={update}
        progress={progress}
        isInstalling
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
    expect(screen.getByRole("button", { name: /later/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /installing/i })).toBeDisabled();
  });
});
