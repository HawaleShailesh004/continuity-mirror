import { copy } from "@/content/copy";
import { cn } from "@/lib/utils";

/** "8 more previews available". Quiet and never alarming; softer wording when few remain. */
export function BudgetNote({ remaining, className }: { remaining: number; className?: string }) {
  const text =
    remaining <= 0 ? copy.budget.reached : remaining <= 3 ? copy.budget.low(remaining) : copy.budget.previewsLeft(remaining);
  return (
    <p role="status" className={cn("text-xs text-text-muted", className)}>
      {text}
    </p>
  );
}
