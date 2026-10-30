// Section of content/copy.ts (split so a screen imports only its own words).
export const privacy = {
  title: "Privacy",
  intro: "A plain list of what exists, where it lives, and how to remove it.",
  deviceTitle: "On this device",
  deviceBody: "Your photo, previews, answers and plan are stored in this browser only.",
  deviceCounts: (photos: number, previews: number) =>
    `${photos === 1 ? "1 photo" : `${photos} photos`} · ${previews === 1 ? "1 preview" : `${previews} previews`}`,
  youcamTitle: "Sent to YouCam",
  youcamBody:
    "To make previews, your photo goes to YouCam. These are the IDs and times. YouCam may keep files and tasks for up to 30 days, and we can’t delete them for you.",
  youcamPhoto: "Photo ID",
  youcamTasks: "Task IDs",
  sentAt: "Sent",
  expires: "Expires",
  serverTitle: "On our server",
  serverSharedImages: (links: number, until: string) =>
    `${links === 1 ? "1 share link keeps" : `${links} share links keep`} a copy of the pictures you chose to share on our server until ${until}. You can end a link at any time.`,
  serverUnreachable: "We couldn’t reach our server just now, so we can’t show what it holds. Everything on this device is listed above.",
  serverNone: "We don’t store your photos. We keep short-lived records of which previews were made.",
  serverRecordsLabel: "Short-lived records",
  serverRecords: (n: number) => (n === 1 ? "1 record" : `${n} records`),
  serverShares: "Private links",
  serverSharesNone: "None",
  deleteTitle: "Delete everything",
  deleteBody: "Removes your photos, previews, answers and plan from this device, and our records.",
  deleteCta: "Delete everything",
  deleteConfirmTitle: "Delete everything?",
  deleteConfirmBody:
    "This removes your photos, previews, answers and plan from this device, and the records we hold. It can’t be undone. YouCam’s own copy may stay for up to 30 days.",
  deleteConfirm: "Yes, delete everything",
  deleteDoneTitle: "Everything is deleted",
  deleteDoneBody: "Nothing is left on this device. YouCam may keep its copy for up to 30 days.",
  deleteDoneCta: "Back to start",
  emptyTitle: "Nothing stored",
  emptyBody: "You haven’t added a photo yet.",
} as const;
