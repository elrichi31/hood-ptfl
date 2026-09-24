import type { ReactNode } from "react";

// Kravio-style two-layer card: gray frame with a hatched title strip, white
// inner panel. Hand-rolled rather than @heroui/react's Card (32px radius, no
// border) so it stays on our tokens.
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
      className={`flex flex-col rounded-xl bg-[var(--surface-secondary)] p-1 shadow-[inset_0_0_0_1px_var(--border)] ${className ?? ""}`}
    >
      {title && (
        <div className="hatch flex items-center justify-between gap-2 rounded-t-lg px-2 pt-1.5 pb-2">
          <h2 className="truncate text-sm font-medium text-[var(--secondary-foreground)]">{title}</h2>
          {action ?? (icon && <span className="shrink-0 text-[var(--muted)]">{icon}</span>)}
        </div>
      )}
      <div className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">{children}</div>
    </section>
  );
}
