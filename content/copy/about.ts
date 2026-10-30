// Section of content/copy.ts (split so a screen imports only its own words).
export const about = {
  title: "How it works",
  intro:
    "Continuity Mirror helps you decide how you’ll look through treatment, before it starts. You try options on your own photo, and leave with a plan for a wig fitter.",
  stepsTitle: "In three steps",
  steps: [
    { title: "Your photo", body: "Take or choose a clear photo while you still have your hair." },
    { title: "Your three paths", body: "See a familiar look, an easier one, and a change you choose." },
    { title: "Your plan", body: "Save what feels like you and take a one-page pack to your fitter." },
  ],
  apisTitle: "What powers the previews",
  apis: [
    {
      name: "YouCam Hair Style",
      why: "Tries a hairstyle on your photo. It works while your hair is long enough to style, which is why we ask for your photo now.",
    },
    { name: "YouCam Hair Color", why: "Keeps your own colour, or changes only the colour." },
    { name: "YouCam Makeup, eyebrows", why: "Helps you record and practise your brows." },
  ],
  limitsTitle: "What it can’t do",
  limits: [
    "It isn’t medical advice, and it can’t tell you whether or when hair will thin.",
    "A preview shows a style direction, not an exact wig fit.", // guardrail-ignore: states the limit, does not claim it
    "Colour and texture can differ slightly from your photo. Tightly coiled styles are the hardest for the tool to match.",
    "It doesn’t score or rate how anyone looks.",
  ],
  sourcesTitle: "Where our guidance comes from",
  sourcesIntro: "Every outside fact links to its source, with the date we checked it.",
  versionTitle: "Version",
  versionLabel: (v: string) => `Build ${v}`,
} as const;
