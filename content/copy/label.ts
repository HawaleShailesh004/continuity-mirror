// Section of content/copy.ts (split so a screen imports only its own words).
/** Required on every generated image (guardrail checks the component). */
export const label = {
  styleDirection: "Style direction, not exact wig fit", // guardrail-ignore: the label itself states the limit
  sampleResult: "AI-generated sample person · results made earlier with YouCam",
  mockResult: "Practice result · not made by YouCam",
} as const;
