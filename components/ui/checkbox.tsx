"use client";

import type { ReactNode } from "react";
import { Checkbox as RadixCheckbox } from "radix-ui";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * A labelled checkbox row. The whole row is the target (≥ 44 px); the box is
 * drawn at 24 px so it reads clearly with tired eyes or unsteady hands.
 */
export function CheckboxRow({
  id,
  checked,
  onCheckedChange,
  children,
  className,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl py-2.5", className)}
    >
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border-2 border-text-muted bg-bg",
          "transition-colors duration-(--dur-quick) data-[state=checked]:border-action data-[state=checked]:bg-action",
        )}
      >
        <RadixCheckbox.Indicator>
          <CheckIcon aria-hidden="true" className="size-4 text-on-action" strokeWidth={3} />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <span className="text-base">{children}</span>
    </label>
  );
}
