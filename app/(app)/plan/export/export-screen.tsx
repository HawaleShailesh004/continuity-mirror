"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2Icon, DownloadIcon, PrinterIcon, Share2Icon } from "lucide-react";
import { PhotoFrame } from "@/components/cm/photo-frame";
import { Screen } from "@/components/cm/screen";
import { EmptyState, ErrorState, SampleModeBanner } from "@/components/cm/states";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { copy } from "@/content/copy";
import { exportPack } from "@/content/copy/exportPack";
import { insuranceGuides, programmes } from "@/lib/catalog";
import { formatDate } from "@/lib/client/format";
import { useObjectUrl } from "@/lib/client/hooks";
import { buildPackModel, pdfImage } from "@/lib/client/pack";
import { usePlan } from "@/lib/client/use-plan";

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

  return (
    <Screen title={exportPack.title} backHref="/plan">
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
        <div className="flex flex-col gap-8 md:grid md:grid-cols-2 md:items-start md:gap-12">
          <section aria-labelledby="pack-preview" className="flex flex-col gap-4">
            <h2 id="pack-preview" className="sr-only">
              {exportPack.previewAlt}
            </h2>
            <div className="grid grid-cols-3 gap-2.5 rounded-card bg-surface p-4">
              {baselineUrl && <PhotoFrame src={baselineUrl} alt={copy.compare.altBefore} aspect="aspect-3/4" />}
              {looks.slice(0, 2).map((l) => (
                <PhotoFrame
                  key={l.row.clientRequestId}
                  src={l.imageUrl ?? ""}
                  alt={copy.compare.alt(l.style.label, l.ownColour)}
                  generated
                  hideLabel
                  aspect="aspect-3/4"
                />
              ))}
              <p className="col-span-3 mt-1 text-xs text-text-muted">{copy.label.styleDirection}</p>
            </div>
            <p className="text-sm font-semibold text-text-soft">{exportPack.looksCount(looks.length)}</p>
          </section>

          <section aria-labelledby="pack-contents" className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <h2 id="pack-contents" className="text-lg">
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
              <div className="flex flex-col gap-2.5">
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
              </div>
            )}
          </section>
        </div>
      )}
    </Screen>
  );
}
