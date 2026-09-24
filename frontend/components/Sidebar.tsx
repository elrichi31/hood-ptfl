"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dropdown } from "@heroui/react";
import {
  LayoutDashboard,
  Newspaper,
  Landmark,
  Wallet,
  Sparkles,
  Compass,
  ShieldAlert,
  BellRing,
  Settings,
  LineChart,
  PanelLeft,
  Search,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";

type NavEntry = { href: string; label: string; icon: LucideIcon };
type SoonEntry = { label: string; icon: LucideIcon };

export const GENERAL: NavEntry[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/politician-trades", label: "Politician trades", icon: Landmark },
  { href: "/alerts", label: "Alerts", icon: BellRing },
];

const SOON: SoonEntry[] = [
  { label: "Portfolio", icon: Wallet },
  { label: "AI Analyst", icon: Sparkles },
  { label: "Discover", icon: Compass },
  { label: "Risk", icon: ShieldAlert },
  { label: "Settings", icon: Settings },
];

export function Sidebar({
  name,
  email,
  collapsed,
  onToggle,
}: {
  name: string;
  email: string;
  collapsed?: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const initials = (name || email)
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside
      className={`flex shrink-0 flex-col px-2.5 py-3 transition-[width] duration-200 ${collapsed ? "w-[64px]" : "w-[250px]"}`}
    >
      <div className={`flex h-9 shrink-0 items-center gap-2.5 px-1 ${collapsed ? "justify-center" : ""}`}>
        {!collapsed && (
          <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--foreground)] text-[var(--background)]">
              <LineChart size={15} strokeWidth={2.25} />
            </span>
            <p className="flex-1 truncate text-base font-semibold">Robinhood</p>
          </>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
        >
          <PanelLeft size={17} strokeWidth={1.75} />
        </button>
      </div>

      {!collapsed && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
          <Search size={15} strokeWidth={1.75} className="shrink-0 text-[var(--muted)]" />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-[var(--muted)]"
          />
          <span className="shrink-0 text-xs text-[var(--muted)]">⌘K</span>
        </div>
      )}

      <nav className="mt-4 flex-1 overflow-y-auto">
        <NavGroup title="Main navigation" collapsed={collapsed}>
          {GENERAL.map((item) => (
            <NavLink key={item.href} {...item} active={pathname === item.href} collapsed={collapsed} />
          ))}
        </NavGroup>

        <NavGroup title="Próximamente" collapsed={collapsed}>
          {SOON.map((item) => (
            <SoonLink key={item.label} {...item} collapsed={collapsed} />
          ))}
        </NavGroup>
      </nav>

      <Dropdown>
        <Dropdown.Trigger
          className={`flex w-full items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-left shadow-[0_4px_7px_rgba(0,0,0,0.04)] hover:bg-[var(--surface-hover)] ${collapsed ? "justify-center" : ""}`}
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-xs font-medium">
            {initials}
            <span className="absolute right-0 bottom-0 h-2 w-2 rounded-full border border-[var(--surface)] bg-[var(--success)]" />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-medium">{name || email}</span>
                <span className="block truncate text-[11.5px] text-[var(--muted)]">{email}</span>
              </span>
              <ChevronsUpDown size={15} className="shrink-0 text-[var(--muted)]" />
            </>
          )}
        </Dropdown.Trigger>
        <Dropdown.Popover placement="top start">
          <Dropdown.Menu
            onAction={(key) => {
              if (key === "signout") {
                signOut().then(() => {
                  router.push("/login");
                  router.refresh();
                });
              }
            }}
          >
            <Dropdown.Item id="signout">Cerrar sesión</Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </aside>
  );
}

function NavGroup({ title, collapsed, children }: { title: string; collapsed?: boolean; children: ReactNode }) {
  return (
    <div className="mb-5">
      {!collapsed && (
        <p className="px-1 pb-2 text-[11px] font-medium tracking-wide text-[var(--muted)] uppercase">{title}</p>
      )}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavLink({ href, label, icon: Icon, active, collapsed }: NavEntry & { active: boolean; collapsed?: boolean }) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex h-8 items-center gap-2.5 rounded-lg border px-2.5 text-[13px] transition-colors ${collapsed ? "justify-center" : ""} ${
        active
          ? "border-[var(--border)] bg-[var(--surface)] font-medium text-[var(--foreground)] shadow-[0_4px_7px_rgba(0,0,0,0.04)]"
          : "border-transparent text-[var(--secondary-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
      }`}
    >
      <Icon size={16} strokeWidth={1.75} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function SoonLink({ label, icon: Icon, collapsed }: SoonEntry & { collapsed?: boolean }) {
  return (
    <span
      title={collapsed ? `${label} (próximamente)` : undefined}
      className={`flex h-8 items-center rounded-lg px-2.5 text-[13px] text-[var(--secondary-foreground)] opacity-50 ${collapsed ? "justify-center" : "justify-between"}`}
    >
      <span className="flex items-center gap-2.5">
        <Icon size={16} strokeWidth={1.75} className="shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </span>
      {!collapsed && <span className="text-[10px] tracking-wide uppercase">Soon</span>}
    </span>
  );
}
