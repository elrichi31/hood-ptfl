"use client";

import { useEffect, useState, type ReactNode } from "react";
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
        <div className="relative">
          <IconButton icon={<Bell size={17} strokeWidth={1.75} />} label="Sin notificaciones nuevas" />
          <span className="pointer-events-none absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
        </div>
        <ThemeButton />
        <IconButton icon={<Settings size={17} strokeWidth={1.75} />} label="Ajustes (próximamente)" />
      </div>
    </header>
  );
}
