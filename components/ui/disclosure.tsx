"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * A quiet show/hide section ("Something changed that I didn't want", money
 * help). Native button + aria-expanded; content is a CSS grid-rows reveal so
 * it animates height without measuring (transform-free, reduced-motion safe).
 */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
  className,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className={cn("rounded-card bg-surface", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-card px-5 py-3 text-left font-semibold"
      >
        <span>{title}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className={cn("size-5 shrink-0 transition-transform duration-(--dur-base)", open && "rotate-180")}
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-label={title}
        className={cn(
          "grid transition-[grid-template-rows] duration-(--dur-base) ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        inert={!open}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
