"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Moon, Sun, LayoutGrid, Settings } from "lucide-react";
import { GENERAL } from "@/components/Sidebar";

function IconButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
    >
      {icon}
    </button>
  );
}

function ThemeButton() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setDark(!dark);
  }

  return (
    <IconButton
      icon={dark ? <Sun size={17} strokeWidth={1.75} /> : <Moon size={17} strokeWidth={1.75} />}
      label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
    />
  );
}

const SEEN_KEY = "robinhood-dashboard:alerts-seen";

/** Bell with a count of "notify now" alerts published since the viewer last opened /alerts. */
function AlertsBell() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let seen = "";
    try {
      if (pathname === "/alerts") localStorage.setItem(SEEN_KEY, new Date().toISOString());
      seen = localStorage.getItem(SEEN_KEY) ?? "";
    } catch {
      /* storage blocked: badge just shows the 24h count */
    }
    fetch("/api/alerts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count: number; latest: string | null } | null) =>
        setCount(d && d.latest && d.latest > seen ? d.count : 0)
      )
      .catch(() => setCount(0));
  }, [pathname]);

  const label = count ? `${count} alertas nuevas` : "Sin alertas nuevas";
  return (
    <Link
      href="/alerts"
      aria-label={label}
      title={label}
      className="relative flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
    >
      <Bell size={17} strokeWidth={1.75} />
      {count > 0 && (
        <span className="font-figures absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-semibold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const page = GENERAL.find((n) => n.href === pathname)?.label ?? "Dashboard";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 text-sm">
      <LayoutGrid size={15} strokeWidth={1.75} className="text-[var(--muted)]" />
      <span className="text-[var(--muted)]">Dashboard</span>
      <span className="text-[var(--muted)]">/</span>
      <span className="font-medium">{page}</span>

      <div className="ml-auto flex items-center gap-0.5">
        <AlertsBell />
        <ThemeButton />
        <IconButton icon={<Settings size={17} strokeWidth={1.75} />} label="Ajustes (próximamente)" />
      </div>
    </header>
  );
}
