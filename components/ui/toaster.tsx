"use client";

import { Toaster as Sonner } from "sonner";

/*
 * Toasts slide up from the bottom bar, never from the top (plan §3.4).
 * Styled through our tokens so they follow light and dark.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      offset={{ bottom: "calc(env(safe-area-inset-bottom) + 88px)" }}
      mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 88px)" }}
      visibleToasts={2}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[min(92vw,360px)] items-center gap-3 rounded-full bg-surface-raised px-5 py-3 text-sm font-semibold text-text shadow-raised",
          title: "text-sm font-semibold",
          description: "text-xs text-text-muted",
          actionButton: "ml-auto rounded-full bg-action px-4 py-2 text-xs font-semibold text-on-action",
        },
      }}
    />
  );
}
