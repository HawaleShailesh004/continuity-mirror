// Section of content/copy.ts (split so a screen imports only its own words).
export const paths = {
  title: "Your three paths",
  intro: "Each one starts from your photo, so you can always see where you began.",
  routes: {
    closest: { name: "Closest to me", blurb: "Still recognisably you." },
    easier: { name: "Familiar, easier", blurb: "Your look with less upkeep." },
    "new-chapter": { name: "New chapter", blurb: "One change, chosen by you." },
    custom: { name: "Your choice", blurb: "A style you picked." },
    "regrowth-3m": { name: "Early regrowth", blurb: "A possibility to explore." },
    "regrowth-6m": { name: "Mid regrowth", blurb: "A possibility to explore." },
    "regrowth-12m": { name: "Longer regrowth", blurb: "A possibility to explore." },
  },
  open: "Open",
  making: "Making your previews",
  readyCount: (n: number, total: number) => `${n} of ${total} previews ready`,
  cardAlt: (route: string, style: string) => `Preview of ${route}: ${style}, made from your photo`,
  queued: "Waiting for a turn",
  retryOne: "Try this path again",
  partial: "One path didn’t finish. The others are ready to look at.",
  verdictYes: "Feels like me",
  verdictUnsure: "Not sure yet",
  verdictNo: "Doesn’t feel like me",
} as const;
