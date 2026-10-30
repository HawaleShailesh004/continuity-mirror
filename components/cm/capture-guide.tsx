import { cn } from "@/lib/utils";

/*
 * The oval-and-shoulders guide over the camera (signature moment 2). It
 * breathes gently (scale 1 → 1.02, 4 s: the screen's one ambient animation)
 * and turns from soft white to sky blue once every check passes. Decorative:
 * the tip bar and check list carry the information.
 */
export function CaptureGuide({ passed, className }: { passed: boolean; className?: string }) {
  const stroke = passed ? "var(--action)" : "var(--on-photo)";
  return (
    <svg
      viewBox="0 0 300 400"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("animate-breathe pointer-events-none absolute inset-0 size-full", className)}
      fill="none"
    >
      {/* A white halo under the line keeps it readable on any background. */}
      {[
        { color: "var(--on-photo)", width: 7, opacity: 0.55 },
        { color: stroke, width: 3.5, opacity: passed ? 1 : 0.85 },
      ].map((line) => (
        <g key={line.width} stroke={line.color} strokeWidth={line.width} strokeLinecap="round" opacity={line.opacity} style={{ transition: "stroke var(--dur-base)" }}>
          <ellipse cx="150" cy="150" rx="82" ry="108" vectorEffect="non-scaling-stroke" />
          <path d="M28 372 C 40 300, 96 276, 150 276 C 204 276, 260 300, 272 372" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  );
}
