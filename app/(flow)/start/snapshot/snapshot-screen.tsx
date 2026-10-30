"use client";

import { useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BottomBar } from "@/components/cm/bottom-bar";
import { HairPicker } from "@/components/cm/hair-picker";
import { Screen } from "@/components/cm/screen";
import { Button } from "@/components/ui/button";
import { ChoiceChips, type Choice } from "@/components/ui/choice-chips";
import { copy } from "@/content/copy";
import { colours } from "@/lib/catalog";
import { db } from "@/lib/client/db";
import { useJourneyGuard, useNavigate, useObjectUrl } from "@/lib/client/hooks";
import { saveSnapshot } from "@/lib/client/journey";
import { useJourney } from "@/lib/client/store";
import type { IdentitySnapshot } from "@/lib/contracts";

const o = copy.snapshot.options;
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base">{title}</h2>
      {children}
    </section>
  );
}

/*
 * The Identity Snapshot: what makes the user's hair look like them, in their
 * own words, never inferred. The photo stays visible so people describe what
 * they see. "Tap your hair" reads the exact hair colour from the photo; the
 * colour-family chip is the fallback. Reads the baseline and any saved answers
 * from IndexedDB; saving plans the three paths and goes on to /paths.
 */
export function SnapshotScreen() {
  const ready = useJourneyGuard("snapshot");
  const baselineId = useJourney((j) => j.baselineId);
  const baseline = useLiveQuery(async () => (baselineId ? db.baselines.get(baselineId) : undefined), [baselineId]);
  // null = nothing saved yet; undefined = still loading.
  const saved = useLiveQuery(async () => (baselineId ? ((await db.snapshots.get(baselineId)) ?? null) : null), [baselineId]);
  const imageUrl = useObjectUrl(baseline?.image);

  if (!ready || !baselineId || saved === undefined || !imageUrl) {
    return <Screen title={copy.snapshot.title} backHref="/start/consent" step={{ n: 3, total: 5 }}>{null}</Screen>;
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
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const note = draft.note ?? "";
  const snapshot = complete(draft);

  return (
    <Screen
      title={copy.snapshot.title}
      backHref={isSample ? "/start/consent?sample=1" : "/start/capture"}
      step={{ n: 3, total: 5 }}
      baselineSrc={imageUrl}
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
            {copy.snapshot.cta}
          </Button>
          {!snapshot && <p className="text-center text-xs text-text-muted">{copy.snapshot.ctaHint}</p>}
        </BottomBar>
      }
    >
      <p className="text-text-soft">{copy.snapshot.intro}</p>

      <HairPicker
        src={imageUrl}
        alt={copy.snapshot.photoAlt}
        value={draft.hairHex}
        fallbackHex={familyDefault(draft.colourFamily) ?? "#3B2A20"}
        onChange={(hex) => set("hairHex", hex as IdentitySnapshot["hairHex"])}
      />

      <div className="flex flex-col gap-7">
        <Group title={copy.snapshot.colourFamily}>
          <ChoiceChips label={copy.snapshot.colourFamily} options={colourChoices} value={draft.colourFamily ?? null} onValueChange={(v) => set("colourFamily", v)} />
        </Group>
        <Group title={copy.snapshot.length}>
          <ChoiceChips label={copy.snapshot.length} options={entries(o.length)} value={draft.length ?? null} onValueChange={(v) => set("length", v)} />
        </Group>
        <Group title={copy.snapshot.parting}>
          <ChoiceChips label={copy.snapshot.parting} options={entries(o.parting)} value={draft.parting ?? null} onValueChange={(v) => set("parting", v)} />
        </Group>
        <Group title={copy.snapshot.fringe}>
          <ChoiceChips
            label={copy.snapshot.fringe}
            options={entries(o.fringe)}
            value={draft.fringe === undefined ? null : draft.fringe ? "yes" : "no"}
            onValueChange={(v) => set("fringe", v === "yes")}
          />
        </Group>
        <Group title={copy.snapshot.texture}>
          <ChoiceChips label={copy.snapshot.texture} options={entries(o.texture)} value={draft.texture ?? null} onValueChange={(v) => set("texture", v)} />
        </Group>
        <Group title={copy.snapshot.browShape}>
          <ChoiceChips label={copy.snapshot.browShape} options={entries(o.browShape)} value={draft.browShape ?? null} onValueChange={(v) => set("browShape", v)} />
        </Group>
        <Group title={copy.snapshot.browDarkness}>
          <ChoiceChips label={copy.snapshot.browDarkness} options={entries(o.browDarkness)} value={draft.browDarkness ?? null} onValueChange={(v) => set("browDarkness", v)} />
        </Group>

        <Group title={copy.snapshot.audienceTitle}>
          <p className="-mt-1 text-sm text-text-muted">{copy.snapshot.audienceHint}</p>
          <ChoiceChips
            label={copy.snapshot.audienceTitle}
            options={entries(copy.snapshot.audience)}
            value={audience}
            onValueChange={(v) => useJourney.getState().set({ audience: v })}
          />
        </Group>

        {beardOn ? (
          <Group title={copy.snapshot.beard}>
            <ChoiceChips
              label={copy.snapshot.beard}
              options={entries(o.beard)}
              value={draft.beard ?? "none"}
              onValueChange={(v) => set("beard", v)}
            />
            <Button
              variant="quiet"
              className="self-start"
              onClick={() => {
                setBeardOn(false);
                set("beard", undefined);
              }}
            >
              {copy.snapshot.removeBeard}
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
            {copy.snapshot.addBeard}
          </Button>
        )}

        <section className="flex flex-col gap-2">
          <label htmlFor="snapshot-note" className="text-base font-bold">
            {copy.snapshot.noteLabel}
          </label>
          <textarea
            id="snapshot-note"
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            placeholder={copy.snapshot.notePlaceholder}
            onChange={(e) => set("note", e.target.value || undefined)}
            className="w-full resize-none rounded-card bg-surface px-5 py-4 text-base text-text placeholder:text-text-muted"
          />
          <p className="self-end text-xs text-text-muted">{copy.snapshot.noteCount(note.length, NOTE_MAX)}</p>
        </section>
      </div>
    </Screen>
  );
}
