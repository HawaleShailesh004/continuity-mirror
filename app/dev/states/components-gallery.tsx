"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { ResultCheck } from "@/lib/client/check/judge";
import { AskForSpec } from "@/components/cm/ask-for-spec";
import { BudgetNote } from "@/components/cm/budget-note";
import { CheckedRow } from "@/components/cm/checked-row";
import { Checklist } from "@/components/cm/checklist";
import { CompareView } from "@/components/cm/compare-view";
import { CueChecklist } from "@/components/cm/cue-checklist";
import { HairPicker } from "@/components/cm/hair-picker";
import { HowMadeDrawer } from "@/components/cm/how-made-drawer";
import { JobProgress } from "@/components/cm/job-progress";
import { MoneyHelp } from "@/components/cm/money-help";
import { PathCard } from "@/components/cm/path-card";
import { PhotoFrame } from "@/components/cm/photo-frame";
import { PlanCard } from "@/components/cm/plan-card";
import { PlanFilters } from "@/components/cm/plan-filters";
import { PlanPill } from "@/components/cm/plan-pill";
import { PrivacyReceipt } from "@/components/cm/privacy-receipt";
import { RegrowthStage } from "@/components/cm/regrowth-stage";
import { RetakeCoach } from "@/components/cm/retake-coach";
import { ShareSheet } from "@/components/cm/share-sheet";
import { ShareCardView } from "@/components/cm/support-circle";
import { EmptyState, ErrorState, OfflineBanner, SampleModeBanner } from "@/components/cm/states";
import { StepProgress } from "@/components/cm/step-progress";
import { VerdictControl } from "@/components/cm/verdict-control";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { CheckboxRow } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { Sheet } from "@/components/ui/sheet";
import { copy } from "@/content/copy";
import { insuranceGuides, programmes, type ProgrammeCountry as Country } from "@/lib/catalog";
import { cuesFromSnapshot, type CueKey } from "@/lib/client/cues";
import type { ShareRow } from "@/lib/client/db";
import {
  failedError,
  fixtureJob,
  fixtureReceipt,
  fixtureRoutes,
  persona,
  personaSnapshot,
  styleById,
} from "@/lib/client/fixtures";
import { MESSAGE_KEYS, type Verdict } from "@/lib/contracts";
import { errorBody } from "@/lib/contracts/errors";

const BEFORE = persona.baseline;
const closest = fixtureRoutes[0]!;
const style = styleById(closest.styleId);

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg">{title}</h2>
      {children}
    </section>
  );
}

/** What a successful repair stores: outcome "checked" plus the repaired state (markRepair in lib/client/jobs.ts). */
const ADJUSTED: ResultCheck = {
  outcome: "checked",
  face: { status: "unchanged", drift: 0.004 },
  colour: { status: "drifted", baselineHex: "#2A1D18", resultHex: "#1B170D", deltaE: 5.4 },
  repaired: { state: "adjusted", deltaEAfter: 1.2 },
  checkedAt: "2026-11-01T00:00:00.000Z",
};

