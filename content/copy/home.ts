// Section of content/copy.ts (split so a screen imports only its own words).
// The long-form landing below the hero. Server components only: keep it out of
// anything "use client" (landing.ts is the part the client buttons import).
// Every claim here is in docs/FACTS.md or names its source.
export const home = {
  brand: "Continuity Mirror",
  headerNav: "Site",
  headerHow: "How it works",
  headerPrivacy: "Privacy",
  headerTry: "Try a sample",

  eyebrow: "For anyone facing hair loss from cancer treatment",
  trust: ["No account or email", "Nothing rates how you look", "About 10 minutes", "Delete everything anytime"],
  heroCardLabel: "Closest to me",
  heroBeforeAlt: "Amara, a sample person, with shoulder-length coily hair",
  heroAfterAlt: "Amara’s Closest to me preview: a coily style in her own colour",

  window: {
    kicker: "Why now",
    title: "The best time to plan is before your first treatment",
    body: "Wig fitters often suggest choosing a wig before treatment starts, and bringing a photo of your own hair. The preview tool also needs hair to style. So we start with a clear photo of you, today.",
    stages: [
      { when: "Now", text: "You still have your hair. Take a clear photo and try a few directions, at your own pace." },
      { when: "First treatment", text: "Not every treatment causes hair loss. Your care team can tell you what to expect." },
      { when: "During treatment", text: "If your hair thins, you already know what you want. Wig days, hat days, bare days: all valid." },
      { when: "After treatment", text: "Hair often comes back slowly, and can feel different at first. Your photo keeps “you, before”." },
    ],
    sourceLead: "Source:",
  },

  paths: {
    kicker: "How it works",
    title: "One photo of you. Three paths to compare.",
    body: "Every preview starts from your own photo and sits right next to it. You decide what still feels like you. Nothing is scored.",
    person: "Meera, 41",
    before: "You, before",
    routes: [
      { name: "Closest to me", text: "Recognisably you: a style close to your own, in your own colour." },
      { name: "Familiar, easier", text: "The same you, with less upkeep." },
      { name: "New chapter", text: "One change you choose. Here, a lighter colour." },
    ],
    steps: [
      { title: "Your photo", body: "A guided camera checks the light and angle before anything is sent." },
      { title: "Your three paths", body: "Compare each look with you, before, and say if it feels like you." },
      { title: "Your plan", body: "Save what you like and take a one-page pack to your fitter." },
    ],
    alt: {
      before: "Meera, a sample person, with shoulder-length dark brown hair",
      closest: "Meera’s Closest to me preview: a shoulder-length style in her own colour",
      easier: "Meera’s Familiar, easier preview: a shorter bob in her own colour",
      newChapter: "Meera’s New chapter preview: shoulder length, in a lighter brown",
    },
  },

  people: {
    kicker: "Who it’s for",
    title: "Made for where you are right now",
    body: "Everyone arrives with a different question. These are AI-generated sample people with real previews made by YouCam.",
    cards: [
      {
        id: "meera",
        title: "You want to still look like you",
        text: "At work, at school pickup, in photos. Start with the look closest to your own hair.",
        after: "closest",
        beforeAlt: "Meera, before",
        afterAlt: "Meera’s Closest to me preview",
      },
      {
        id: "amara",
        title: "Your hair is coily",
        text: "Coily hair is only shown coily styles, so the texture stays yours.",
        after: "closest",
        beforeAlt: "Amara, before",
        afterAlt: "Amara’s Closest to me preview, still coily",
      },
      {
        id: "daniel",
        title: "Wigs don’t feel like you",
        text: "Lots of people keep it short, wear a hat or go bare. See short styles on your own face, with no wig pressure.",
        after: "closest",
        beforeAlt: "Daniel, before",
        afterAlt: "Daniel’s Closest to me preview: a short curly crop",
      },
      {
        id: "grace",
        title: "You’ve wanted a change for a while",
        text: "A New chapter changes one thing you pick, and keeps the rest of you.",
        after: "new-chapter",
        beforeAlt: "Grace, before",
        afterAlt: "Grace’s New chapter preview: the same bob, in brown",
      },
    ],
    helperTitle: "You’re helping someone you love",
    helperText:
      "Look through a sample person together first. If you use their photo, you’ll be asked to confirm they said yes.",
    helperCta: "Look at a sample together",
  },

  pack: {
    kicker: "What you leave with",
    title: "A plan you can take to a wig fitter",
    body: "Your saved looks become a one-page PDF, made on your device. Print it, share it, or show it on your phone.",
    paperTitle: "Consultation pack",
    paperSub: "For my wig fitter",
    paperBefore: "Me, before",
    paperLooks: "Looks I like",
    paperAsk: "What to ask for",
    paperAskText: "Shoulder length · side part · no fringe · dark brown",
    moneyTitle: "Money help, with sources",
    moneyText:
      "The words insurers often use, like “cranial prosthesis”, and free or low-cost wig programmes in the US, Canada, India and the UK. Each one links to where it came from.",
    checklistTitle: "Before your first treatment",
    checklistText: "A short checklist: book a fitter, keep a photo of your hair and brows, and questions for your care team.",
  },

  privacy: {
    kicker: "Private by design",
    title: "Your photo, your choice",
    items: [
      { title: "Kept on your device", text: "Your photo and previews are saved on this device. Our server never keeps your photo." },
      { title: "Honest about YouCam", text: "Your photo goes to YouCam to make previews. They may keep it for up to 30 days, and we can’t delete it for you." },
      { title: "No account, no scores", text: "No sign-up and no email. Nothing rates your face or your looks." },
      { title: "Delete everything", text: "One button clears this device and the records we hold." },
    ],
    more: "Read the privacy details",
  },

  fitters: {
    kicker: "For wig fitters and boutiques",
    title: "Clients who arrive knowing what they like",
    text: "A Continuity Mirror pack shows a photo of their own hair, the looks they chose, and what to ask for. The first appointment starts from them, not from a guess.",
    cta: "For partners",
  },

  faq: {
    title: "Questions people ask",
    items: [
      {
        q: "Is this medical advice?",
        a: "No. It can’t tell you whether or when your hair will thin. Your care team is the right place for that, and for asking about scalp cooling.",
      },
      {
        q: "Will a wig look the same as the preview?",
        a: "A preview shows a style direction, not a specific wig. Take your pack to a fitter, who can match it with real wigs.",
      },
      {
        q: "Will it show me without hair?",
        a: "No. It never shows a bald version of you. You choose every look you see.",
      },
      {
        q: "My hair is already very short. Can I still use it?",
        a: "The preview tool needs some hair to style, so it works best before treatment. You can still explore a sample person and use the money help and checklist.",
      },
      {
        q: "Is it only for women?",
        a: "No. It’s for anyone facing hair loss. Short styles are included, and nobody is pushed towards a wig.",
      },
      {
        q: "Do I need an account? Does it cost anything?",
        a: "No account, no email, no cost. Your progress saves on this device, so you can stop and come back.",
      },
    ],
  },

  final: {
    title: "Whenever you’re ready",
    text: "See how it works with a sample person first. No photo needed, and it takes about a minute.",
    cta: "Explore with a sample person",
    secondary: "How it works, in detail",
  },

  footer: {
    note: "Not medical advice. Previews made with YouCam by Perfect Corp.",
    navLabel: "More",
    about: "About and sources",
    privacy: "Privacy",
  },
} as const;
