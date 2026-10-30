"use client";

import type { ReactNode } from "react";
import { AlertDialog } from "radix-ui";
import { buttonClass } from "./button";
import { copy } from "@/content/copy";

/*
 * Confirmation for destructive actions (delete everything). Radix AlertDialog:
 * focus starts on Cancel, Escape cancels, focus returns to the trigger.
 */
export function ConfirmDialog({
  trigger,
  title,
  body,
  confirmLabel,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-text/40" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,440px)] -translate-1/2 flex-col gap-4 rounded-card bg-surface-raised p-6 shadow-raised outline-none">
          <AlertDialog.Title className="text-lg font-bold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-text-soft">{body}</AlertDialog.Description>
          <div className="mt-2 flex flex-col gap-2.5">
            <AlertDialog.Action className={buttonClass({ size: "lg", full: true })} onClick={onConfirm}>
              {confirmLabel}
            </AlertDialog.Action>
            <AlertDialog.Cancel className={buttonClass({ variant: "secondary", size: "lg", full: true })}>
              {copy.common.cancel}
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
