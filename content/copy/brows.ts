// Section of content/copy.ts (split so a screen imports only its own words).
export const brows = {
  title: "Brow record",
  intro:
    "For some people brows thin during treatment, and they can come back thinner at first. A close photo of yours now, with the shape that matches, gives you something to follow later.",
  practiseLine: "Practise now, while your brows are your guide.",

  finding: "Finding your brows",
  found: "Found your brows on your photo.",
  guess:
    "We couldn’t find your brows automatically, so this is where brows usually sit in a photo. If it looks off, retake your photo from the start.",
  retake: "Retake my photo",

  recordTitle: "Your brows, now",
  recordAlt: "Close-up of your own brows, cut from your photo",
  recordNote: "Cut from your photo on this device. This close-up is not sent anywhere.",
  savePhoto: "Save this photo",
  fileName: "brow-record.jpg",

  shapeTitle: "The closest shape",
  shapeHint: "Pick the shape that looks most like your own brows. It’s a starting point for you or a make-up artist.",
  familyLabel: "Brow shape",
  styleLabel: "Which one",
  chosenShape: "Your chosen shape",
  families: { straight: "Straight", "soft-arch": "Soft arch", "high-arch": "High arch", rounded: "Rounded" },
  thickness: { thin: "Fine", balanced: "Balanced", thick: "Full" },
  colourTitle: "Colour",
  colourLabel: "Brow colour",
  colourHint: "Pick the one closest to your brows.",
  darkness: { light: "Light", medium: "Medium", dark: "Dark" },
  noteLabel: "Anything to tell a make-up artist or fitter?",
  notePlaceholder: "For example: my left brow sits a little higher. Optional.",
  noteCount: (n: number, max: number) => `${n} of ${max}`,

  stepsTitle: "Practise now",
  steps: [
    "Look at your photo above, then try drawing your brows on a few times while your own are still there to follow.",
    "Short, light strokes in the direction your hair grows tend to look more like hair than one solid line.",
    "Try the same shape and colour in daylight and indoors, and see which you like.",
    "Keep this photo somewhere easy to find, or show it to a make-up artist.",
  ],
  stepsOurs: "Our suggestions.",
  citeLead: "The American Cancer Society suggests a close-up photo before treatment, as a guide. It also says drawing on brows can take practice.",
  citeLink: "American Cancer Society: make-up tips",

  previewTitle: "See it on your photo",
  previewBody:
    "A preview of this shape on your photo. On brows that are still there it’s subtle, so your brow record above matters more.",
  previewCta: "Make a preview",
  previewCtaSample: "Show the preview",
  previewCost: "Uses 1 preview.",
  previewMaking: "Making your preview",
  previewBefore: "Your brows now",
  previewAfter: "With this shape",
  previewLabel: "A preview made with AI. Real brows will look different.",
  previewFailed: "We couldn’t make the preview",
  previewAlt: (shape: string) => `Preview: your brows with the ${shape} shape`,
  previewMadeWith: (shape: string) => `This sample preview was made earlier with “${shape}”.`,
  previewAgain: "Make another",

  save: "Save brow recipe",
  savedToast: "Brow recipe saved to your plan",
  saved: "Saved in your plan",
  backToPlan: "Back to my plan",

  unavailableTitle: "Brows aren’t available right now",
  unavailableBody: "Everything else still works. You can try again later.",

  planTitle: "Brow recipe",
  planEmptyTitle: "Record your brows",
  planEmptyBody: "A close photo of your own brows and the shape that matches, to practise with.",
  planCta: "Open brow record",
  planEdit: "Change",
  planShape: "Shape",
  planThickness: "Thickness",
  planColour: "Colour",
  planNote: "Your note",

  pdf: {
    heading: "Brow recipe",
    intro: "A close-up of my own brows, and the shape and colour that match. For practising and for a make-up artist.",
    shape: "Closest shape",
    thickness: "Thickness",
    colour: "Colour",
    note: "My note",
    steps: "Practise now",
    ourGuidance: "Our suggestions. The American Cancer Society suggests a close-up photo before treatment, as a guide.",
  },
} as const;
