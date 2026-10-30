"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PencilIcon } from "lucide-react";
import { BottomBar } from "@/components/cm/bottom-bar";
import { HairPicker } from "@/components/cm/hair-picker";
import { PhotoStage } from "@/components/cm/photo-stage";
import { Screen } from "@/components/cm/screen";
import { Button } from "@/components/ui/button";
import { ChoiceChips, type Choice } from "@/components/ui/choice-chips";
import { Disclosure } from "@/components/ui/disclosure";
import { Sheet } from "@/components/ui/sheet";
import { copy } from "@/content/copy";
import { colours } from "@/lib/catalog";
import { db } from "@/lib/client/db";
import { useJourneyGuard, useNavigate, useObjectUrl } from "@/lib/client/hooks";
import { saveSnapshot } from "@/lib/client/journey";
import { useJourney } from "@/lib/client/store";
import type { IdentitySnapshot } from "@/lib/contracts";

const o = copy.snapshot.options;
const t = copy.snapshot;
const NOTE_MAX = 140;

const entries = <K extends string>(labels: Record<K, string>): Choice<K>[] =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));

const familyDefault = (family: IdentitySnapshot["colourFamily"] | undefined) =>
  family ? colours.find((c) => c.family === family && c.use.includes("family-default"))?.hexes[0] : undefined;

const colourChoices: Choice<IdentitySnapshot["colourFamily"]>[] = entries(o.colourFamily).map((c) => ({
  ...c,
  swatch: familyDefault(c.value),
}));

/**
 * The answers so far. Nothing is pre-chosen for a real person: "never
 * inferred" means we don't guess about their hair, so every required group
 * starts empty. Sample people and retakes start from saved answers.
 */
type Draft = Partial<Omit<IdentitySnapshot, "brows">> & {
  browShape?: IdentitySnapshot["brows"]["shape"];
  browDarkness?: IdentitySnapshot["brows"]["darkness"];
};

const toDraft = (s: IdentitySnapshot | null): Draft => {
  if (!s) return {};
  const { brows, ...rest } = s;
  return { ...rest, browShape: brows.shape, browDarkness: brows.darkness };
};

/** The full snapshot, once every required group has an answer. */
function complete(d: Draft): IdentitySnapshot | null {
  if (!d.colourFamily || !d.length || !d.parting || d.fringe === undefined || !d.texture || !d.browShape || !d.browDarkness) {
    return null;
  }
  const { browShape, browDarkness, ...rest } = d;
  return { ...rest, colourFamily: d.colourFamily, length: d.length, parting: d.parting, fringe: d.fringe, texture: d.texture, brows: { shape: browShape, darkness: browDarkness } };
}

type Trait = keyof typeof t.trait;
const TRAITS = Object.keys(t.trait) as Trait[];

/** What a trait says on its tag, or undefined while it is unanswered. */
function tagText(trait: Trait, d: Draft): string | undefined {
  switch (trait) {
    case "colour":
      return d.colourFamily && o.colourFamily[d.colourFamily];
    case "length":
      return d.length && o.length[d.length];
    case "parting":
      return d.parting && t.tagParting[d.parting];
    case "fringe":
      return d.fringe === undefined ? undefined : d.fringe ? o.fringe.yes : o.fringe.no;
    case "texture":
      return d.texture && o.texture[d.texture];
    case "brows":
      return d.browShape && d.browDarkness ? t.tagBrows(o.browShape[d.browShape], o.browDarkness[d.browDarkness]) : undefined;
  }
}

/* One tag: tap it to change that one thing. The group name is read out, not shown. */
function TraitTag({ trait, d, swatch, onOpen }: { trait: Trait; d: Draft; swatch?: string; onOpen: () => void }) {
  const text = tagText(trait, d);
  const name = t.trait[trait];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        "flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-left text-sm font-semibold transition-colors duration-(--dur-quick) " +
        (text ? "bg-surface-raised text-text shadow-pill" : "border border-dashed border-action bg-transparent text-action")
      }
    >
      {swatch && <span aria-hidden="true" className="size-4 shrink-0 rounded-full border border-line" style={{ background: swatch }} />}
      {text ? (
        <>
          <span className="sr-only">{name}: </span>
          {text}
        </>
      ) : (
        t.choose(name)
      )}
      <PencilIcon aria-hidden="true" className="size-3.5 shrink-0 text-text-muted" />
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base">{title}</h3>
      {children}
    </section>
  );
}

