/*
 * Every outside fact the product leans on (master plan §1.3), with the date we
 * checked it. /about renders this list; add a row before adding a claim.
 */
export type Source = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** What we use it for, in plain words. */
  usedFor: string;
  asOf: string;
};

export const sources: readonly Source[] = [
  {
    id: "acs-coping",
    title: "Coping with hair loss",
    publisher: "American Cancer Society",
    url: "https://www.cancer.org/cancer/side-effects/hair-skin-nails/hair-loss/coping-with-hair-loss.html",
    usedFor:
      "Hair loss is a common and hard part of treatment, and caring about it is normal. Hair often comes back after treatment and can look or feel different at first.",
    asOf: "2026-10-26",
  },
  {
    id: "acs-wigs",
    title: "Choosing and wearing a wig",
    publisher: "American Cancer Society",
    url: "https://www.cancer.org/cancer/side-effects/hair-skin-nails/hair-loss/choosing-and-wearing-wig.html",
    usedFor: "Choose a wig before treatment, and bring a photo of your own hair.",
    asOf: "2026-10-26",
  },
  {
    id: "acs-makeup",
    title: "Make-up tips",
    publisher: "American Cancer Society",
    url: "https://www.cancer.org/cancer/survivorship/coping/appearance/make-up-tips.html",
    usedFor: "Take a close-up photo of your face before treatment as a guide for drawing on brows later. It can take practice.",
    asOf: "2026-10-29",
  },
  {
    id: "bcn-brows",
    title: "Will I lose my eyelashes, eyebrows or body hair during chemotherapy?",
    publisher: "Breast Cancer Now",
    url: "https://breastcancernow.org/about-breast-cancer/treatment/chemotherapy/chemotherapy-side-effects/will-i-lose-my-eyelashes-eyebrows-or-body-hair-during-chemotherapy",
    usedFor:
      "Some people keep their brows, for others they thin or are lost. They usually start to come back after treatment, and may be thinner or patchier at first.",
    asOf: "2026-10-29",
  },
  {
    id: "breastcancer-insurance",
    title: "Insurance coverage for wigs",
    publisher: "Breastcancer.org",
    url: "https://www.breastcancer.org/treatment-side-effects/hair-loss/wigs/insurance",
    usedFor: "The words “cranial prosthesis”, a prescription, and keeping receipts.",
    asOf: "2026-10-26",
  },
  {
    id: "dua-2017",
    title: "Hair loss and cancer treatment: a review",
    publisher: "Psycho-Oncology (Dua et al., 2017)",
    url: "https://onlinelibrary.wiley.com/doi/10.1002/pon.4039",
    usedFor: "Hair loss is among the most distressing side effects of chemotherapy.",
    asOf: "2026-10-26",
  },
  {
    id: "ecu-review",
    title: "Systematic review of information and support about hair loss",
    publisher: "Edith Cowan University",
    url: "https://ro.ecu.edu.au/ecuworkspost2013/11851",
    usedFor: "Many people lack information and resources to prepare for hair loss.",
    asOf: "2026-10-26",
  },
];
