"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as m from "motion/react-m";
import { AnimatedBackground } from "@/components/motion/animated-background";
import { AnimatedCircularProgressBar } from "@/components/motion/animated-circular-progress-bar";
import { BlurFade } from "@/components/motion/blur-fade";
import {
  ImageComparison,
  ImageComparisonImage,
  ImageComparisonSlider,
} from "@/components/motion/image-comparison";
import { InView } from "@/components/motion/in-view";
import {
  MorphingDialog,
  MorphingDialogClose,
  MorphingDialogContainer,
  MorphingDialogContent,
  MorphingDialogDescription,
  MorphingDialogImage,
  MorphingDialogSubtitle,
  MorphingDialogTitle,
  MorphingDialogTrigger,
} from "@/components/motion/morphing-dialog";
import {
  MotionProvider,
  useCalmMotion,
  type ReducedMotionSetting,
} from "@/components/motion/motion-provider";
import { ProgressiveBlur } from "@/components/motion/progressive-blur";
import { TextEffect } from "@/components/motion/text-effect";
import { TextShimmer } from "@/components/motion/text-shimmer";
import { TransitionPanel } from "@/components/motion/transition-panel";
import { develop } from "@/lib/client/motion";
import { ComponentGallery } from "./components-gallery";

const BEFORE = "/dev/amara-before.jpg";
const AFTER = "/dev/amara-coily-chin.jpg";

const COLOUR_TOKENS = [
  "bg",
  "surface",
  "surface-raised",
  "text",
  "text-soft",
  "text-muted",
  "action",
  "on-action",
  "selected",
  "line",
  "peach",
  "glow",
  "focus",
] as const;

const TYPE_SCALE = [
  ["text-3xl", "36 · display"],
  ["text-2xl", "30 · screen title"],
  ["text-xl", "24"],
  ["text-lg", "20 · section"],
  ["text-base", "17 · body"],
  ["text-sm", "15"],
  ["text-xs", "13 · caption (minimum)"],
] as const;

type Theme = "system" | "light" | "dark";

