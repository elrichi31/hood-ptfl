// Zenlor Labs brand mark: a geometric "Z" monogram. Inherits currentColor so it sits on the
// accent circle in the sidebar and on the login page alike.
export function ZenlorMark({ size = 16, strokeWidth = 2.5 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6h12L6 18h12" />
    </svg>
  );
}
