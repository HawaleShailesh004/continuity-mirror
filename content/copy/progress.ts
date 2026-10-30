// Section of content/copy.ts (split so a screen imports only its own words).
export const progress = {
  queued: "Getting ready",
  uploading: "Sending your photo",
  "hair-transfer": "Styling your hair · usually 15 to 40 seconds",
  "hair-color": "Matching your colour",
  "hair-bang": "Trying a fringe",
  "makeup-vto": "Shaping your brows",
  done: "Ready",
  slow: "Taking a little longer than usual.",
  slowAction: "Keep waiting",
  slowLater: "Come back later",
  stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
  announceStart: "Making your preview",
  announceDone: "Your preview is ready",
} as const;
