"use client";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { copy } from "@/content/copy";
import { api, ApiError, toApiError } from "@/lib/client/api";
import { db, type ShareRow } from "@/lib/client/db";
import { formatDateTimeLocal } from "@/lib/client/format";
import { messageFor } from "@/lib/client/messages";
import { stopSharing } from "@/lib/client/share";
import type { ShareResults } from "@/lib/contracts";

/*
 * The owner's view of one private link: who has answered, as plain counts and
 * the notes in their own words (always rendered as text), with "stop sharing"
 * one tap away. A link that has expired or been stopped says so; the owner
 * removes it from the list when they like.
 */
export function ShareCardView({
  labels,
  expiresAt,
  results,
  ended = false,
  failed = false,
  fetching = false,
  onRefresh,
  onStop,
  onDismiss,
}: {
  labels: readonly string[];
  expiresAt: string;
  results?: ShareResults;
  ended?: boolean;
  /** We couldn't ask the server just now. */
  failed?: boolean;
  fetching?: boolean;
  onRefresh: () => void;
  onStop: () => void;
  onDismiss: () => void;
}) {
  const t = copy.share;
  const total = results?.items.reduce((n, i) => n + i.votes, 0) ?? 0;
  const top = Math.max(1, ...(results?.items.map((i) => i.votes) ?? [0]));
  const labelFor = (key: string) => results?.items.find((i) => i.key === key)?.label ?? "";

  return (
    <li className="flex flex-col gap-4 rounded-card bg-surface p-5">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm text-text-muted">{ended ? t.ended : t.until(formatDateTimeLocal(expiresAt))}</p>
        <p className="font-semibold">{labels.join(" · ")}</p>
      </div>

      {ended ? (
        <Button variant="secondary" className="self-start" onClick={onDismiss}>
          {t.dismiss}
        </Button>
      ) : (
        <>
          <div aria-live="polite" className="flex flex-col gap-3">
            {failed ? (
              <p className="text-sm text-text-soft">{t.resultsFailed}</p>
            ) : results ? (
              <>
                <p className="text-sm font-semibold text-text-soft">{total === 0 ? t.noAnswers : t.answersCount(total)}</p>
                <ul className="flex flex-col gap-2.5">
                  {results.items.map((item) => (
                    <li key={item.key} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-semibold">{item.label}</span>
                        <span className="text-text-muted">{t.votes(item.votes)}</span>
                      </div>
                      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-bg">
                        <div className="h-full rounded-full bg-action" style={{ width: `${(item.votes / top) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
                {results.notes.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-sm font-semibold text-text-soft">{t.notesTitle}</p>
                    <ul className="flex flex-col gap-1.5">
                      {results.notes.map((note, i) => (
                        <li key={i} className="rounded-2xl bg-bg px-4 py-3 text-sm">
                          <span className="text-text-muted">{labelFor(note.itemKey)}: </span>
                          {note.note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="h-11 px-4 text-sm" onClick={onRefresh} loading={fetching}>
              {t.refresh}
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="quiet" className="h-11 px-4 text-sm">
                  {t.stop}
                </Button>
              }
              title={t.stopTitle}
              body={t.stopBody}
              confirmLabel={t.stopConfirm}
              onConfirm={onStop}
            />
          </div>
        </>
      )}
    </li>
  );
}

/** One stored link: checks for answers every half minute while the page is open. */
function ShareCard({ share }: { share: ShareRow }) {
  const results = useQuery({
    queryKey: ["share-results", share.token],
    queryFn: () => api.shareResults(share.token, share.ownerKey),
    refetchInterval: 30_000,
    retry: (count, error) => (error instanceof ApiError ? error.body.retryable && count < 2 : count < 2),
  });
  const ended = results.error instanceof ApiError && results.error.body.code === "EXPIRED";

  return (
    <ShareCardView
      labels={share.labels}
      expiresAt={share.expiresAt}
      results={results.data}
      ended={ended}
      failed={results.isError}
      fetching={results.isFetching}
      onRefresh={() => void results.refetch()}
      onDismiss={() => void db.shares.delete(share.token)}
      onStop={() =>
        void stopSharing(share).then(
          () => toast(copy.share.stopped),
          (error) => toast(messageFor(toApiError(error).body.messageKey).title),
        )
      }
    />
  );
}

export function SupportCircle({ shares }: { shares: readonly ShareRow[] }) {
  return (
    <ul className="flex flex-col gap-3" aria-label={copy.share.listTitle}>
      {shares.map((share) => (
        <ShareCard key={share.token} share={share} />
      ))}
    </ul>
  );
}
