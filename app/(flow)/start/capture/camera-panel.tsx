"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { CameraOffIcon } from "lucide-react";
import { CaptureGuide } from "@/components/cm/capture-guide";
import { CheckList } from "@/components/cm/check-list";
import { useCalmMotion } from "@/components/motion/motion-provider";
import { AnimatedCircularProgressBar } from "@/components/motion/animated-circular-progress-bar";
import { Button } from "@/components/ui/button";
import { capture } from "@/content/copy/capture";
import { allPass } from "@/lib/client/capture/checks";
import { CaptureEngine, type EngineState } from "@/lib/client/capture/engine";
import { COUNTDOWN_FROM } from "@/lib/client/capture/countdown";
import { transition } from "@/lib/client/motion";
import { cn } from "@/lib/utils";

const startState: EngineState = { phase: "starting", models: "loading", results: [], tip: undefined, countdown: null };

/** What the tip bar says right now. One instruction at a time. */
function tipText(state: EngineState): string {
  if (state.phase === "starting") return capture.camera.starting;
  if (state.models === "loading") return capture.camera.loadingGuide;
  if (state.results.length === 0) return capture.camera.loadingGuide;
  if (allPass(state.results)) return capture.camera.ready;
  return state.tip ? capture.tips[state.tip] : capture.camera.loadingGuide;
}

/*
 * The live camera. The preview is mirrored on screen only (like a mirror); the
 * photo taken is never mirrored. What you see is the centred 3:4 region that
 * is checked and sent. Tips are spoken through a polite live region, so they
 * help low-vision users too.
 */
export function CameraPanel({
  onCaptured,
  onUseUpload,
}: {
  onCaptured: (photo: { blob: Blob; width: number; height: number }) => void;
  onUseUpload: () => void;
}) {
  const calm = useCalmMotion();
  const video = useRef<HTMLVideoElement>(null);
  const engine = useRef<CaptureEngine | null>(null);
  const [state, setState] = useState<EngineState>(startState);
  const [flash, setFlash] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const take = useCallback(async () => {
    const e = engine.current;
    if (!e) return;
    try {
      const photo = await e.capture();
      // The photo is taken: stop the live analysis so it can't compete with the still check.
      e.stop();
      setFlash(true);
      setTimeout(() => setFlash(false), 320);
      if (!calm && "vibrate" in navigator) navigator.vibrate(10);
      onCaptured(photo);
    } catch {
      /* the frame wasn't ready; the shutter stays available */
    }
  }, [calm, onCaptured]);

  // Keep the latest `take` reachable from the engine's countdown without restarting the camera.
  const takeRef = useRef(take);
  useEffect(() => {
    takeRef.current = take;
  }, [take]);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const instance = new CaptureEngine(el, setState, () => void takeRef.current());
    engine.current = instance;
    void instance.start();
    return () => {
      instance.stop();
      engine.current = null;
    };
  }, [attempt]);

  if (state.phase === "failed") {
    const problem = capture.problem[state.problem ?? "unavailable"];
    return (
      <div role="alert" className="flex flex-col items-center gap-5 rounded-card bg-surface p-6 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-peach" aria-hidden="true">
          <CameraOffIcon className="size-7" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl">{problem.title}</h2>
          <p className="text-text-soft">{problem.body}</p>
        </div>
        <div className="flex w-full flex-col gap-2.5">
          <Button size="lg" full onClick={onUseUpload}>
            {capture.problem.useUpload}
          </Button>
          {state.problem === "unavailable" && (
            <Button variant="secondary" size="lg" full onClick={() => setAttempt((n) => n + 1)}>
              {capture.problem.tryAgain}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const passed = allPass(state.results);
  const text = tipText(state);
  const manual = state.models === "failed";

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto aspect-3/4 w-full max-w-sm overflow-hidden rounded-card bg-surface">
        <video
          ref={video}
          aria-label={capture.camera.alt}
          className="absolute inset-0 size-full -scale-x-100 object-cover"
          playsInline
          muted
          autoPlay
        />
        {!manual && <CaptureGuide passed={passed} />}

        {state.countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center">
            <AnimatedCircularProgressBar
              value={((COUNTDOWN_FROM - state.countdown + 1) / COUNTDOWN_FROM) * 100}
              transitionLength="1s"
              className="size-28 rounded-full bg-bg/60 text-3xl backdrop-blur-sm"
              label={capture.camera.countdown(state.countdown)}
            >
              {state.countdown}
            </AnimatedCircularProgressBar>
          </div>
        )}

        <AnimatePresence>
          {flash && (
            <m.div
              aria-hidden="true"
              className="absolute inset-0 bg-on-photo"
              initial={{ opacity: calm ? 0 : 0.9 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          )}
        </AnimatePresence>

        {!manual && (
          <div className="absolute inset-x-3 bottom-3 flex justify-center">
            <div
              aria-live="polite"
              className={cn(
                "max-w-full rounded-full bg-surface-raised px-5 py-2.5 text-center text-sm font-semibold shadow-pill",
                passed && "text-text",
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                <m.p
                  key={text}
                  initial={calm ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={transition.quick}
                >
                  {text}
                </m.p>
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {manual ? (
        <section aria-labelledby="manual-title" className="flex flex-col gap-2 rounded-card bg-surface p-5">
          <h2 id="manual-title" className="text-base">
            {capture.camera.manualTitle}
          </h2>
          <p className="text-sm text-text-soft">{capture.camera.manualBody}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-text-soft">
            {capture.camera.manualSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>
      ) : (
        state.results.length > 0 && <CheckList results={state.results} className="mx-auto w-full max-w-sm" />
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => void take()}
          disabled={state.phase === "starting"}
          aria-label={capture.camera.shutter}
          className="size-18 rounded-full border-4 border-action bg-surface-raised shadow-raised transition-transform duration-(--dur-quick) active:scale-95 disabled:opacity-50"
        >
          <span aria-hidden="true" className="mx-auto block size-12 rounded-full bg-action" />
        </button>
      </div>
    </div>
  );
}
