"use client";

import { ToggleGroup } from "radix-ui";
import { AnimatedBackground } from "@/components/motion/animated-background";
import { cn } from "@/lib/utils";

export type Choice<V extends string = string> = {
  value: V;
  label: string;
  /** Catalog colour shown as a dot before the label (data, not a theme token). */
  swatch?: string;
};

/*
 * Single-select chips or a segmented control. Radix ToggleGroup supplies the
 * semantics (radio items, roving focus, arrow keys); AnimatedBackground draws
 * the one highlight pill that glides between options (signature moment 4).
 * Re-pressing the selected item does nothing: a choice can't be un-chosen.
 */
export function ChoiceChips<V extends string>({
  label,
  options,
  value,
  onValueChange,
  variant = "chip",
  className,
}: {
  /** Accessible name of the group, e.g. "Hair colour". */
  label: string;
  options: readonly Choice<V>[];
  value: V | null;
  onValueChange: (value: V) => void;
  variant?: "chip" | "segment";
  className?: string;
}) {
  const segment = variant === "segment";

  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value ?? ""}
      onValueChange={(next) => next && onValueChange(next as V)}
      className={cn(segment ? "flex gap-1 rounded-full bg-surface p-1" : "flex flex-wrap gap-2", className)}
    >
      <AnimatedBackground
        value={value}
        onValueChange={(id) => id && onValueChange(id as V)}
        className={segment ? undefined : "bg-selected shadow-none ring-2 ring-action"}
      >
        {options.map((option) => (
          <ToggleGroup.Item
            key={option.value}
            value={option.value}
            data-id={option.value}
            className={cn(
              "h-11 rounded-full text-sm font-semibold whitespace-nowrap text-text-soft transition-colors duration-(--dur-quick)",
              "data-[checked=true]:text-text",
              segment ? "flex-1 justify-center px-3" : "bg-surface px-4",
            )}
          >
            {option.swatch && (
              <span
                aria-hidden="true"
                className="mr-2 size-4 shrink-0 rounded-full border border-line"
                style={{ background: option.swatch }}
              />
            )}
            {option.label}
          </ToggleGroup.Item>
        ))}
      </AnimatedBackground>
    </ToggleGroup.Root>
  );
}
