// Section of content/copy.ts (split so a screen imports only its own words).
export const nav = {
  skip: "Skip to content",
  brand: "Continuity Mirror",
  home: "Continuity Mirror, home",
  back: "Back",
  privacy: "Privacy",
  mainLabel: "Main",
  step: (n: number, total: number) => `${n} of ${total}`,
  stepAnnounce: (n: number, total: number) => `Step ${n} of ${total}`,
  planPill: (count: number) => `My plan · ${count}`,
  planPillLabel: (count: number) =>
    count === 1 ? "Open my plan, 1 look saved" : `Open my plan, ${count} looks saved`,
  footerAbout: "How it works",
  footerPrivacy: "Privacy",} as const;
