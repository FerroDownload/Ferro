import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Toolbar } from "./Toolbar";

const renderToolbar = (mutationsAllowed = true) => {
  const handlers = {
    onNewDownload: vi.fn(),
    onPauseAll: vi.fn(),
    onResumeAll: vi.fn(),
  };

  render(<Toolbar mutationsAllowed={mutationsAllowed} {...handlers} />);

  return handlers;
};

describe("Toolbar", () => {
  it("invokes global queue actions", async () => {
    const handlers = renderToolbar();
    const user = userEvent.setup();

    for (const buttonName of ["Pause all", "Resume all", "New download"]) {
      expect(
        screen
          .getByRole("button", { name: buttonName })
          .querySelector("svg[aria-hidden='true']"),
      ).not.toBeNull();
    }

    await user.click(screen.getByRole("button", { name: "Pause all" }));
    await user.click(screen.getByRole("button", { name: "Resume all" }));

    expect(handlers.onPauseAll).toHaveBeenCalledTimes(1);
    expect(handlers.onResumeAll).toHaveBeenCalledTimes(1);
  });

  it("disables queue mutation controls when mutations are unavailable", async () => {
    const handlers = renderToolbar(false);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "New download" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pause all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resume all" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Pause all" }));
    await user.click(screen.getByRole("button", { name: "Resume all" }));

    expect(handlers.onPauseAll).not.toHaveBeenCalled();
    expect(handlers.onResumeAll).not.toHaveBeenCalled();
  });
});
