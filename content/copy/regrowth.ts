// Section of content/copy.ts (split so a screen imports only its own words).
export const regrowth = {
  title: "Regrowth roadmap",
  intro:
    "Hair often comes back after treatment, and it can look or feel different at first. Here are three stages to explore, starting from your own photo.",
  possibility: "A possibility to explore, not a prediction",
  skip: "You don’t need this to make your plan. Skip it any time.",
  rough: "Everyone is different. These times are our rough guide; your care team can tell you more.",

  stages: {
    "regrowth-3m": { when: "About 3 months after treatment ends", short: "3 months" },
    "regrowth-6m": { when: "About 6 months", short: "6 months" },
    "regrowth-12m": { when: "About a year", short: "A year" },
  },
  timelineLabel: "Stages from the first months to about a year",
  scrubLabel: "Time since treatment ends",
  scrubStops: "Jump to a stage",
  scrubTitle: "How your hair might come back",

  startTitle: "See three stages",
  startBody: "We start from your photo and show short styles that might suit each stage, in your own colour. Nothing is made until you ask.",
  startCta: "Show me",
  makes: "Makes 3 previews.",
  notEnough: "There aren’t enough previews left for all three stages.",
  stageStyle: (name: string) => `Style: ${name}`,
  before: "You, before",
  alt: (when: string, style: string) => `Preview, ${when.toLowerCase()}: ${style}, your own colour`,

  addToPlan: "Add to my plan",
  inPlan: "In my plan",
  addedToast: "Added to your plan",

  wigTitle: "Choosing a wig with regrowth in mind",
  wigBody:
    "If you’re choosing a wig now, ask your fitter how it will sit over short hair as it returns, and whether the cap can be adjusted as your hair changes. Our guidance, not medical advice.",
  planLink: "Back to my plan",

  unavailableTitle: "The roadmap isn’t available right now",
  unavailableBody: "Everything else still works. You can try again later.",

  planCardTitle: "See how your hair might come back",
  planCardBody: "Three stages to explore, from your own photo. Optional.",
  planCardCta: "Open regrowth roadmap",
  planBadge: (short: string) => `Regrowth · ${short}`,
} as const;
