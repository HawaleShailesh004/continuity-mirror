// Section of content/copy.ts (split so a screen imports only its own words).
export const landing = {
  headline: "Plan how you’ll look through treatment,\nbefore it starts.",
  promise:
    "See options on your own face, keep what feels like you, and leave with a plan for your wig fitter.",
  usePhoto: "Use my photo",
  trySample: "Try with a sample person",
  helping: "I’m helping someone",
  continueWhereLeftOff: "Continue where you left off",
  sampleOnly: "Photo previews are paused for now. You can still explore with a sample person.",
  privacy: "Private by default. Delete everything anytime.",
  heroSliderLabel: "Compare you, before with the Closest to me preview",
  heroSliderValue: (percent: number) => `Showing ${percent}% of the new style`,
  heroAlt: "Sample person: a woman with shoulder-length coily hair",
} as const;
