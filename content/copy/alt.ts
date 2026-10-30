// Section of content/copy.ts (split so a screen imports only its own words).
/** Alt text for generated results, built from catalog labels. */
export const alt = {
  preview: (style: string, colour?: string) => (colour ? `Preview: ${style}, ${colour}` : `Preview: ${style}`),
} as const;