/*
 * The Identity Snapshot: what makes the user's hair look like them, in their
 * own words, never inferred. One card reads back the six things we need as
 * tags; tapping a tag opens a sheet to change just that. "Tap your hair"
 * (the eyedropper) lives inside the colour sheet, and the colour is shown as a
 * swatch, never a code. Saving plans the three paths and goes on to /paths.
 */
export function SnapshotScreen() {
  const ready = useJourneyGuard("snapshot");
  const baselineId = useJourney((j) => j.baselineId);
  const baseline = useLiveQuery(async () => (baselineId ? db.baselines.get(baselineId) : undefined), [baselineId]);
  // null = nothing saved yet; undefined = still loading.
  const saved = useLiveQuery(async () => (baselineId ? ((await db.snapshots.get(baselineId)) ?? null) : null), [baselineId]);
  const imageUrl = useObjectUrl(baseline?.image);

  if (!ready || !baselineId || saved === undefined || !imageUrl) {
    return <Screen title={t.title} backHref="/start/consent" step={{ n: 3, total: 5 }}>{null}</Screen>;
  }
  return <SnapshotForm baselineId={baselineId} imageUrl={imageUrl} initial={saved?.snapshot ?? null} />;
}

function SnapshotForm({
  baselineId,
  imageUrl,
  initial,
}: {
  baselineId: string;
  imageUrl: string;
  initial: IdentitySnapshot | null;
}) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const audience = useJourney((j) => j.audience);
  const isSample = useJourney((j) => j.isSample);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [beardOn, setBeardOn] = useState(Boolean(draft.beard && draft.beard !== "none"));
  // The sheet keeps showing its trait while it slides away.
  const [trait, setTrait] = useState<Trait>("colour");
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  /** A one-choice sheet: let the highlight settle, then close. */
  const pick = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    set(key, value);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setSheetOpen(false), 260);
  };
  const note = draft.note ?? "";
  const snapshot = complete(draft);
  const answered = TRAITS.some((name) => tagText(name, draft));
  const heading = isSample ? t.noticeSample : answered ? t.noticeOwn : t.noticeEmpty;
  const colourSwatch = draft.colourFamily ? (draft.hairHex ?? familyDefault(draft.colourFamily)) : undefined;

  return (
    <Screen
      title={t.title}
      backHref={isSample ? "/start/consent?sample=1" : "/start/capture"}
      step={{ n: 3, total: 5 }}
      baselineSrc={imageUrl}
      stage={
        <PhotoStage
          src={imageUrl}
          alt={t.photoAlt}
          sample={isSample}
          aspect="aspect-4/5 md:aspect-3/4"
          className="mx-auto w-40 md:w-full md:max-w-md"
        />
      }
      bottom={
        <BottomBar>
          <Button
            size="lg"
            full
            loading={saving}
            disabled={!snapshot}
            onClick={async () => {
              if (!snapshot) return;
              setSaving(true);
              await saveSnapshot(baselineId, snapshot);
              navigate("/paths");
            }}
          >
            {initial ? t.ctaLooksRight : t.cta}
          </Button>
          {!snapshot && <p className="text-center text-xs text-text-muted">{t.ctaHint}</p>}
        </BottomBar>
      }
    >
      <section aria-labelledby="notice-title" className="flex flex-col gap-3">
        <h2 id="notice-title" className="font-display text-xl font-medium md:text-2xl">
          {heading}
        </h2>
        <p className="text-sm text-text-soft">{answered ? t.noticeHintFilled : t.noticeHintEmpty}</p>
        <ul className="flex flex-wrap gap-2">
          {TRAITS.map((name) => (
            <li key={name}>
              <TraitTag
                trait={name}
                d={draft}
                swatch={name === "colour" ? colourSwatch : undefined}
                onOpen={() => {
                  setTrait(name);
                  setSheetOpen(true);
                }}
              />
            </li>
          ))}
        </ul>
        {colourSwatch && (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <span aria-hidden="true" className="size-5 rounded-full border border-line" style={{ background: colourSwatch }} />
            {t.yourColour}
          </p>
        )}
      </section>

      <Disclosure title={t.moreTitle} className="bg-surface/70">
        <div className="flex flex-col gap-6">
          <p className="-mt-1 text-sm text-text-muted">{t.moreHint}</p>
          <Group title={t.audienceTitle}>
            <p className="-mt-1 text-sm text-text-muted">{t.audienceHint}</p>
            <ChoiceChips
              label={t.audienceTitle}
              options={entries(t.audience)}
              value={audience}
              onValueChange={(v) => useJourney.getState().set({ audience: v })}
            />
          </Group>

          {beardOn ? (
            <Group title={t.beard}>
              <ChoiceChips label={t.beard} options={entries(o.beard)} value={draft.beard ?? "none"} onValueChange={(v) => set("beard", v)} />
              <Button
                variant="quiet"
                className="self-start"
                onClick={() => {
                  setBeardOn(false);
                  set("beard", undefined);
                }}
              >
                {t.removeBeard}
              </Button>
            </Group>
          ) : (
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => {
                setBeardOn(true);
                set("beard", "short");
              }}
            >
              {t.addBeard}
            </Button>
          )}

          <section className="flex flex-col gap-2">
            <label htmlFor="snapshot-note" className="text-base font-bold">
              {t.noteLabel}
            </label>
            <textarea
              id="snapshot-note"
              rows={3}
              maxLength={NOTE_MAX}
              value={note}
              placeholder={t.notePlaceholder}
              onChange={(e) => set("note", e.target.value || undefined)}
              className="w-full resize-none rounded-card bg-bg px-5 py-4 text-base text-text placeholder:text-text-muted"
            />
            <p className="self-end text-xs text-text-muted">{t.noteCount(note.length, NOTE_MAX)}</p>
          </section>
        </div>
      </Disclosure>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title={t.trait[trait]}>
        <div className="flex flex-col gap-5">
          {trait === "colour" && (
            <>
              <ChoiceChips label={t.trait.colour} options={colourChoices} value={draft.colourFamily ?? null} onValueChange={(v) => set("colourFamily", v)} />
              <HairPicker
                src={imageUrl}
                alt={t.photoAlt}
                value={draft.hairHex}
                fallbackHex={familyDefault(draft.colourFamily) ?? "#3B2A20"}
                onChange={(hex) => set("hairHex", hex as IdentitySnapshot["hairHex"])}
              />
            </>
          )}
          {trait === "length" && <ChoiceChips label={t.trait.length} options={entries(o.length)} value={draft.length ?? null} onValueChange={(v) => pick("length", v)} />}
          {trait === "parting" && <ChoiceChips label={t.trait.parting} options={entries(o.parting)} value={draft.parting ?? null} onValueChange={(v) => pick("parting", v)} />}
          {trait === "fringe" && (
            <ChoiceChips
              label={t.trait.fringe}
              options={entries(o.fringe)}
              value={draft.fringe === undefined ? null : draft.fringe ? "yes" : "no"}
              onValueChange={(v) => pick("fringe", v === "yes")}
            />
          )}
          {trait === "texture" && <ChoiceChips label={t.trait.texture} options={entries(o.texture)} value={draft.texture ?? null} onValueChange={(v) => pick("texture", v)} />}
          {trait === "brows" && (
            <>
              <Group title={t.browShape}>
                <ChoiceChips label={t.browShape} options={entries(o.browShape)} value={draft.browShape ?? null} onValueChange={(v) => set("browShape", v)} />
              </Group>
              <Group title={t.browDarkness}>
                <ChoiceChips label={t.browDarkness} options={entries(o.browDarkness)} value={draft.browDarkness ?? null} onValueChange={(v) => set("browDarkness", v)} />
              </Group>
            </>
          )}
          {(trait === "colour" || trait === "brows") && (
            <Button size="lg" full onClick={() => setSheetOpen(false)}>
              {t.sheetDone}
            </Button>
          )}
        </div>
      </Sheet>
    </Screen>
  );
}
