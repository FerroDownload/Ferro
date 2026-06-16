import { render, screen } from "@testing-library/react";

import { DuplicateWarning } from "./DuplicateWarning";

describe("DuplicateWarning", () => {
  it("renders a credential-safe display URL", () => {
    render(
      <DuplicateWarning
        title="Private File"
        url="https://user:pass@example.com/private/file.zip?token=secret"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "https://example.com/private/file.zip",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("user:pass");
    expect(screen.getByRole("status")).not.toHaveTextContent("token=secret");
  });
});
