"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { BottomBar } from "@/components/cm/bottom-bar";
import { AskForSpec } from "@/components/cm/ask-for-spec";
import { Checklist } from "@/components/cm/checklist";
import { MoneyHelp } from "@/components/cm/money-help";
import { PlanCard } from "@/components/cm/plan-card";
import { PlanFilters } from "@/components/cm/plan-filters";
import { Screen } from "@/components/cm/screen";
import { ShareSheet } from "@/components/cm/share-sheet";
import { EmptyState } from "@/components/cm/states";
import { SupportCircle } from "@/components/cm/support-circle";
import { Button, ButtonLink } from "@/components/ui/button";
import { copy } from "@/content/copy";
import { insuranceGuides, programmes } from "@/lib/catalog";
import { db } from "@/lib/client/db";
import { useCapability } from "@/lib/client/hooks";
import { toggleLook, updatePlan } from "@/lib/client/journey";
import { createShareLink } from "@/lib/client/share";
import { usePlan } from "@/lib/client/use-plan";

const PRICE_ORDER = { low: 0, mid: 1, high: 2 } as const;
const checklistItems = (Object.keys(copy.plan.checklist) as (keyof typeof copy.plan.checklist)[]).map((id) => ({
  id,
  label: copy.plan.checklist[id],
}));

/*
 * My Plan: saved looks, the words to use at a wig shop, the user's own
 * filters, money help and a pre-treatment checklist, all read from and written
 * to this device. Two columns from 768 px. On a phone the order is looks → what
 * to ask for → situation → money → checklist; `order-*` keeps it that way
 * while the desktop columns group "what I chose" apart from "what to do about it".
 */
export function PlanScreen() {
  const { ready, plan, looks, baselineBlob, browUrl } = usePlan();
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
  // One "what to ask for" per style, even if two saved looks share it.
  const askStyles = looks.filter((l, i) => looks.findIndex((x) => x.style.id === l.style.id) === i);

  const notesFor = (style: (typeof looks)[number]["style"]) => [
    ...(style.careEffort > care ? [copy.plan.noteCare] : []),
    ...(PRICE_ORDER[style.priceBand] > PRICE_ORDER[budget] ? [copy.plan.noteBudget] : []),
  ];

  return (
    <Screen
      title={copy.plan.title}
      backHref="/paths"
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
        <div className="flex flex-col gap-8 md:grid md:grid-cols-2 md:items-start md:gap-12">
          <div className="contents md:flex md:flex-col md:gap-8">
            <section aria-labelledby="looks-title" className="order-1 flex flex-col gap-3 md:order-none">
              <h2 id="looks-title" className="text-lg">
                {copy.plan.looksTitle}
              </h2>
              <ul className="flex flex-col gap-3">
                {looks.map((look) => (
                  <PlanCard
                    key={look.row.clientRequestId}
                    style={look.style}
                    imageSrc={look.imageUrl ?? ""}
                    imageAlt={copy.compare.alt(look.style.label, look.ownColour)}
                    notes={notesFor(look.style)}
                    badge={look.stage ? copy.regrowth.planBadge(copy.regrowth.stages[look.stage].short) : undefined}
                    onRemove={() => void toggleLook(look.row.clientRequestId)}
                  />
                ))}
              </ul>
            </section>

            {(browsOn || recipe) && (
              <section aria-labelledby="brows-title" className="order-2 flex flex-col gap-3 md:order-none">
                <h2 id="brows-title" className="text-lg">
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

            {regrowthOn && (
              <section aria-labelledby="regrowth-title" className="order-4 flex flex-col gap-3 md:order-none">
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

            <section aria-labelledby="situation-title" className="order-5 flex flex-col gap-3 md:order-none">
              <h2 id="situation-title" className="text-lg">
                {copy.plan.filtersTitle}
              </h2>
              <p className="-mt-1 text-sm text-text-muted">{copy.plan.filtersHint}</p>
              <PlanFilters
                budget={budget}
                climate={climate}
                careEffort={care}
                onBudget={(v) => void updatePlan({ budget: v })}
                onClimate={(v) => void updatePlan({ climate: v })}
                onCareEffort={(v) => void updatePlan({ careEffort: v })}
              />
            </section>

            <section aria-labelledby="checklist-title" className="order-8 flex flex-col gap-2 md:order-none">
              <h2 id="checklist-title" className="text-lg">
                {copy.plan.checklistTitle}
              </h2>
              <Checklist
                items={checklistItems}
                checked={checked}
                onToggle={(id, v) => void updatePlan({ checklist: { ...checked, [id]: v } })}
              />
            </section>
          </div>

          <div className="contents md:flex md:flex-col md:gap-8">
            <section aria-labelledby="ask-title" className="order-3 flex flex-col gap-3 md:order-none">
              <h2 id="ask-title" className="text-lg">
                {copy.plan.askForTitle}
              </h2>
              <p className="-mt-1 text-sm text-text-muted">{copy.plan.askForHint}</p>
              {askStyles.map((l) => (
                <AskForSpec key={l.style.id} style={l.style} />
              ))}
              <p className="rounded-card bg-peach px-5 py-4 text-sm text-text-soft">
                {copy.plan.climateNotes[climate]} <span className="font-semibold">{copy.plan.guidanceNote}</span>
              </p>
            </section>

            <section aria-labelledby="money-title" className="order-6 flex flex-col gap-3 md:order-none">
              <h2 id="money-title" className="text-lg">
                {copy.plan.moneyTitle}
              </h2>
              <MoneyHelp
                programmes={programmes}
                guides={insuranceGuides}
                country={country}
                onCountry={(c) => void updatePlan({ country: c })}
              />
            </section>

            {(sharesOn || (shares?.length ?? 0) > 0) && (
              <section aria-labelledby="share-title" className="order-7 flex flex-col gap-3 md:order-none">
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
          </div>
        </div>
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
