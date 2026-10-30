/*
 * Every user-facing string lives here (frontend plan §9). Components import
 * from this file only; scripts/guardrail.ts scans it for banned claims and
 * tone words. Voice: a calm friend who has been through it. Plain words,
 * grade 6–8, "you" never "patient" (master plan §6).
 */
import { app } from "./copy/app";
import { nav } from "./copy/nav";
import { common } from "./copy/common";
import { label } from "./copy/label";
import { landing } from "./copy/landing";
import { home } from "./copy/home";
import { consent } from "./copy/consent";
import { capture } from "./copy/capture";
import { snapshot } from "./copy/snapshot";
import { paths } from "./copy/paths";
import { progress } from "./copy/progress";
import { compare } from "./copy/compare";
import { budget } from "./copy/budget";
import { howMade } from "./copy/howMade";
import { retake } from "./copy/retake";
import { states } from "./copy/states";
import { plan } from "./copy/plan";
import { privacy } from "./copy/privacy";
import { about } from "./copy/about";
import { exportPack } from "./copy/exportPack";
import { offline } from "./copy/offline";
import { messages } from "./copy/messages";
import { unknownMessage } from "./copy/unknownMessage";
import { alt } from "./copy/alt";
import { brows } from "./copy/brows";
import { regrowth } from "./copy/regrowth";
import { share } from "./copy/share";
import { partners } from "./copy/partners";

export const copy = {
  app,
  nav,
  common,
  label,
  landing,
  home,
  consent,
  capture,
  snapshot,
  paths,
  progress,
  compare,
  budget,
  howMade,
  retake,
  states,
  plan,
  privacy,
  about,
  exportPack,
  offline,
  messages,
  unknownMessage,
  alt,
  brows,
  regrowth,
  share,
  partners,
} as const;

export type Copy = typeof copy;
