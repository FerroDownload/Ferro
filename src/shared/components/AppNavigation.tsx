import { NavLink } from "react-router";
import { Download, History, Settings } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Downloads", icon: Download, end: true },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const AppNavigation = () => (
  <aside
    aria-label="Application navigation"
    className="flex w-14 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2 py-3 text-sidebar-foreground shadow-sm sm:w-48 sm:px-2.5"
  >
    <nav className="flex flex-col gap-1.5" aria-label="Primary">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "relative flex h-10 items-center justify-center gap-2 rounded-md px-2.5 text-sm font-medium focus-visible:ring-1 focus-visible:ring-sidebar-ring sm:h-9 sm:justify-start",
              "transform-gpu transition-[background-color,color,box-shadow,transform] motion-safe:hover:translate-x-0.5",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary"
                : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )
          }
        >
          <item.icon aria-hidden="true" data-icon="inline-start" />
          <span className="sr-only sm:not-sr-only sm:truncate">
            {item.label}
          </span>
        </NavLink>
      ))}
    </nav>
  </aside>
);