export function StatesGallery() {
  const [theme, setTheme] = useState<Theme>("system");
  const [motion, setMotion] = useState<ReducedMotionSetting>("user");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    if (motion === "user") delete root.dataset.motion;
    else root.dataset.motion = motion === "always" ? "reduce" : "full";
  }, [theme, motion]);

  return (
    <MotionProvider reducedMotion={motion}>
      <main className="mx-auto flex w-full max-w-280 flex-col gap-14 px-5 py-10 md:px-8">
        <header className="flex flex-col gap-4">
          <p className="text-xs font-bold tracking-[0.08em] text-text-muted uppercase">
            F0 · Morning Light
          </p>
          <h1 className="text-3xl tracking-tighter">Tokens and motion</h1>
          <div className="flex flex-wrap gap-6">
            <Segmented
              label="Theme"
              value={theme}
              options={["system", "light", "dark"]}
              onChange={(v) => setTheme(v as Theme)}
            />
            <Segmented
              label="Reduced motion"
              value={motion}
              options={["user", "always", "never"]}
              onChange={(v) => setMotion(v as ReducedMotionSetting)}
            />
          </div>
        </header>

        <Section title="Colour">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {COLOUR_TOKENS.map((token) => (
              <div key={token} className="flex items-center gap-3">
                <span
                  className="size-11 shrink-0 rounded-full border border-line"
                  style={{ background: `var(--${token})` }}
                />
                <code className="text-sm">--{token}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type · Figtree">
          <div className="flex flex-col gap-3">
            {TYPE_SCALE.map(([cls, note]) => (
              <div key={cls} className="flex items-baseline gap-4">
                <span className="w-44 shrink-0 text-xs text-text-muted">{note}</span>
                <span className={`${cls} font-bold tracking-tight`}>Does this still feel like you?</span>
              </div>
            ))}
            <p className="max-w-prose text-text-soft">
              Every option starts from your own photo, so you can always see where you began. (17 px
              body, text-soft)
            </p>
          </div>
        </Section>

        <Section title="Shape, elevation, buttons">
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex size-32 items-end rounded-card bg-surface p-3 text-xs">card 28</div>
            <div className="flex size-32 items-end rounded-image bg-peach p-3 text-xs">image 24</div>
            <div className="flex size-32 items-end rounded-t-sheet bg-surface-raised p-3 text-xs shadow-raised">
              sheet 32 + raised
            </div>
            <div className="flex w-72 flex-col gap-2.5">
              <button className="h-14 rounded-full bg-action font-semibold text-on-action transition-transform duration-(--dur-quick) active:scale-[0.98]">
                Primary
              </button>
              <button className="h-14 rounded-full bg-surface font-semibold transition-transform duration-(--dur-quick) active:scale-[0.98]">
                Secondary
              </button>
              <button className="h-12 font-semibold text-action">Quiet</button>
            </div>
            <span className="rounded-full bg-peach px-3 py-1.5 text-xs font-semibold text-text-soft">
              Style direction, not exact wig fit
            </span>
          </div>
        </Section>

        <Section title="1 · Sunrise + TextEffect + BlurFade stagger">
          <Replay>
            <div className="relative isolate flex flex-col gap-4 py-6">
              <div
                aria-hidden="true"
                className="bg-morning-glow animate-sunrise absolute -inset-6 -z-10"
              />
              <TextEffect as="h2" per="line" preset="fade-in-blur" className="text-2xl">
                {"Plan how you’ll look through treatment,\nbefore it starts."}
              </TextEffect>
              {["Use my photo", "Try with a sample person"].map((label, i) => (
                <BlurFade key={label} delay={0.3 + i * 0.06} className="w-72">
                  <div className="flex h-14 items-center justify-center rounded-full bg-surface font-semibold">
                    {label}
                  </div>
                </BlurFade>
              ))}
            </div>
          </Replay>
        </Section>

        <Section title="2 · Breathing guide (ambient) + 3 · countdown ring">
          <div className="flex flex-wrap items-center gap-10">
            <div className="animate-breathe h-48 w-36 rounded-[50%] border-2 border-dashed border-action" />
            <Countdown />
          </div>
        </Section>

        <Section title="4 · AnimatedBackground (sliding pill)">
          <PathsSegment />
        </Section>

        <Section title="5 · Developing photo (ProgressiveBlur + TextShimmer + develop)">
          <DevelopingPhoto />
        </Section>

        <Section title="6 · ImageComparison (hint glide, keyboard: Tab then ←/→)">
          <ImageComparison
            hint
            label="Compare with you, before"
            getValueText={(p) => `Showing ${100 - p}% new style`}
            className="aspect-3/4 w-full max-w-sm rounded-image"
          >
            <ImageComparisonImage src={AFTER} alt="Preview: chin-length coily cut, your colour" side="after" />
            <ImageComparisonImage src={BEFORE} alt="You, before" side="before" />
            <ImageComparisonSlider className="bg-on-photo shadow-pill">
              <span className="absolute top-1/2 left-1/2 size-11 -translate-1/2 rounded-full border-2 border-on-photo bg-surface-raised/40 shadow-raised backdrop-blur-sm" />
            </ImageComparisonSlider>
          </ImageComparison>
        </Section>

        <Section title="6 · MorphingDialog (card → compare)">
          <MorphingDialog>
            <MorphingDialogTrigger className="flex w-56 flex-col overflow-hidden rounded-card bg-surface">
              <MorphingDialogImage src={AFTER} alt="Closest to me preview" className="aspect-3/4 w-full object-cover" />
              <div className="flex flex-col p-4">
                <MorphingDialogTitle className="font-bold">Closest to me</MorphingDialogTitle>
                <MorphingDialogSubtitle className="text-sm text-text-muted">Chin-length coily</MorphingDialogSubtitle>
              </div>
            </MorphingDialogTrigger>
            <MorphingDialogContainer>
              <MorphingDialogContent className="relative flex w-[min(92vw,440px)] flex-col rounded-card bg-surface-raised shadow-raised">
                <MorphingDialogImage src={AFTER} alt="Closest to me preview" className="aspect-3/4 w-full object-cover" />
                <div className="flex flex-col gap-2 p-5">
                  <MorphingDialogTitle className="text-lg font-bold">Closest to me</MorphingDialogTitle>
                  <MorphingDialogSubtitle className="text-sm text-text-muted">Chin-length coily</MorphingDialogSubtitle>
                  <MorphingDialogDescription
                    variants={{
                      initial: { opacity: 0 },
                      animate: { opacity: 1 },
                      exit: { opacity: 0 },
                    }}
                    className="text-text-soft"
                  >
                    Your colour and texture kept, a new chin-length shape.
                  </MorphingDialogDescription>
                </div>
                <MorphingDialogClose aria-label="Close" />
              </MorphingDialogContent>
            </MorphingDialogContainer>
          </MorphingDialog>
        </Section>

        <Section title="TransitionPanel (one tip at a time)">
          <Tips />
        </Section>

        <Section title="8 · InView (scroll into view)">
          <ol className="flex flex-col gap-3">
            {["About 3–5 months · pixie", "About 6–8 months · crop", "About 12 months · chin length"].map(
              (stage) => (
                <InView key={stage} as="li" className="rounded-card bg-surface p-5">
                  {stage}
                </InView>
              ),
            )}
          </ol>
        </Section>

        <Section title="Skeleton">
          <div className="bg-skeleton animate-skeleton h-40 w-full max-w-sm rounded-image" />
        </Section>

        <header className="flex flex-col gap-1 border-t border-line pt-10">
          <p className="text-xs font-bold tracking-[0.08em] text-text-muted uppercase">F1</p>
          <h2 className="text-2xl tracking-tighter">Components in every state</h2>
        </header>
        <ComponentGallery />
      </main>
    </MotionProvider>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Replay({ children }: { children: ReactNode }) {
  const [key, setKey] = useState(0);
  return (
    <div className="flex flex-col items-start gap-3">
      <div key={key}>{children}</div>
      <button onClick={() => setKey((k) => k + 1)} className="h-11 rounded-full bg-surface px-5 text-sm font-semibold">
        Replay
      </button>
    </div>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-text-muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-surface p-1">
        <AnimatedBackground value={value} onValueChange={(v) => v && onChange(v)}>
          {options.map((option) => (
            <button
              key={option}
              data-id={option}
              role="radio"
              aria-checked={value === option}
              className="h-10 rounded-full px-4 text-sm font-semibold text-text-soft data-[checked=true]:text-text"
            >
              {option}
            </button>
          ))}
        </AnimatedBackground>
      </div>
    </div>
  );
}

function PathsSegment() {
  const [value, setValue] = useState("closest");
  const options = [
    ["closest", "Closest"],
    ["easier", "Easier"],
    ["new-chapter", "New chapter"],
  ];
  return (
    <div role="radiogroup" aria-label="Paths" className="flex w-full max-w-sm gap-1.5 rounded-full bg-surface p-1">
      <AnimatedBackground value={value} onValueChange={(v) => v && setValue(v)}>
        {options.map(([id, label]) => (
          <button
            key={id}
            data-id={id}
            role="radio"
            aria-checked={value === id}
            className="h-10 flex-1 rounded-full text-sm font-semibold text-text-soft data-[checked=true]:font-bold data-[checked=true]:text-text"
          >
            {label}
          </button>
        ))}
      </AnimatedBackground>
    </div>
  );
}

function Countdown() {
  const [n, setN] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v === 0 ? 3 : v - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <AnimatedCircularProgressBar value={3 - n} max={3} className="size-28 text-3xl">
      {n || "✓"}
    </AnimatedCircularProgressBar>
  );
}

function DevelopingPhoto() {
  const [ready, setReady] = useState(false);
  const calm = useCalmMotion();
  const preset = calm ? develop.calm : develop.full;
  return (
    <div className="flex flex-col items-start gap-3">
      <div className="relative aspect-3/4 w-full max-w-xs overflow-hidden rounded-image bg-peach">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BEFORE} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover blur-xl" />
        {!ready && <ProgressiveBlur className="absolute inset-0" blurIntensity={2} />}
        {ready && (
          <m.img
            src={AFTER}
            alt="Preview: chin-length coily cut, your colour"
            className="absolute inset-0 h-full w-full object-cover"
            variants={preset}
            initial="hidden"
            animate="visible"
          />
        )}
        {!ready && (
          <div className="absolute inset-x-3 bottom-3 rounded-full bg-surface-raised px-4 py-2 text-center">
            <TextShimmer className="text-sm font-semibold">Styling your hair · usually 15–25 s</TextShimmer>
          </div>
        )}
      </div>
      <button onClick={() => setReady((r) => !r)} className="h-11 rounded-full bg-surface px-5 text-sm font-semibold">
        {ready ? "Reset" : "Finish"}
      </button>
    </div>
  );
}

function Tips() {
  const tips = [
    "Move back a little so your shoulders show",
    "Look straight at the camera",
    "Face a window or a lamp",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % tips.length), 2200);
    return () => clearInterval(id);
  }, [tips.length]);
  return (
    <div aria-live="polite" className="w-full max-w-sm rounded-full bg-surface px-5 py-3 text-center">
      <TransitionPanel activeIndex={i}>
        {tips.map((tip) => (
          <p key={tip}>{tip}</p>
        ))}
      </TransitionPanel>
    </div>
  );
}
