import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

import AppShell from "../../src/app/App";

describe("App shell smoke", () => {
  const renderRoute = (entry: string) =>
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<h1>Downloads</h1>} />
            <Route path="history" element={<h1>History</h1>} />
            <Route path="settings" element={<h1>Settings</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

  it("renders downloads route", () => {
    renderRoute("/");
    expect(
      screen.getByRole("heading", { name: /downloads/i }),
    ).toBeInTheDocument();
  });

  it("renders history route", () => {
    renderRoute("/history");
    expect(
      screen.getByRole("heading", { name: /history/i }),
    ).toBeInTheDocument();
  });

  it("renders settings route", () => {
    renderRoute("/settings");
    expect(
      screen.getByRole("heading", { name: /settings/i }),
    ).toBeInTheDocument();
  });
});
