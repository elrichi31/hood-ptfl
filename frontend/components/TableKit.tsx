"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";

/** Table header text with its icon, used by every table so headers read the same everywhere. */
export function HeadLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon size={13} strokeWidth={2} aria-hidden className="shrink-0 opacity-70" />
      {children}
    </span>
  );
}

/** Prev / "a–b of n" / next. Renders nothing when everything fits on one page. */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const btn =
    "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:hover:text-[var(--muted)]";
  return (
    <nav className="mt-3 flex items-center justify-end gap-2 text-xs text-[var(--muted)]" aria-label="Pagination">
      <span className="font-figures font-mono">
        {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}
      </span>
      <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page">
        <ChevronLeft size={14} />
      </button>
      <span className="font-figures font-mono">
        {page + 1} / {pages}
      </span>
      <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">
        <ChevronRight size={14} />
      </button>
    </nav>
  );
}
