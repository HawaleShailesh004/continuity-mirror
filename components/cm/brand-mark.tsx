/** The mark: "you, before" (solid) and "you, through it" (outline), side by side. */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className={`${className} shrink-0`}>
      <circle cx="12" cy="16" r="9" className="fill-glow" />
      <circle cx="20" cy="16" r="9" className="fill-none stroke-action" strokeWidth="2.5" />
    </svg>
  );
}
