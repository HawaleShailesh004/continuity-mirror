// Section of content/copy.ts (split so a screen imports only its own words).
type Message = { title: string; body: string };

/** Shown when the backend sends a key we don’t know (older client, newer server). */
export const unknownMessage = {
  title: "Something went wrong",
  body: "Please try again in a moment.",
} satisfies Message;