const Row = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-start gap-4">{children}</div>;
const Cell = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-2 ${className ?? ""}`}>
    <p className="text-xs font-semibold text-text-muted">{label}</p>
    {children}
  </div>
);

/** F1 components in every state. Developer-facing labels are not in content/copy.ts. */
export function ComponentGallery() {
  const [chip, setChip] = useState<string | null>("b");
  const [seg, setSeg] = useState<string | null>("b");
  const [sheet, setSheet] = useState(false);
  const [checked, setChecked] = useState(false);
  const [verdict, setVerdict] = useState<Verdict["feelsLikeMe"] | null>("unsure");
  const [changed, setChanged] = useState<CueKey[]>(["length"]);
  const [deleted, setDeleted] = useState(false);
  const [budget, setBudget] = useState<"low" | "mid" | "high">("mid");
  const [climate, setClimate] = useState<"hot" | "temperate" | "cold">("hot");
  const [care, setCare] = useState<1 | 2 | 3>(2);
  const [country, setCountry] = useState<Country>("IN");
  const [list, setList] = useState<Record<string, boolean>>({ photo: true });
  const [hex, setHex] = useState<string | undefined>();
  const [shareOk, setShareOk] = useState(false);
  const [shareFails, setShareFails] = useState(false);
  const [stageSaved, setStageSaved] = useState(false);
  const cues = cuesFromSnapshot(personaSnapshot);

  const running = fixtureJob({ id: "r", routeId: "closest", styleId: "coily-chin", status: "running", runningStep: 0 });
  const colourStep = fixtureJob({ id: "c", routeId: "closest", styleId: "bob-curly", status: "running", runningStep: 1 });
  const queued = fixtureJob({ id: "q", routeId: "closest", styleId: "coily-chin", status: "queued" });
  const done = fixtureJob({ id: "d", routeId: "closest", styleId: "coily-chin" });
  const failed = fixtureJob({ id: "f", routeId: "new-chapter", styleId: "bob-curly", status: "failed", error: failedError });
  const rejected = fixtureJob({
    id: "x",
    routeId: "easier",
    styleId: "bob-curly",
    status: "failed",
    error: errorBody("YOUCAM_REJECTED", { messageKey: "capture.retake.shoulders", youcamCode: "error_no_shoulder" }),
  });

  const card = (job: typeof done, extra: Partial<Parameters<typeof PathCard>[0]> = {}) => (
    <PathCard
      name={copy.paths.routes.closest.name}
      blurb={copy.paths.routes.closest.blurb}
      baselineSrc={BEFORE}
      resultSrc={closest.image}
      resultAlt={copy.compare.alt(style.label, true)}
      status={job.status}
      steps={job.steps}
      error={job.error}
      href="/paths/closest"
      {...extra}
    />
  );

  return (
    <>
      <Block title="Button · ButtonLink">
        <Row>
          <Button size="lg">Primary lg</Button>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <ButtonLink href="/about" variant="secondary">
            ButtonLink
          </ButtonLink>
        </Row>
      </Block>

      <Block title="ChoiceChips · Disclosure · CheckboxRow · Sheet · ConfirmDialog · Toast">
        <Row>
          <Cell label="chip" className="w-full max-w-md">
            <ChoiceChips
              label="Chips"
              value={chip}
              onValueChange={setChip}
              options={[
                { value: "a", label: "Black", swatch: "#1C1714" },
                { value: "b", label: "Dark brown", swatch: "#3B2A20" },
                { value: "c", label: "Light brown", swatch: "#8A6446" },
                { value: "d", label: "Grey or silver", swatch: "#BEBDB8" },
              ]}
            />
          </Cell>
          <Cell label="segment" className="w-full max-w-sm">
            <ChoiceChips
              variant="segment"
              label="Segment"
              value={seg}
              onValueChange={setSeg}
              options={[
                { value: "a", label: "Closest" },
                { value: "b", label: "Easier" },
                { value: "c", label: "New chapter" },
              ]}
            />
          </Cell>
        </Row>
        <Row>
          <Cell label="disclosure" className="w-full max-w-sm">
            <Disclosure title={copy.compare.changedTitle}>
              <p className="text-text-soft">{copy.compare.changedHint}</p>
            </Disclosure>
          </Cell>
          <Cell label="checkbox" className="w-full max-w-sm">
            <CheckboxRow id="g-check" checked={checked} onCheckedChange={setChecked}>
              {copy.consent.helperPermission}
            </CheckboxRow>
          </Cell>
          <Cell label="overlays">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setSheet(true)}>
                Open sheet
              </Button>
              <ConfirmDialog
                trigger={<Button variant="secondary">Confirm dialog</Button>}
                title={copy.privacy.deleteConfirmTitle}
                body={copy.privacy.deleteConfirmBody}
                confirmLabel={copy.privacy.deleteConfirm}
                onConfirm={() => toast(copy.common.done)}
              />
              <Button variant="secondary" onClick={() => toast(copy.compare.saved)}>
                Toast
              </Button>
            </div>
            <Sheet open={sheet} onOpenChange={setSheet} title={copy.compare.variantTitle} description={copy.compare.variantBody}>
              <p>Sheet content. Drag down or press Escape to close.</p>
            </Sheet>
          </Cell>
        </Row>
      </Block>

      <Block title="StepProgress · BudgetNote">
        <Row>
          <StepProgress step={1} total={5} />
          <StepProgress step={3} total={5} />
          <StepProgress step={5} total={5} />
          <BudgetNote remaining={8} />
          <BudgetNote remaining={2} />
          <BudgetNote remaining={0} />
        </Row>
      </Block>

      <Block title="PhotoFrame">
        <Row>
          <Cell label="baseline, sample" className="w-40">
            <PhotoFrame src={BEFORE} alt={copy.compare.altBefore} sample />
          </Cell>
          <Cell label="generated (label required)" className="w-40">
            <PhotoFrame src={closest.image} alt={copy.compare.alt(style.label, true)} generated />
          </Cell>
        </Row>
      </Block>

      <Block title="CompareView (side by side and slide; toggle inside)">
        <CompareView
          beforeSrc={BEFORE}
          afterSrc={closest.image}
          afterAlt={copy.compare.alt(style.label, true)}
          routeName={copy.paths.routes.closest.name}
          sample
        />
      </Block>

      <Block title="VerdictControl · CueChecklist">
        <div className="max-w-md">
          <VerdictControl value={verdict} onValueChange={setVerdict} cues={cues} changed={changed} onChangedChange={setChanged} />
        </div>
        <CueChecklist cues={cues} changed={[]} onChangedChange={() => {}} />
      </Block>

      <Block title="JobProgress">
        <Row>
          <Cell label="queued" className="w-64">
            <JobProgress status={queued.status} steps={queued.steps} />
          </Cell>
          <Cell label="step 1 of 2" className="w-64">
            <JobProgress status={running.status} steps={running.steps} />
          </Cell>
          <Cell label="step 2 of 2 (colour)" className="w-64">
            <JobProgress status={colourStep.status} steps={colourStep.steps} />
          </Cell>
          <Cell label="slow (> 45 s)" className="w-64">
            <JobProgress status={running.status} steps={running.steps} slow onKeepWaiting={() => {}} onLater={() => {}} />
          </Cell>
          <Cell label="done" className="w-64">
            <JobProgress status={done.status} steps={done.steps} />
          </Cell>
        </Row>
      </Block>

      <Block title="PathCard">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Cell label="queued">{card(queued)}</Cell>
          <Cell label="running">{card(running)}</Cell>
          <Cell label="slow">{card(running, { slow: true })}</Cell>
          <Cell label="succeeded + verdict">{card(done, { verdict: "yes" })}</Cell>
          <Cell label="failed, retryable">{card(failed, { onRetry: () => {} })}</Cell>
          <Cell label="rejected (not retryable)">{card(rejected)}</Cell>
        </div>
      </Block>

      <Block title="RetakeCoach">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(["capture.retake.shoulders", "capture.retake.faceForward", "capture.retake.faceVisible", "capture.retake.size", "capture.hairTooShort"] as const).map((key) => (
            <RetakeCoach key={key} messageKey={key} onRetake={() => {}} onChooseOther={() => {}}>
              {key === "capture.hairTooShort" && (
                <ButtonLink href="/plan" size="lg" full>
                  {copy.plan.title}
                </ButtonLink>
              )}
            </RetakeCoach>
          ))}
        </div>
      </Block>

      <Block title="ErrorState · EmptyState · banners">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ErrorState messageKey="generic.serviceBusy" onRetry={() => {}} headingLevel={3} />
          <ErrorState messageKey="budget.sessionReached" headingLevel={3} />
          <ErrorState messageKey="a.key.from.the.future" onRetry={() => {}} headingLevel={3} />
          <EmptyState title={copy.states.emptyPlanTitle} body={copy.states.emptyPlanBody} action={<Button size="lg">{copy.states.emptyPlanCta}</Button>} />
        </div>
        <OfflineBanner />
        <SampleModeBanner />
        <SampleModeBanner mock />
      </Block>

      <Block title="HowMadeDrawer">
        <HowMadeDrawer provenance={done.provenance} units={done.steps.map((s) => s.units)} />
      </Block>

      <Block title="PrivacyReceipt">
        <div className="max-w-xl">
          <PrivacyReceipt receipt={fixtureReceipt} serverKnown device={{ photos: 1, previews: 3 }} deleted={deleted} onDeleteAll={() => setDeleted(true)} />
          {deleted && (
            <Button variant="secondary" className="mt-4" onClick={() => setDeleted(false)}>
              Reset
            </Button>
          )}
        </div>
      </Block>

      <Block title="Plan pieces">
        <div className="grid gap-6 md:grid-cols-2">
          <ul className="flex flex-col gap-3">
            <PlanCard style={style} imageSrc={closest.image} imageAlt={copy.compare.alt(style.label, true)} notes={[copy.plan.noteCare]} onRemove={() => {}} />
            <PlanCard style={style} imageSrc={closest.image} imageAlt={copy.compare.alt(style.label, true)} badge={copy.regrowth.planBadge(copy.regrowth.stages["regrowth-6m"].short)} onRemove={() => {}} />
          </ul>
          <AskForSpec style={style} />
          <PlanFilters budget={budget} climate={climate} careEffort={care} onBudget={setBudget} onClimate={setClimate} onCareEffort={setCare} />
          <MoneyHelp programmes={programmes} guides={insuranceGuides} country={country} onCountry={setCountry} />
          <Checklist
            items={(Object.keys(copy.plan.checklist) as (keyof typeof copy.plan.checklist)[]).map((id) => ({ id, label: copy.plan.checklist[id] }))}
            checked={list}
            onToggle={(id, v) => setList((l) => ({ ...l, [id]: v }))}
          />
        </div>
        <PlanPill count={2} />
      </Block>

      <Block title="CheckedRow · adjusted, sample wording, first-version toggle">
        <div className="grid max-w-3xl gap-4 md:grid-cols-2">
          <CheckedRow check={ADJUSTED} />
          <CheckedRow check={ADJUSTED} sample firstVersion={{ showing: false, onToggle: () => {} }} />
          <CheckedRow check={ADJUSTED} sample firstVersion={{ showing: true, onToggle: () => {} }} />
        </div>
      </Block>

      <Block title="HairPicker">
        <HairPicker src={BEFORE} alt={copy.snapshot.photoAlt} value={hex} fallbackHex="#1C1714" onChange={setHex} />
      </Block>

      <Block title="Regrowth stage · every state">
        <ol className="grid max-w-3xl gap-10">
          <RegrowthStage
            when={copy.regrowth.stages["regrowth-3m"].when}
            styleName={style.label}
            beforeSrc={BEFORE}
            resultAlt="running"
            status="running"
            steps={running.steps}
            saved={false}
            onToggleSaved={() => {}}
          />
          <RegrowthStage
            when={copy.regrowth.stages["regrowth-6m"].when}
            styleName={style.label}
            beforeSrc={BEFORE}
            resultAlt="failed"
            status="failed"
            steps={failed.steps}
            error={failed.error}
            saved={false}
            onToggleSaved={() => {}}
            onRetry={() => {}}
          />
          <RegrowthStage
            when={copy.regrowth.stages["regrowth-12m"].when}
            styleName={style.label}
            beforeSrc={BEFORE}
            resultSrc={closest.image}
            resultAlt={copy.regrowth.alt(copy.regrowth.stages["regrowth-12m"].when, style.label)}
            status="succeeded"
            steps={done.steps}
            note='Same style and colour as "Familiar, easier", so this is the same result.'
            saved={stageSaved}
            onToggleSaved={() => setStageSaved((v) => !v)}
          />
        </ol>
      </Block>

      <Block title="Support circle · share sheet">
        <ul className="grid max-w-xl gap-4">
          <ShareCardView
            labels={["Short bob", "Pixie"]}
            expiresAt="2030-01-08T10:00:00.000Z"
            results={{ items: [{ key: "i1", label: "Short bob", votes: 0 }, { key: "i2", label: "Pixie", votes: 0 }], notes: [], expiresAt: "2030-01-08T10:00:00.000Z" }}
            onRefresh={() => {}}
            onStop={() => {}}
            onDismiss={() => {}}
          />
          <ShareCardView
            labels={["Short bob", "Pixie"]}
            expiresAt="2030-01-08T10:00:00.000Z"
            results={{
              items: [{ key: "i1", label: "Short bob", votes: 3 }, { key: "i2", label: "Pixie", votes: 1 }],
              notes: [{ itemKey: "i1", note: "This one looks like you <b>most</b>.", createdAt: "2030-01-02T10:00:00.000Z" }],
              expiresAt: "2030-01-08T10:00:00.000Z",
            }}
            onRefresh={() => {}}
            onStop={() => {}}
            onDismiss={() => {}}
          />
          <ShareCardView labels={["Short bob"]} expiresAt="2030-01-08T10:00:00.000Z" failed onRefresh={() => {}} onStop={() => {}} onDismiss={() => {}} />
          <ShareCardView labels={["Short bob"]} expiresAt="2030-01-08T10:00:00.000Z" ended onRefresh={() => {}} onStop={() => {}} onDismiss={() => {}} />
        </ul>
        <Row>
          <Button variant="secondary" onClick={() => setShareOk(true)}>
            Share sheet (works)
          </Button>
          <Button variant="secondary" onClick={() => setShareFails(true)}>
            Share sheet (fails)
          </Button>
        </Row>
        {[
          { open: shareOk, set: setShareOk, fails: false },
          { open: shareFails, set: setShareFails, fails: true },
        ].map(({ open, set, fails }) => (
          <ShareSheet
            key={String(fails)}
            open={open}
            onOpenChange={set}
            looks={[
              { id: "a", label: "Short bob", thumbUrl: closest.image },
              { id: "b", label: "Pixie", thumbUrl: closest.image },
            ]}
            onCreate={async (ids): Promise<ShareRow> => {
              await new Promise((r) => setTimeout(r, 600));
              if (fails) throw new Error("offline");
              return {
                token: "x".repeat(22),
                ownerKey: "key",
                url: "https://example.com/share/" + "x".repeat(22),
                labels: ids,
                expiresAt: "2030-01-08T10:00:00.000Z",
                createdAt: "2030-01-01T10:00:00.000Z",
              };
            }}
          />
        ))}
      </Block>

      <Block title={`Backend messages · all ${MESSAGE_KEYS.length} keys`}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {MESSAGE_KEYS.map((key) => (
            <div key={key} className="flex flex-col gap-1 rounded-card bg-surface p-4">
              <code className="text-xs text-text-muted">{key}</code>
              <p className="font-bold">{copy.messages[key].title}</p>
              <p className="text-sm text-text-soft">{copy.messages[key].body}</p>
            </div>
          ))}
        </div>
      </Block>
    </>
  );
}
