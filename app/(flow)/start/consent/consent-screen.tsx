"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CameraIcon, InfoIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { BottomBar } from "@/components/cm/bottom-bar";
import { Screen } from "@/components/cm/screen";
import { ErrorState } from "@/components/cm/states";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { CheckboxRow } from "@/components/ui/checkbox";
import { copy } from "@/content/copy";
import { toApiError } from "@/lib/client/api";
import { useNavigate } from "@/lib/client/hooks";
import { startSample } from "@/lib/client/journey";
import { useJourney, type Mood } from "@/lib/client/store";
import { PERSONAS } from "@/lib/contracts/mocks/fixtures";
import type { ErrorBody } from "@/lib/contracts";

function Block({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-4 rounded-card bg-surface p-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-peach" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-base">{title}</h2>
        <p className="text-text-soft">{children}</p>
      </div>
    </section>
  );
}

/*
 * What happens to the photo, what this is not, and that the user is in
 * control, in three short blocks. Helper mode adds a required permission
 * checkbox. The optional mood question only changes pace and tone later and
 * stays on this device. "Sample person" picks one of four AI-generated people
 * and uploads their photo as the baseline; "Use my photo" goes on to capture.
 */
export function ConsentScreen() {
  const params = useSearchParams();
  const sample = params.get("sample") === "1";
  const helper = params.get("helper") === "1";
  const navigate = useNavigate();
  const [permitted, setPermitted] = useState(false);
  const [mood, setMood] = useState<Mood | null>(null);
  const [personaId, setPersonaId] = useState<string>("amara");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<ErrorBody | null>(null);

  const blocked = helper && !permitted;
  const t = copy.consent;

  const begin = async () => {
    setError(null);
    setStarting(true);
    try {
      useJourney.getState().set({ mood, helperMode: helper });
      await startSample(personaId);
      navigate("/start/snapshot");
    } catch (e) {
      setError(toApiError(e).body);
      setStarting(false);
    }
  };

  return (
    <Screen
      title={t.title}
      backHref="/"
      step={{ n: 1, total: 5 }}
      bottom={
        <BottomBar>
          {sample ? (
            <Button size="lg" full loading={starting} disabled={blocked} onClick={begin}>
              {starting ? t.starting : t.cta}
            </Button>
          ) : (
            <ButtonLink
              href="/start/capture"
              size="lg"
              full
              aria-disabled={blocked || undefined}
              onClick={(e) => {
                if (blocked) e.preventDefault();
                else useJourney.getState().set({ mood, helperMode: helper, isSample: false, personaId: undefined });
              }}
            >
              {t.cta}
            </ButtonLink>
          )}
        </BottomBar>
      }
    >
      <p className="text-text-soft">{t.intro}</p>

      <div className="flex flex-col gap-3">
        <Block icon={CameraIcon} title={t.photoTitle}>
          {t.photoBody}
        </Block>
        <Block icon={InfoIcon} title={t.notTitle}>
          {t.notBody}
        </Block>
        <Block icon={Trash2Icon} title={t.controlTitle}>
          {t.controlBody}
        </Block>
      </div>

      {sample && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base">{t.samplePersonaTitle}</h2>
          <p className="-mt-2 text-sm text-text-muted">{t.samplePersonaHint}</p>
          <ChoiceChips
            label={t.samplePersonaLabel}
            value={personaId}
            onValueChange={setPersonaId}
            options={PERSONAS.map((p) => ({ value: p.id, label: p.name }))}
          />
        </section>
      )}

      {helper && (
        <section className="flex flex-col gap-2 rounded-card bg-peach p-5">
          <p className="text-sm text-text-soft">{t.helperNote}</p>
          <CheckboxRow id="helper-permission" checked={permitted} onCheckedChange={setPermitted}>
            {t.helperPermission}
          </CheckboxRow>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base">{t.moodTitle}</h2>
        <p className="-mt-2 text-sm text-text-muted">{t.moodHint}</p>
        <ChoiceChips
          label={t.moodTitle}
          value={mood}
          onValueChange={setMood}
          options={[
            { value: "exploring", label: t.mood.exploring },
            { value: "anxious", label: t.mood.anxious },
            { value: "ready", label: t.mood.ready },
          ]}
        />
      </section>

      {error && <ErrorState messageKey={error.messageKey} onRetry={error.retryable ? begin : undefined} />}
    </Screen>
  );
}
