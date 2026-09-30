// No "use client": server pages (Risk) pass icon components to HeadLabel, which can't cross the
// server→client boundary. Client-only table pieces live in Paging.tsx.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Table header text with its icon, used by every table so headers read the same everywhere. */
export function HeadLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon size={13} strokeWidth={2} aria-hidden className="shrink-0 opacity-70" />
      {children}
    </span>
  );
}
