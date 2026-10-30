"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { BottomBar } from "@/components/cm/bottom-bar";
import { AskForSpec } from "@/components/cm/ask-for-spec";
import { Checklist } from "@/components/cm/checklist";
import { MoneyHelp } from "@/components/cm/money-help";
import { PhotoStage } from "@/components/cm/photo-stage";
import { PlanCard } from "@/components/cm/plan-card";
import { PlanFilters } from "@/components/cm/plan-filters";
import { Screen } from "@/components/cm/screen";
import { ShareSheet } from "@/components/cm/share-sheet";
import { EmptyState } from "@/components/cm/states";
import { SupportCircle } from "@/components/cm/support-circle";
import { Button, ButtonLink } from "@/components/ui/button";
import { copy } from "@/content/copy";
import { insuranceGuides, programmes } from "@/lib/catalog";
import { askForLine } from "@/lib/client/ask-for";
import { db } from "@/lib/client/db";
import { formatDate } from "@/lib/client/format";
import { useCapability } from "@/lib/client/hooks";
import { toggleLook, updatePlan } from "@/lib/client/journey";
import { createShareLink } from "@/lib/client/share";
import { usePlan } from "@/lib/client/use-plan";

const PRICE_ORDER = { low: 0, mid: 1, high: 2 } as const;
const checklistItems = (Object.keys(copy.plan.checklist) as (keyof typeof copy.plan.checklist)[]).map((id) => ({
  id,
  label: copy.plan.checklist[id],
}));

const h2 = "font-display text-xl font-medium md:text-2xl";

/*
 * My Plan as a lookbook. A cover (the person's own photo, how many looks, when)
 * sits beside the looks; each look is a large card with its "ask for" line in
 * the person's own terms. Under them, in this order: Ask the fitter · Brows ·
 * Money help · Before treatment, reachable from the cover. Everything is read
 * from and written to this device.
 */
