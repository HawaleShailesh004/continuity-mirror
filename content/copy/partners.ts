// Section of content/copy.ts (split so a screen imports only its own words).
export const partners = {
  title: "For wig shops and cancer centres",
  intro: "People come to a fitting with ideas and worries. Continuity Mirror helps them arrive prepared, in their own words and with their own photo.",
  status: "This is where we’d like to take the idea. It isn’t a service you can sign up for today.",

  flowTitle: "How it fits a fitting",
  flowLabel: "From the client to the fitter to a shop's own catalogue",
  flowNow: "Works today",
  flowLater: "What we’d build with you",
  flow: [
    { title: "Client", text: "Explores on their own device and saves the looks they like.", now: true },
    { title: "Consultation pack", text: "One PDF with their photo, the looks and what to ask for.", now: true },
    { title: "Fitter", text: "Reads it before the visit, if the client chooses to share it.", now: false },
    { title: "Your catalogue", text: "Previews show the styles a shop really stocks.", now: false },
  ],

  whoTitle: "Who it could help",
  who: [
    { title: "Wig salons and fitters", body: "Clients arrive with the looks they like and the words to ask for, so the first conversation starts further along." },
    { title: "Cancer centre boutiques", body: "A calm, private place to explore before a first appointment, with no account to make." },
    { title: "Wig programmes", body: "Point people to the right options, with sources and the date each was checked." },
  ],

  todayTitle: "What works today",
  today: [
    "A consultation pack the client can print or send: their photo, the looks they saved and a note on what makes their hair look like them.",
    "A plain-language “what to ask for” for each style: length, parting, fringe, fibre and cap options.",
    "Money notes that say where each one comes from and when it was checked.",
  ],

  nextTitle: "What we’d build with you",
  next: [
    "Your own catalogue of styles, so previews show what you really stock.",
    "A small widget you can place on your own site.",
    "A way for a fitter to look at a pack before the visit, if the client chooses to share it.",
  ],

  formatTitle: "Catalogue format",
  formatBody: "Each style is one entry like this one. It’s the same format the app uses itself, so a shop’s catalogue and ours work the same way.",
  formatLabel: "An example style entry",
  formatNote: "The full format is checked by a schema in the project, so a bad entry is caught before it reaches anyone.",

  keepsTitle: "What stays the same",
  keeps: [
    "Photos stay on the person’s device unless they choose to share a private link.",
    "Every preview is labelled as a style direction, not a fitting.",
    "No medical claims, and no predictions about anyone’s hair.",
  ],

  contactTitle: "Talk to us",
  contactBody: "If you run a shop, a boutique or a programme and want to try this, we’d like to hear from you.",
  contactMissing: "Contact details will be added here before launch.",
  contactCta: "Email us",
  contactSubject: "Continuity Mirror for our shop",
} as const;
