import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RestartBanner } from "./RestartBanner";

describe("RestartBanner", () => {
  it("renders a polite non-modal status while the engine is restarting", () => {
    render(<RestartBanner restartAttempts={2} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /download engine is restarting/i,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/attempt 2 of 3/i);
  });

  it("renders nothing when the engine is not restarting", () => {
    const { container } = render(<RestartBanner restartAttempts={0} hidden />);

    expect(container).toBeEmptyDOMElement();
  });
});
