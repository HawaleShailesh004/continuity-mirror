"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

/*
 * Bottom sheet on Vaul: drag to dismiss, 32 px top corners, focus trap and
 * Escape come with it. A title is required (screen readers announce it).
 */
export function Sheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional trigger element; pass a single focusable child (it is rendered `asChild`). */
  trigger?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-text/40" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[720px] flex-col",
            "rounded-t-sheet bg-surface-raised shadow-raised outline-none",
            className,
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-text-muted/40" />
          <div className="flex flex-col gap-1 px-5 pt-4">
            <Drawer.Title className="text-lg font-bold">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="text-sm text-text-soft">{description}</Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          <div className="overflow-y-auto px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
