"use client";

import { useEffect, useState, type ReactNode } from "react";
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
      <Sidebar name={name} email={email} collapsed={collapsed} onToggle={toggleCollapsed} />
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface)] shadow-[inset_1px_0_0_var(--border)]">
        <TopBar />
        <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