export function PlanScreen() {
  const { ready, plan, looks, baselineBlob, baselineUrl, browUrl, snapshot, isSample } = usePlan();
  // Optional modules appear only when the server offers them (or the person already has something in them).
  const browsOn = useCapability("brows");
  const regrowthOn = useCapability("regrowth");
  const sharesOn = useCapability("shares");
  // A handful at most, so sort here rather than index it.
  const shares = useLiveQuery(async () => (await db.shares.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), []);
  const [shareOpen, setShareOpen] = useState(false);
  const recipe = plan?.browRecipe;

  const budget = plan?.budget ?? "mid";
  const climate = plan?.climate ?? "temperate";
  const care = plan?.careEffort ?? 2;
  const country = plan?.country === "CA" || plan?.country === "IN" || plan?.country === "UK" ? plan.country : "US";
  const checked = plan?.checklist ?? {};

  const empty = ready && looks.length === 0;
  // One "what to ask for" per style and colour choice, even if two saved looks share it.
  const askLooks = looks.filter((l, i) => looks.findIndex((x) => x.style.id === l.style.id && x.ownColour === l.ownColour) === i);
  const savedOn = looks.map((l) => l.row.createdAt).sort()[0];

  const notesFor = (style: (typeof looks)[number]["style"]) => [
    ...(style.careEffort > care ? [copy.plan.noteCare] : []),
    ...(PRICE_ORDER[style.priceBand] > PRICE_ORDER[budget] ? [copy.plan.noteBudget] : []),
  ];

  const showBrows = browsOn || Boolean(recipe);
  const showShare = sharesOn || (shares?.length ?? 0) > 0;
  const nav = [
    { href: "#looks-title", label: copy.plan.nav.looks },
    { href: "#ask-title", label: copy.plan.nav.ask },
    ...(showBrows ? [{ href: "#brows-title", label: copy.plan.nav.brows }] : []),
    { href: "#money-title", label: copy.plan.nav.money },
    { href: "#checklist-title", label: copy.plan.nav.before },
  ];

  const cover = (
    <div className="flex items-center gap-4 md:flex-col md:items-stretch md:gap-5">
      {baselineUrl && (
        <PhotoStage src={baselineUrl} alt={copy.compare.altBefore} sample={isSample} aspect="aspect-3/4" className="w-20 shrink-0 md:w-full md:max-w-xs" />
      )}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="font-display text-xl font-medium">{copy.plan.coverTitle}</p>
          {looks.length > 0 && (
            <p className="text-sm text-text-soft">
              {copy.plan.coverCount(looks.length)}
              {savedOn && ` · ${formatDate(savedOn)}`}
            </p>
          )}
        </div>
        {looks.length > 0 && (
          <nav aria-label={copy.plan.navLabel} className="hidden md:block">
            <ul className="flex flex-col gap-0.5">
              {nav.map((n) => (
                <li key={n.href}>
                  <a href={n.href} className="flex min-h-11 items-center text-sm font-semibold text-text-soft hover:text-text">
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );

  return (
    <Screen
      title={copy.plan.title}
      backHref="/paths"
      stage={!empty && ready ? cover : undefined}
      wide
      bottom={
        looks.length > 0 && (
          <BottomBar className="md:items-center">
            <ButtonLink href="/plan/export" size="lg" full className="md:max-w-sm">
              {copy.plan.cta}
            </ButtonLink>
            <p className="text-center text-xs text-text-muted">{copy.plan.ctaHint}</p>
          </BottomBar>
        )
      }
    >
      <p className="text-text-soft">{copy.plan.intro}</p>

      {!ready ? null : empty ? (
        <EmptyState
          title={copy.states.emptyPlanTitle}
          body={copy.states.emptyPlanBody}
          action={
            <ButtonLink href="/paths" size="lg" direction="back">
              {copy.states.emptyPlanCta}
            </ButtonLink>
          }
        />
      ) : (
        <>
          <nav aria-label={copy.plan.navLabel} className="-mx-5 overflow-x-auto px-5 md:hidden">
            <ul className="flex w-max gap-2">
              {nav.map((n) => (
                <li key={n.href}>
                  <a href={n.href} className="flex min-h-11 items-center rounded-full bg-surface-raised px-4 text-sm font-semibold shadow-pill">
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-labelledby="looks-title" className="flex scroll-mt-24 flex-col gap-4">
            <h2 id="looks-title" className={h2}>
              {copy.plan.looksTitle}
            </h2>
            <ul className="grid gap-6 sm:grid-cols-2">
              {looks.map((look) => (
                <PlanCard
                  key={look.row.clientRequestId}
                  style={look.style}
                  imageSrc={look.imageUrl ?? ""}
                  imageAlt={copy.compare.alt(look.style.label, look.ownColour)}
                  askLine={askForLine(look.style, snapshot, look.ownColour)}
                  notes={notesFor(look.style)}
                  badge={look.stage ? copy.regrowth.planBadge(copy.regrowth.stages[look.stage].short) : undefined}
                  onRemove={() => void toggleLook(look.row.clientRequestId)}
                />
              ))}
            </ul>
          </section>

          <section aria-labelledby="ask-title" className="flex scroll-mt-24 flex-col gap-3">
            <h2 id="ask-title" className={h2}>
              {copy.plan.askForTitle}
            </h2>
            <p className="-mt-1 text-sm text-text-muted">{copy.plan.askForHint}</p>
            {askLooks.map((l) => (
              <AskForSpec key={`${l.style.id}:${l.ownColour}`} style={l.style} line={askForLine(l.style, snapshot, l.ownColour)} />
            ))}
            <p className="rounded-card bg-peach px-5 py-4 text-sm text-text-soft">
              {copy.plan.climateNotes[climate]} <span className="font-semibold">{copy.plan.guidanceNote}</span>
            </p>
            <h3 className="mt-2 text-base">{copy.plan.filtersTitle}</h3>
            <p className="-mt-2 text-sm text-text-muted">{copy.plan.filtersHint}</p>
            <PlanFilters
              budget={budget}
              climate={climate}
              careEffort={care}
              onBudget={(v) => void updatePlan({ budget: v })}
              onClimate={(v) => void updatePlan({ climate: v })}
              onCareEffort={(v) => void updatePlan({ careEffort: v })}
            />
          </section>

          {showBrows && (
            <section aria-labelledby="brows-title" className="flex scroll-mt-24 flex-col gap-3">
              <h2 id="brows-title" className={h2}>
                {copy.brows.planTitle}
              </h2>
              {recipe && browUrl ? (
                <div className="flex flex-col gap-3 rounded-card bg-surface p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={browUrl} alt={copy.brows.recordAlt} className="w-full rounded-image" />
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-2 text-sm">
                    <dt className="text-text-muted">{copy.brows.planShape}</dt>
                    <dd className="font-semibold">{recipe.shapeName}</dd>
                    <dt className="text-text-muted">{copy.brows.planThickness}</dt>
                    <dd>{recipe.thickness}</dd>
                    <dt className="text-text-muted">{copy.brows.planColour}</dt>
                    <dd className="flex items-center gap-2">
                      <span aria-hidden="true" className="size-4 rounded-full border border-line" style={{ background: recipe.colourHex }} />
                      {recipe.colourHex}
                    </dd>
                    {recipe.notes && (
                      <>
                        <dt className="text-text-muted">{copy.brows.planNote}</dt>
                        <dd>{recipe.notes}</dd>
                      </>
                    )}
                  </dl>
                  <Link href="/brows" transitionTypes={["nav-forward"]} className="inline-flex min-h-11 items-center self-start px-2 font-semibold text-action">
                    {copy.brows.planEdit}
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3 rounded-card bg-surface p-5">
                  <p className="font-semibold">{copy.brows.planEmptyTitle}</p>
                  <p className="text-text-soft">{copy.brows.planEmptyBody}</p>
                  <ButtonLink href="/brows" variant="secondary">
                    {copy.brows.planCta}
                  </ButtonLink>
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="money-title" className="flex scroll-mt-24 flex-col gap-3">
            <h2 id="money-title" className={h2}>
              {copy.plan.moneyTitle}
            </h2>
            <MoneyHelp programmes={programmes} guides={insuranceGuides} country={country} onCountry={(c) => void updatePlan({ country: c })} />
          </section>

          <section aria-labelledby="checklist-title" className="flex scroll-mt-24 flex-col gap-3">
            <h2 id="checklist-title" className={h2}>
              {copy.plan.checklistTitle}
            </h2>
            <Checklist items={checklistItems} checked={checked} onToggle={(id, v) => void updatePlan({ checklist: { ...checked, [id]: v } })} />
          </section>

          {regrowthOn && (
            <section aria-labelledby="regrowth-title" className="flex flex-col gap-3">
              <h2 id="regrowth-title" className="text-lg">
                {copy.regrowth.planCardTitle}
              </h2>
              <div className="flex flex-col items-start gap-3 rounded-card bg-surface p-5">
                <p className="text-text-soft">{copy.regrowth.planCardBody}</p>
                <ButtonLink href="/regrowth" variant="secondary">
                  {copy.regrowth.planCardCta}
                </ButtonLink>
              </div>
            </section>
          )}

          {showShare && (
            <section aria-labelledby="share-title" className="flex flex-col gap-3">
              <h2 id="share-title" className="text-lg">
                {copy.share.planTitle}
              </h2>
              <p className="-mt-1 text-sm text-text-muted">{copy.share.planBody}</p>
              {shares && shares.length > 0 && <SupportCircle shares={shares} />}
              {sharesOn && (
                <Button variant="secondary" className="self-start" onClick={() => setShareOpen(true)}>
                  {copy.share.planCta}
                </Button>
              )}
            </section>
          )}
        </>
      )}

      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        looks={looks.flatMap((l) => (l.imageUrl ? [{ id: l.row.clientRequestId, label: l.style.label, thumbUrl: l.imageUrl }] : []))}
        onCreate={async (ids, days) => {
          if (!baselineBlob) throw new Error("no photo");
          const chosen = ids.flatMap((id) => {
            const look = looks.find((l) => l.row.clientRequestId === id);
            return look?.imageBlob ? [{ label: look.style.label, image: look.imageBlob }] : [];
          });
          return createShareLink({ baseline: baselineBlob, looks: chosen, days });
        }}
      />
    </Screen>
  );
}
