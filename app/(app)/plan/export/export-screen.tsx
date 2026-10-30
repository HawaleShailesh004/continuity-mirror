"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CheckCircle2Icon, DownloadIcon, PrinterIcon, Share2Icon } from "lucide-react";
import * as m from "motion/react-m";
import { PackPaper } from "@/components/cm/pack-paper";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { Screen } from "@/components/cm/screen";
import { EmptyState, ErrorState, SampleModeBanner } from "@/components/cm/states";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { exportPack } from "@/content/copy/exportPack";
import { insuranceGuides, programmes } from "@/lib/catalog";
import { formatDate } from "@/lib/client/format";
import { fadeRise } from "@/lib/client/motion";
import { useObjectUrl } from "@/lib/client/hooks";
import { buildPackModel, pdfImage } from "@/lib/client/pack";
import { usePlan } from "@/lib/client/use-plan";

const subscribeNever = () => () => {};

type Built = { blob: Blob; file: File };

/*
 * Consultation Pack: the saved looks, what to ask for, questions for the
 * fitter and money notes, as a short PDF made right here in the browser
 * (react-pdf, built-in fonts). Photos are never uploaded to make it. It
 * rebuilds whenever the plan changes, so it always matches what's on screen.
 */
export function ExportScreen() {
  const { ready, plan, looks, snapshot, baselineBlob, baselineUrl, browBlob, isSample } = usePlan();
  // The outcome is tied to the inputs it was made from, so a stale pack never shows for new inputs.
  const [outcome, setOutcome] = useState<{ key: string; built?: Built; failed?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const model = useMemo(
    () =>
      buildPackModel({
        looks: looks.map((l) => ({ style: l.style, ownColour: l.ownColour })),
        snapshot,
        plan,
        guides: insuranceGuides,
        programmes,
        sample: isSample,
      }),
    [looks, snapshot, plan, isSample],
  );

  // Rebuild only when what goes into the pack changes.
  const key = JSON.stringify([model, looks.map((l) => l.row.clientRequestId), Boolean(baselineBlob), Boolean(browBlob), attempt]);

  const current = outcome?.key === key ? outcome : null;
  const built = current?.built ?? null;
  const failed = Boolean(current?.failed);

  useEffect(() => {
    if (!ready || looks.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ pdf }, { ConsultationPack }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("@/components/pdf/consultation-pack"),
        ]);
        const before = baselineBlob ? await pdfImage(baselineBlob) : null;
        const images = await Promise.all(looks.map((l) => (l.imageBlob ? pdfImage(l.imageBlob) : null)));
        const browImage = model.brows && browBlob ? await pdfImage(browBlob) : null;
        const blob = await pdf(
          <ConsultationPack
            model={model}
            before={before}
            images={images}
            browImage={browImage}
            date={formatDate(new Date().toISOString())}
          />,
        ).toBlob();
        if (cancelled) return;
        setOutcome({ key, built: { blob, file: new File([blob], exportPack.fileName, { type: "application/pdf" }) } });
      } catch {
        if (!cancelled) setOutcome({ key, failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
    // `key` captures every input; the objects themselves change identity on every live-query tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const url = useObjectUrl(built?.blob);

  // `built` only exists after the browser has made it, so this never runs on the server.
  const canShare = built ? Boolean(navigator.canShare?.({ files: [built.file] })) : false;

  const share = async () => {
    if (!built) return;
    try {
      await navigator.share({ files: [built.file], title: exportPack.shareTitle });
    } catch {
      /* the person closed the share sheet: nothing to do */
    }
  };

  const empty = ready && looks.length === 0;
  const calm = useCalmMotion();
  // Read the clock after mount (never during render), so the page can be prerendered.
  const today = useSyncExternalStore(subscribeNever, () => formatDate(new Date().toISOString()), () => "");

  return (
    <Screen
      title={exportPack.title}
      backHref="/plan"
      stage={
        !empty && ready ? (
          <div className="flex flex-col gap-3">
            <PackPaper beforeSrc={baselineUrl} looks={looks} snapshot={snapshot} date={today} sample={isSample} />
            <p className="text-center text-sm font-semibold text-text-soft">{exportPack.looksCount(looks.length)}</p>
          </div>
        ) : undefined
      }
    >
      {isSample && <SampleModeBanner />}
      <p className="text-text-soft">{exportPack.intro}</p>

      {!ready ? null : empty ? (
        <EmptyState
          title={exportPack.empty}
          action={
            <ButtonLink href="/paths" size="lg" direction="back">
              {exportPack.emptyCta}
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="pack-contents" className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <h2 id="pack-contents" className="font-display text-xl font-medium md:text-2xl">
                {exportPack.contentsTitle}
              </h2>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-text-soft">
                {[...exportPack.contents, ...(model.brows ? [exportPack.browsLine] : [])].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            {failed ? (
              <ErrorState
                title={exportPack.failedTitle}
                body={exportPack.failedBody}
                onRetry={() => setAttempt((n) => n + 1)}
                headingLevel={3}
              />
            ) : !built || !url ? (
              <p role="status" className="rounded-card bg-surface px-5 py-4 text-sm font-semibold text-text-soft">
                {exportPack.making}
              </p>
            ) : (
              // The download arrives once the sheet has finished printing.
              <m.div
                variants={calm ? fadeRise.calm : fadeRise.full}
                initial="hidden"
                animate="visible"
                transition={calm ? undefined : { delay: 2.4 }}
                className="flex flex-col gap-2.5"
              >
                <p role="status" className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2Icon aria-hidden="true" className="size-5 text-action" />
                  {exportPack.ready}
                </p>
                <a href={url} download={exportPack.fileName} className={buttonClass({ size: "lg", full: true })}>
                  <DownloadIcon aria-hidden="true" className="size-5" />
                  {exportPack.download}
                </a>
                {canShare && (
                  <Button variant="secondary" size="lg" full onClick={() => void share()}>
                    <Share2Icon aria-hidden="true" className="size-5" />
                    {exportPack.share}
                  </Button>
                )}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: "secondary", size: "lg", full: true })}
                >
                  <PrinterIcon aria-hidden="true" className="size-5" />
                  {exportPack.print}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </m.div>
            )}
          </section>
        </div>
      )}
    </Screen>
  );
}
