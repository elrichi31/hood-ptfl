"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Moon, Sun, LayoutGrid, Settings, ReceiptText, Menu as MenuIcon } from "lucide-react";
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
const iconBtn =
  "relative flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Icon button that opens a panel under it; closes on outside click or Escape. */
function Menu({
  icon,
  label,
  badge,
  title,
  footer,
  onOpen,
  children,
}: {
  icon: ReactNode;
  label: string;
  badge?: number;
  title: string;
  footer?: ReactNode;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
        className={`${iconBtn} ${open ? "bg-[var(--surface-hover)] text-[var(--foreground)]" : ""}`}
      >
        {icon}
        {!!badge && (
          <span className="font-figures absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-semibold text-white">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-10 right-0 z-50 w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-lg">
          <p className="border-b border-[var(--border)] px-3 py-2 text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
            {title}
          </p>
          <div className="max-h-[420px] overflow-y-auto">{children}</div>
          {footer}
        </div>
      )}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">{text}</p>;

type AlertItem = { id: string; headline: string; tickers: string[]; publishedAt: string; url?: string };

/** Bell: badge = "notify now" alerts since the viewer last opened it; click shows them. */
function AlertsBell() {
  const pathname = usePathname();
  const [data, setData] = useState<{ count: number; latest: string | null; items: AlertItem[] } | null>(null);
  const [seen, setSeen] = useState("");

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeen(localStorage.getItem(SEEN_KEY) ?? "");
    } catch {
      /* storage blocked: badge just shows the 24h count */
    }
    fetch("/api/alerts")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, [pathname]);

  function markSeen() {
    const now = new Date().toISOString();
    setSeen(now);
    try {
      localStorage.setItem(SEEN_KEY, now);
    } catch {
      /* storage blocked */
    }
  }

  const count = data?.latest && data.latest > seen ? data.items.filter((i) => i.publishedAt > seen).length : 0;
  return (
    <Menu
      icon={<Bell size={17} strokeWidth={1.75} />}
      label={count ? `${count} new alerts` : "Alerts"}
      badge={count}
      title="Alerts · last 24h"
      onOpen={markSeen}
      footer={
        <Link href="/alerts" className="block border-t border-[var(--border)] px-3 py-2 text-center text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-hover)]">
          See all alerts
        </Link>
      }
    >
      {!data ? (
        <Empty text="Loading…" />
      ) : !data.items.length ? (
        <Empty text="Nothing urgent. All calm." />
      ) : (
        data.items.map((a) => (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="block border-b border-[var(--border)] px-3 py-2.5 text-sm last:border-0 hover:bg-[var(--surface-hover)]"
          >
            <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
              {a.publishedAt > seen && <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />}
              <span className="font-medium text-[var(--foreground)]">{a.tickers.slice(0, 3).join(" · ") || "Market"}</span>
              <span className="ml-auto">{when(a.publishedAt)}</span>
            </p>
            <p className="mt-0.5 line-clamp-2">{a.headline}</p>
          </a>
        ))
      )}
    </Menu>
  );
}

type Order = { symbol: string; side: string; quantity: number; price: number | null; state: string; createdAt: string };
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Recent orders from the last poll, loaded when the menu opens. */
function OrdersMenu() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  return (
    <Menu
      icon={<ReceiptText size={17} strokeWidth={1.75} />}
      label="Recent orders"
      title="Recent orders"
      onOpen={() =>
        fetch("/api/orders")
          .then((r) => (r.ok ? r.json() : { orders: [] }))
          .then((d) => setOrders(d.orders))
          .catch(() => setOrders([]))
      }
    >
      {!orders ? (
        <Empty text="Loading…" />
      ) : !orders.length ? (
        <Empty text="No recent orders." />
      ) : (
        orders.map((o, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 text-sm last:border-0">
            <div className="min-w-0 flex-1">
              <p>
                <span className={o.side === "buy" ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                  {o.side === "buy" ? "Buy" : "Sell"}
                </span>{" "}
                <span className="font-medium">{o.symbol}</span>
              </p>
              <p className="text-xs text-[var(--muted)] capitalize">
                {when(o.createdAt)} · {o.state.replace(/_/g, " ")}
              </p>
            </div>
            <div className="font-figures text-right font-mono text-xs">
              <p>{o.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })}</p>
              <p className="text-[var(--muted)]">{o.price ? money(o.price) : "—"}</p>
            </div>
          </div>
        ))
      )}
    </Menu>
  );
}

export function TopBar({ onMenu }: { onMenu?: () => void }) {
  const pathname = usePathname();
  const page = GENERAL.find((n) => n.href === pathname)?.label ?? "Dashboard";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 text-sm">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="-ml-1 flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] md:hidden"
      >
        <MenuIcon size={18} strokeWidth={1.75} />
      </button>
      <LayoutGrid size={15} strokeWidth={1.75} className="hidden text-[var(--muted)] md:block" />
      <span className="hidden text-[var(--muted)] md:inline">Dashboard</span>
      <span className="hidden text-[var(--muted)] md:inline">/</span>
      <span className="font-medium">{page}</span>

      <div className="ml-auto flex items-center gap-0.5">
        <OrdersMenu />
        <AlertsBell />
        <ThemeButton />
        <IconButton icon={<Settings size={17} strokeWidth={1.75} />} label="Settings (coming soon)" />
      </div>
    </header>
  );
}
