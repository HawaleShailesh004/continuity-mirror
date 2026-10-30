// Section of content/copy.ts (split so a screen imports only its own words).
export const howMade = {
  open: "How this was made",
  title: "How this was made",
  intro: "The exact steps behind this image. Nothing is hidden.",
  mode: { live: "Made live with YouCam", replay: "Replayed from a recording", mock: "Practice result, not made by YouCam" },
  step: (n: number) => `Step ${n}`,
  endpoint: "Endpoint",
  version: "Version",
  params: "Settings sent",
  taskId: "Task ID",
  time: "Finished",
  units: (n: number) => (n === 1 ? "1 unit" : `${n} units`),
  none: "Not recorded",
} as const;
