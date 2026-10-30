// Section of content/copy.ts (split so a screen imports only its own words).
export const budget = {
  previewsLeft: (n: number) => (n === 1 ? "1 more preview available" : `${n} more previews available`),
  low: (n: number) =>
    n === 1 ? "Only 1 more preview in this session." : `Only ${n} more previews in this session.`,
  reached: "You’ve used this session’s previews. Your saved looks are still here.",
} as const;
