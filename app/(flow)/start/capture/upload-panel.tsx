"use client";

import { useRef } from "react";
import { ImageUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { capture } from "@/content/copy/capture";

/*
 * Choose a photo from the device. The same checks as the camera run on it
 * before anything is sent (see CaptureScreen). The native picker is opened by
 * a real button; the input itself is hidden from the tab order so there is one
 * clear control.
 */
export function UploadPanel({ busy, onPicked }: { busy: boolean; onPicked: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const t = capture.upload;

  return (
    <div className="flex flex-col items-center gap-5 rounded-card bg-surface p-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-peach" aria-hidden="true">
        <ImageUpIcon className="size-7" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl">{t.title}</h2>
        <p className="text-text-soft">{t.body}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid="photo-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // so choosing the same file again still fires
          if (file) onPicked(file);
        }}
      />
      <Button size="lg" full loading={busy} onClick={() => input.current?.click()}>
        {busy ? t.checking : t.cta}
      </Button>
    </div>
  );
}
