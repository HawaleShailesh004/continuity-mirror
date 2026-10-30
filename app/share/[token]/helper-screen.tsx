"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2Icon, HeartIcon, LinkIcon } from "lucide-react";
import { BottomBar } from "@/components/cm/bottom-bar";
import { HeartFlight } from "@/components/cm/heart-flight";
import { ErrorState } from "@/components/cm/states";
import { Button } from "@/components/ui/button";
import { app } from "@/content/copy/app";
import { share as t } from "@/content/copy/share";
import { api, ApiError, toApiError } from "@/lib/client/api";
import { formatDateTimeLocal } from "@/lib/client/format";
import { hasVoted, rememberVote } from "@/lib/client/share";
import type { ErrorBody, ShareManifest } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const NOTE_MAX = 140;

type Load = { state: "loading" } | { state: "ready"; manifest: ShareManifest } | { state: "ended" } | { state: "error"; error: ErrorBody };

/*
 * What a helper sees: the person's photo beside each look, one question, and
 * a way to answer. No account, no cookie needed, and nothing here says why
 * the person is choosing a style: that is theirs to tell. The pictures are
 * private to this link and go when it ends (the page says when). A link that
 * is unknown, expired or stopped all read the same: "this link has ended".
 */
export function HelperScreen({ token }: { token: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"choose" | "sending" | "sent">("choose");
  const [answered, setAnswered] = useState(false);
  const [votesLeft, setVotesLeft] = useState<number>();
  const [problem, setProblem] = useState<ErrorBody>();
  const heading = useRef<HTMLHeadingElement>(null);
  const [flight, setFlight] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const endFlight = useCallback(() => setFlight(null), []);

  useEffect(() => {
    let cancelled = false;
    api.share(token).then(
      (manifest) => {
        if (cancelled) return;
        setAnswered(hasVoted(token));
        setLoad({ state: "ready", manifest });
      },
      (error) => {
        if (cancelled) return;
        const body = toApiError(error).body;
        setLoad(error instanceof ApiError && body.code === "EXPIRED" ? { state: "ended" } : { state: "error", error: body });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [load.state]);

  const send = async (event: React.MouseEvent<HTMLElement>) => {
    if (!picked) return;
    const button = event.currentTarget.getBoundingClientRect();
    const tile = document.querySelector<HTMLElement>(`[data-look="${picked}"]`)?.getBoundingClientRect();
    setPhase("sending");
    setProblem(undefined);
    try {
      const res = await api.vote(token, { itemKey: picked, ...(note.trim() ? { note: note.trim() } : {}) });
      rememberVote(token, picked);
      if (tile) setFlight({ from: { x: button.left + button.width / 2, y: button.top + button.height / 2 }, to: { x: tile.left + tile.width / 2, y: tile.top + tile.height / 2 } });
      setVotesLeft(res.votesLeft);
      setPhase("sent");
    } catch (error) {
      const body = toApiError(error).body;
      if (body.code === "EXPIRED") setLoad({ state: "ended" });
      else setProblem(body);
      setPhase("choose");
    }
  };

  const manifest = load.state === "ready" ? load.manifest : undefined;
  const retryLoad = () => {
    setLoad({ state: "loading" });
    setAttempt((n) => n + 1);
  };

  let body;
  if (load.state === "loading") {
    body = (
      <p role="status" className="rounded-card bg-surface px-5 py-4 text-sm font-semibold text-text-soft">
        {t.loading}
      </p>
    );
  } else if (load.state === "ended") {
    // The heading above already says it; this is the part that helps.
    body = <p className="rounded-card bg-surface p-6 text-text-soft">{t.endedBody}</p>;
  } else if (load.state === "error") {
    body = <ErrorState messageKey={load.error.messageKey} onRetry={load.error.retryable ? retryLoad : undefined} />;
  } else if (phase === "sent" || (answered && phase === "choose" && picked === null)) {
    const justSent = phase === "sent";
    body = (
      <div role="status" className="flex flex-col items-center gap-4 rounded-card bg-surface p-8 text-center">
        <CheckCircle2Icon aria-hidden="true" className="size-10 text-action" />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl">{justSent ? t.thanksTitle : t.alreadyTitle}</h2>
          <p className="text-text-soft">{justSent ? t.thanksBody : t.alreadyBody}</p>
        </div>
        {(justSent ? (votesLeft ?? 0) > 0 : true) && (
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              setAnswered(false);
              setPhase("choose");
              setPicked(null);
              setNote("");
            }}
          >
            {justSent ? t.another : t.moreAnswer}
          </Button>
        )}
      </div>
    );
  } else if (manifest) {
    body = (
      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-base font-bold">{t.helperPick}</legend>
          <div className="grid gap-4 md:grid-cols-2" role="radiogroup" aria-label={t.helperGroup}>
            {manifest.items.map((item) => (
              <label key={item.key} data-look={item.key} className="relative flex cursor-pointer flex-col gap-2">
                <input
                  type="radio"
                  name="look"
                  value={item.key}
                  checked={picked === item.key}
                  onChange={() => setPicked(item.key)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "block overflow-hidden rounded-image bg-peach ring-2 ring-transparent transition-shadow duration-(--dur-quick)",
                    "peer-checked:ring-action peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt={t.optionAlt(item.label)} className="block w-full" />
                </span>
                {picked === item.key && (
                  <span className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-action px-3 py-1.5 text-sm font-semibold text-on-action">
                    <HeartIcon aria-hidden="true" className="size-4 fill-current" />
                    {t.feelsLikeYou}
                  </span>
                )}
                <span className="flex flex-col px-1">
                  <span className="font-bold">{item.label}</span>
                  <span className="text-xs text-text-muted">{t.helperLabel}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="helper-note" className="text-base font-bold">
            {t.noteLabel}
          </label>
          <textarea
            id="helper-note"
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            placeholder={t.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
            className="w-full resize-none rounded-card bg-surface px-5 py-4 text-base text-text placeholder:text-text-muted"
          />
          <p className="self-end text-xs text-text-muted">{t.noteCount(note.length, NOTE_MAX)}</p>
        </div>

        {problem &&
          (problem.code === "RATE_LIMITED" ? (
            <p role="alert" className="rounded-card bg-surface px-5 py-4 font-semibold">
              {t.noMore}
            </p>
          ) : (
            <ErrorState messageKey={problem.messageKey} headingLevel={3} />
          ))}

        <p className="flex items-start gap-2 text-sm text-text-muted">
          <LinkIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t.helperPrivacy(formatDateTimeLocal(manifest.expiresAt))}
        </p>
      </div>
    );
  }

  const choosing = Boolean(manifest) && phase !== "sent" && !(answered && picked === null);

  return (
    <div className="grain flex min-h-dvh w-full flex-1 flex-col bg-dawn-5" style={{ "--shell-top": "var(--dawn-5)" } as React.CSSProperties}>
    <div className="mx-auto flex w-full max-w-180 flex-1 flex-col">
      <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 md:px-8">
        <p className="text-sm font-semibold text-text-muted">{app.name}</p>
      </header>
      <main id="main" className="flex flex-1 flex-col gap-6 px-5 pt-2 pb-8 md:px-8">
        <div className="flex flex-col gap-2">
          <h1 ref={heading} tabIndex={-1} className="text-3xl leading-tight outline-none md:text-4xl">
            {load.state === "ended" ? t.endedTitle : t.helperTitle}
          </h1>
          {manifest && choosing && <p className="text-text-soft">{t.helperIntro}</p>}
        </div>
        {body}
      </main>
      {choosing && (
        <BottomBar className="md:items-center">
          <Button size="lg" full className="md:max-w-sm" disabled={!picked} loading={phase === "sending"} onClick={(e) => void send(e)}>
            {phase === "sending" ? t.sending : t.send}
          </Button>
        </BottomBar>
      )}
    </div>
      {flight && <HeartFlight from={flight.from} to={flight.to} onDone={endFlight} />}
    </div>
  );
}
