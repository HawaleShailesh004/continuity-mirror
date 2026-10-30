// Section of content/copy.ts (split so a screen imports only its own words).
export const capture = {
  title: "Your photo",
  intro: "A clear photo of just you, with your shoulders showing, works best. It stays on your device until you choose to use it.",
  tabsLabel: "How to add your photo",
  tabCamera: "Camera",
  tabUpload: "Upload",

  camera: {
    alt: "Live view from your camera",
    starting: "Opening your camera",
    loadingGuide: "Getting the guide ready",
    ready: "That’s it. Hold still for a moment.",
    shutter: "Take photo",
    countdown: (n: number) => `Taking your photo in ${n}`,
    manualTitle: "We can’t check your photo live on this device",
    manualBody: "Use this checklist, then take the photo. You can retake it as often as you like.",
    manualSteps: [
      "Only you in the picture",
      "Face the camera, head level",
      "Head and both shoulders in the frame",
      "Face a window or a lamp",
    ],
  },

  /** One instruction at a time while the camera is live. */
  tips: {
    noFace: "Move into the frame so we can see your face",
    manyFaces: "Make sure only you are in the frame",
    lookStraight: "Look straight at the camera",
    levelHead: "Level your head",
    closer: "Come a little closer",
    back: "Move back a little",
    shoulders: "Show your shoulders",
    light: "Face a window or a lamp",
  },

  checksTitle: "What we look for",
  checks: {
    oneFace: "Just you in the frame",
    pose: "Facing the camera",
    size: "Close enough",
    spacing: "Room around your head",
    shoulders: "Shoulders showing",
    lighting: "Good, even light",
  },
  checkDone: "done",
  checkTodo: "to do",

  problem: {
    denied: {
      title: "Camera access is off",
      body: "You can allow the camera in your browser settings, or choose a photo instead.",
    },
    none: {
      title: "No camera found",
      body: "You can choose a photo from this device instead.",
    },
    unavailable: {
      title: "The camera isn’t available right now",
      body: "Another app may be using it. You can try again, or choose a photo instead.",
    },
    useUpload: "Choose a photo instead",
    tryAgain: "Try the camera again",
  },

  upload: {
    title: "Choose a photo",
    body: "Pick a clear photo of just you. JPG or PNG. Your shoulders should be in the picture.",
    cta: "Choose a photo",
    checking: "Checking your photo",
    heic: "That looks like a HEIC photo. Please choose a JPG or PNG instead.",
  },

  review: {
    title: "Use this photo?",
    alt: "The photo you chose",
    use: "Use this photo",
    uploading: "Getting your photo ready",
    retake: "Retake photo",
    chooseOther: "Choose a different photo",
    unchecked: "We couldn’t check this photo on your device. You can still use it.",
    fixFirst: "A few things to fix before we use this photo",
    lightNote: "The light could be better, but you can still use this photo.",
  },
} as const;
