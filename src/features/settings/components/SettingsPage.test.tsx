import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("renders the settings page with grouped sections", () => {
    render(
      <SettingsPage
        isCheckingForUpdates={false}
        updateMessage={null}
        onCheckForUpdates={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: /settings sections/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /configuration/i }),
    ).toBeInTheDocument();

    for (const section of [
      "General",
      "Downloads",
      "BitTorrent",
      "Advanced",
      "About",
    ]) {
      expect(screen.getByRole("region", { name: section })).toBeInTheDocument();
    }

    expect(
      screen.queryByText(/tune download and engine preferences/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/startup behavior, notifications, and appearance/i),
    ).not.toBeInTheDocument();
  });

  it("keeps the About update check action accessible", async () => {
    const onCheckForUpdates = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPage
        isCheckingForUpdates={false}
        updateMessage="Ferro is up to date."
        onCheckForUpdates={onCheckForUpdates}
        onToast={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Check for updates" }));

    expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ferro is up to date.",
    );
  });

  it("keeps section navigation inside the settings route hash", async () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = scrollIntoView;

    try {
      render(
        <SettingsPage
          isCheckingForUpdates={false}
          updateMessage={null}
          onCheckForUpdates={vi.fn()}
          onToast={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Downloads" }));

      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("disables the update check action while a check is running", () => {
    render(
      <SettingsPage
        isCheckingForUpdates
        updateMessage={null}
        onCheckForUpdates={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Checking..." })).toBeDisabled();
  });
});
