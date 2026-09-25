"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

const COLLAPSE_KEY = "robinhood-dashboard:sidebar-collapsed";

export function AppShell({
  name,
  email,
  children,
}: {
  name: string;
  email: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  // Phones: the sidebar is a drawer opened from the top bar, closed on navigation.
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDrawer(false), [pathname]);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage blocked: stays expanded */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* storage blocked: change only lasts this session */
      }
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      {drawer && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setDrawer(false)} aria-hidden />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-[var(--background)] md:static md:z-auto md:flex ${drawer ? "flex" : "hidden"}`}
      >
        <Sidebar
          name={name}
          email={email}
          collapsed={collapsed && !drawer}
          onToggle={drawer ? () => setDrawer(false) : toggleCollapsed}
        />
      </div>
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface)] md:shadow-[inset_1px_0_0_var(--border)]">
        <TopBar onMenu={() => setDrawer(true)} />
        <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
