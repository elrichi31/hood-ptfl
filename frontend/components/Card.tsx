import type { ReactNode } from "react";

// Robinhood-style flat card: one rounded panel, hairline border, small muted title.
// Hand-rolled rather than @heroui/react's Card so it stays on our tokens.
export function Card({
  title,
  icon,
  action,
  className,
  children,
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 ${className ?? ""}`}
    >
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold text-[var(--secondary-foreground)]">{title}</h2>
          {action ?? (icon && <span className="shrink-0 text-[var(--muted)]">{icon}</span>)}
        </div>
      )}
      <div className="flex-1">{children}</div>
    </section>
  );
}
