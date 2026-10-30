import { copy } from "@/content/copy";
import { cn } from "@/lib/utils";

/** "2 of 5" with dots. Announced as "Step 2 of 5" to screen readers. */
export function StepProgress({ step, total, className }: { step: number; total: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="sr-only">{copy.nav.stepAnnounce(step, total)}</span>
      <span aria-hidden="true" className="text-xs font-semibold text-text-muted">
        {copy.nav.step(step, total)}
      </span>
      <span aria-hidden="true" className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-(--dur-base)",
              i < step ? "w-4 bg-action" : "w-1.5 bg-line",
            )}
          />
        ))}
      </span>
    </div>
  );
}
