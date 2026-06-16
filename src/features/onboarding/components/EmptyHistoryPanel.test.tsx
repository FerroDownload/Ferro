import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyHistoryPanel } from "./EmptyHistoryPanel";

describe("EmptyHistoryPanel", () => {
  it("renders text-only history empty state without a CTA", () => {
    render(<EmptyHistoryPanel />);

    expect(
      screen.getByRole("heading", { name: /no completed downloads yet/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/finished, cancelled, and failed downloads/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
