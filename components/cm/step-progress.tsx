import { copy } from "@/content/copy";
import { cn } from "@/lib/utils";

// A shallow arc, left to right; the sun travels along it as the steps go by.
const W = 72;
const H = 26;
const P0 = [4, 23] as const;
const C = [36, -7] as const;
const P2 = [68, 23] as const;
const ARC = `M ${P0[0]} ${P0[1]} Q ${C[0]} ${C[1]} ${P2[0]} ${P2[1]}`;
const at = (t: number, i: 0 | 1) => (1 - t) ** 2 * P0[i] + 2 * (1 - t) * t * C[i] + t ** 2 * P2[i];

/**
 * "2 of 5" beside a thin sunrise arc: the sun sits further along it at each step.
 * Announced as "Step 2 of 5" to screen readers; the arc itself is decoration.
 */
export function StepProgress({ step, total, className }: { step: number; total: number; className?: string }) {
  const t = Math.min(1, Math.max(0, step / total));
  const x = at(t, 0);
  const y = at(t, 1);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="sr-only">{copy.nav.stepAnnounce(step, total)}</span>
      <span aria-hidden="true" className="text-xs font-semibold text-text-muted">
        {copy.nav.step(step, total)}
      </span>
      <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} className="h-5 w-14 overflow-visible">
        <path d={ARC} pathLength={1} fill="none" strokeWidth={2} strokeLinecap="round" className="stroke-line" />
        <path
          d={ARC}
          pathLength={1}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="1 1"
          style={{ strokeDashoffset: 1 - t }}
          className="stroke-action transition-[stroke-dashoffset] duration-(--dur-gentle) ease-out"
        />
        <circle
          r={4.5}
          strokeWidth={2}
          className="fill-glow stroke-action transition-transform duration-(--dur-gentle) ease-out"
          style={{ transform: `translate(${x}px, ${y}px)` }}
        />
      </svg>
    </div>
  );
}
