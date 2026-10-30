import { copy } from "@/content/copy";
import { cn } from "@/lib/utils";

/**
 * "Style direction, not exact wig fit". Required beside every generated image
 * (scripts/guardrail.ts fails CI if a component renders one without it).
 * Peach is a backdrop, never a text colour.
 */
export function StyleDirectionLabel({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex self-start rounded-full bg-peach px-3 py-1.5 text-xs font-semibold text-text-soft",
        className,
      )}
    >
      {copy.label.styleDirection}
    </p>
  );
}
