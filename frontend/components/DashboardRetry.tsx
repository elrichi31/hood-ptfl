"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function DashboardRetry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
    >
      {pending ? "Retrying…" : "Retry"}
    </button>
  );
}
