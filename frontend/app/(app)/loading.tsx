// Shown instantly on navigation while the next page's server data loads; the shell (sidebar,
// top bar) comes from the layout and stays put.
const Bone = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-md bg-[var(--surface-hover)] ${className}`} />
);

function CardBone({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl bg-[var(--surface-secondary)] p-1 shadow-[inset_0_0_0_1px_var(--border)] ${className}`}>
      <div className="px-2 pt-1.5 pb-2">
        <Bone className="h-4 w-28" />
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">{children}</div>
    </div>
  );
}

export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-24"
      aria-busy="true"
      aria-label="Loading"
    >
      <Bone className="h-7 w-56" />
      <Bone className="mt-2 h-4 w-72 max-w-full" />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <CardBone key={i}>
            <Bone className="h-7 w-32" />
            <Bone className="mt-2 h-3 w-24" />
          </CardBone>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <CardBone className="lg:col-span-8">
          <Bone className="h-7 w-40" />
          <Bone className="mt-2 h-3 w-64 max-w-full" />
          <Bone className="mt-4 h-[200px] w-full sm:h-[260px]" />
        </CardBone>
        <div className="flex flex-col gap-4 lg:col-span-4">
          <CardBone className="flex-1">
            <Bone className="h-3 w-full" />
            <Bone className="mt-4 h-3 w-3/4" />
            <Bone className="mt-2 h-3 w-1/2" />
          </CardBone>
          <CardBone>
            <Bone className="h-7 w-28" />
          </CardBone>
        </div>
      </div>

      <CardBone className="mt-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-[var(--border)] py-3 last:border-0">
            <Bone className="h-8 w-8 shrink-0" />
            <Bone className="h-4 w-24" />
            <Bone className="ml-auto h-4 w-16" />
            <Bone className="hidden h-4 w-20 sm:block" />
          </div>
        ))}
      </CardBone>
    </main>
  );
}
