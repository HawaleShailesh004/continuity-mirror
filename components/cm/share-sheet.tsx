"use client";

import { useRef, useState } from "react";
import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { CheckboxRow } from "@/components/ui/checkbox";
import { Sheet } from "@/components/ui/sheet";
import { ErrorState } from "./states";
import { copy } from "@/content/copy";
import { toApiError } from "@/lib/client/api";
import type { ShareRow } from "@/lib/client/db";
import { formatDateTimeLocal } from "@/lib/client/format";
import { SHARE_DAYS, SHARE_MAX_ITEMS, type ShareDays } from "@/lib/client/share";
import type { ErrorBody } from "@/lib/contracts";

export type ShareLook = { id: string; label: string; thumbUrl: string };

/*
 * Ask someone you trust: choose the looks, choose how long the link works, and
 * say yes to what is stored. Nothing is ticked for the person and the button
 * stays off until they have agreed, because this is the one place a photo is
 * kept on our server. The link, once made, can be copied or sent, and stopped
 * from the plan at any time.
 */
export function ShareSheet({
  open,
  onOpenChange,
  looks,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  looks: readonly ShareLook[];
  onCreate: (ids: string[], days: ShareDays) => Promise<ShareRow>;
}) {
  const t = copy.share;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t.sheetTitle} description={t.sheetBody}>
      <ShareForm looks={looks} onCreate={onCreate} onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

function ShareForm({
  looks,
  onCreate,
  onDone,
}: {
  looks: readonly ShareLook[];
  onCreate: (ids: string[], days: ShareDays) => Promise<ShareRow>;
  onDone: () => void;
}) {
  const t = copy.share;
  const [picked, setPicked] = useState<string[]>(() => looks.slice(0, SHARE_MAX_ITEMS).map((l) => l.id));
  const [days, setDays] = useState<ShareDays>(7);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<"form" | "creating" | "done" | "failed">("form");
  const [row, setRow] = useState<ShareRow>();
  const [error, setError] = useState<ErrorBody>();
  const link = useRef<HTMLInputElement>(null);

  const toggle = (id: string, on: boolean) =>
    setPicked((current) => (on ? [...current, id].slice(0, SHARE_MAX_ITEMS) : current.filter((x) => x !== id)));

  const create = async () => {
    setPhase("creating");
    try {
      setRow(await onCreate(picked, days));
      setPhase("done");
    } catch (e) {
      setError(toApiError(e).body);
      setPhase("failed");
    }
  };

  const copyLink = async () => {
    if (!row) return;
    try {
      await navigator.clipboard.writeText(row.url);
      toast(t.copied);
    } catch {
      link.current?.select();
      toast(t.copyFailed);
    }
  };

  if (phase === "done" && row) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="flex items-center gap-2 font-semibold">
          <CheckIcon aria-hidden="true" className="size-5 text-action" />
          {t.doneTitle}
        </p>
        <p className="text-text-soft">{t.doneBody(formatDateTimeLocal(row.expiresAt))}</p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="share-link" className="text-sm font-semibold text-text-soft">
            {t.linkLabel}
          </label>
          <input
            ref={link}
            id="share-link"
            readOnly
            value={row.url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-12 w-full rounded-full bg-surface px-5 text-sm text-text"
          />
        </div>
        <Button size="lg" full onClick={() => void copyLink()}>
          <CopyIcon aria-hidden="true" className="size-5" />
          {t.copyLink}
        </Button>
        {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
          <Button
            variant="secondary"
            size="lg"
            full
            onClick={() => void navigator.share({ title: t.shareTitle, url: row.url }).catch(() => undefined)}
          >
            <Share2Icon aria-hidden="true" className="size-5" />
            {t.sendLink}
          </Button>
        )}
        <Button variant="quiet" size="lg" full onClick={onDone}>
          {copy.common.done}
        </Button>
      </div>
    );
  }

  const busy = phase === "creating";
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-1" disabled={busy}>
        <legend className="text-base font-bold">{t.chooseTitle}</legend>
        <p className="text-sm text-text-muted">{t.chooseHint(SHARE_MAX_ITEMS)}</p>
        <ul className="flex flex-col">
          {looks.map((look) => (
            <li key={look.id}>
              <CheckboxRow
                id={`share-look-${look.id}`}
                checked={picked.includes(look.id)}
                onCheckedChange={(on) => toggle(look.id, on)}
              >
                <span className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={look.thumbUrl} alt="" className="size-12 rounded-xl object-cover object-[50%_20%]" />
                  {look.label}
                </span>
              </CheckboxRow>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-2">
        <p className="text-base font-bold">{t.expiryTitle}</p>
        <ChoiceChips
          label={t.expiryLabel}
          value={String(days)}
          onValueChange={(v) => setDays(Number(v) as ShareDays)}
          options={SHARE_DAYS.map((d) => ({ value: String(d), label: t.expiry[d] }))}
        />
      </div>

      <div className="flex flex-col gap-1 rounded-card bg-peach p-4">
        <p className="text-base font-bold">{t.consentTitle}</p>
        <CheckboxRow id="share-consent" checked={consent} onCheckedChange={setConsent}>
          {t.consent}
        </CheckboxRow>
      </div>

      {phase === "failed" && <ErrorState messageKey={error?.messageKey} headingLevel={3} />}

      <Button size="lg" full onClick={() => void create()} loading={busy} disabled={!consent || picked.length === 0}>
        {busy ? t.creating : t.create}
      </Button>
    </div>
  );
}
