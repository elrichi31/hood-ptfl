"use client";

import { TriangleAlert } from "lucide-react";

// Contains a crashing page inside the app shell (sidebar + top bar stay up) instead of
// blanking the whole screen. `retry` is this Next version's name for the old `reset`.
export default function PageError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--danger)]">
          <TriangleAlert size={22} />
        </span>
        <h1 className="text-lg font-semibold">This page hit a problem</h1>
        <p className="text-sm text-[var(--muted)]">
          Something went wrong while loading it. The rest of the app is fine — try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-foreground)]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
