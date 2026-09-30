"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const SIZES = [10, 25, 50, 100];

const read = (key: string) => {
  try {
    const n = Number(localStorage.getItem(key));
    return SIZES.includes(n) ? n : null;
  } catch {
    return null;
  }
};
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

/** Page + rows-per-page state for a table. The size is remembered per table (`id`) in this browser. */
export function usePaging(id: string, initial = 25) {
  const key = `rows-per-page:${id}`;
  const [page, setPage] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  // Server snapshot is null so the first client render matches SSR, then the saved size kicks in.
  const saved = useSyncExternalStore(subscribe, () => read(key), () => null);
  const size = chosen ?? saved ?? initial;
  const setSize = (s: number) => {
    setChosen(s);
    setPage(0);
    try {
      localStorage.setItem(key, String(s));
    } catch {}
  };
  // Clamp so a filter that shrinks the list never leaves you on an empty page.
  const pageFor = (total: number) => Math.min(page, Math.max(0, Math.ceil(total / size) - 1));
  const slice = <T,>(rows: T[]) => rows.slice(pageFor(rows.length) * size, (pageFor(rows.length) + 1) * size);
  return { setPage, size, setSize, pageFor, slice };
}

/** Rows-per-page select, "a–b of n" and prev/next. Renders nothing when the list fits the smallest size. */
export function Pagination({ paging, total }: { paging: ReturnType<typeof usePaging>; total: number }) {
  if (total <= SIZES[0]) return null;
  const { size, setSize, setPage } = paging;
  const page = paging.pageFor(total);
  const pages = Math.ceil(total / size);
  const btn =
    "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:hover:text-[var(--muted)]";
  return (
    <nav className="mt-3 flex items-center justify-end gap-2 text-xs text-[var(--muted)]" aria-label="Pagination">
      <label className="mr-auto inline-flex items-center gap-2">
        Rows
        <select
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="font-figures h-7 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 font-mono text-[var(--foreground)]"
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <span className="font-figures font-mono">
        {page * size + 1}–{Math.min(total, (page + 1) * size)} of {total}
      </span>
      {pages > 1 && (
        <>
          <button type="button" className={btn} onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page">
            <ChevronLeft size={14} />
          </button>
          <span className="font-figures font-mono">
            {page + 1} / {pages}
          </span>
          <button type="button" className={btn} onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">
            <ChevronRight size={14} />
          </button>
        </>
      )}
    </nav>
  );
}

/** Paged table for server pages: rows arrive pre-rendered, only the slicing happens client-side. */
export function PagedTable({ id, head, rows, className }: { id: string; head: ReactNode; rows: ReactNode[]; className?: string }) {
  const paging = usePaging(id);
  return (
    <>
      <div className="overflow-x-auto">
        <table className={className}>
          <thead>{head}</thead>
          <tbody>{paging.slice(rows)}</tbody>
        </table>
      </div>
      <Pagination paging={paging} total={rows.length} />
    </>
  );
}
