import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Sticky action area within thumb reach. One primary action, at most one
 * secondary. Never two primaries on a screen (frontend plan §1).
 */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 flex flex-col gap-2.5 bg-linear-to-t from-bg from-70% to-transparent px-5 pt-6 md:px-8",
        "pb-[max(1rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </div>
  );
}
