import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { EmptyActivePanel } from "./EmptyActivePanel";

describe("EmptyActivePanel", () => {
  it("renders first-download onboarding with a primary CTA and settings link", async () => {
    const onAddDownload = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <EmptyActivePanel onAddDownload={onAddDownload} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /no downloads/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/url \/ magnet \/ torrent/i)).toBeInTheDocument();
    expect(screen.queryByText(/download intake/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/stage it/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /settings/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^add download$/i }));

    expect(onAddDownload).toHaveBeenCalledTimes(1);
  });

  it("disables the CTA while download mutations are unavailable", () => {
    render(
      <MemoryRouter>
        <EmptyActivePanel onAddDownload={vi.fn()} addDownloadDisabled />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: /^add download$/i }),
    ).toBeDisabled();
  });
});
