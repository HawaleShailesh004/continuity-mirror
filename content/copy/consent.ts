// Section of content/copy.ts (split so a screen imports only its own words).
export const consent = {
  title: "Before we start",
  intro: "Three things to know. Nothing is sent until you choose a photo.",
  photoTitle: "What happens to your photo",
  photoBody:
    "It’s sent to YouCam, a photo-editing service, to make your previews. A copy stays on this device. YouCam may keep it for up to 30 days, and we can’t delete it for you.",
  notTitle: "What this is not",
  notBody:
    "It isn’t medical advice. It can’t tell you whether or when your hair will thin. And a preview shows a style direction, not an exact wig fit.", // guardrail-ignore: states the limit, does not claim it
  controlTitle: "You’re in control",
  controlBody: "You can delete everything on this device, and the records we hold, from Privacy at any time.",
  helperPermission: "I have their permission to use their photo.",
  helperNote: "You’re helping someone. Only use a photo of them if they’ve said yes.",
  moodTitle: "How are you feeling about this right now?",
  moodHint: "Optional. It only changes how much we show you at once.",
  mood: {
    exploring: "Just exploring",
    anxious: "Quite anxious",
    ready: "Ready to decide",
  },
  cta: "I understand, continue",
  samplePersonaTitle: "Choose a sample person",
  samplePersonaHint: "AI-generated people, not real. Pick whose hair feels closest to yours.",
  samplePersonaLabel: "Sample person",
  starting: "Getting your photo ready",
} as const;
