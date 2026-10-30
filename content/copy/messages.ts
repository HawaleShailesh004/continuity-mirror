// Section of content/copy.ts (split so a screen imports only its own words).
import type { MessageKey } from "@/lib/contracts";

type Message = { title: string; body: string };

/** Backend messageKeys → words. TypeScript fails the build if a key is missing. */
export const messages = {
  "generic.invalidRequest": {
    title: "Something was off",
    body: "That request didn’t look right. Please try again.",
  },
  "generic.somethingWrong": {
    title: "Something went wrong",
    body: "That’s on our side, not yours. Please try again in a moment.",
  },
  "generic.serviceBusy": {
    title: "The service is busy",
    body: "YouCam is taking longer than usual. Try again in a minute.",
  },
  "generic.busyRetry": {
    title: "A lot of people right now",
    body: "Please wait a few seconds and try again.",
  },
  "generic.timeout": {
    title: "This is taking too long",
    body: "You can try again, or come back later. We’ll keep what you’ve saved.",
  },
  "generic.notFound": {
    title: "We couldn’t find that",
    body: "It may have been removed. You can start again from your paths.",
  },
  "generic.tryDifferentPhoto": {
    title: "Let’s try a different photo",
    body: "The photo couldn’t be used. A clear photo of just you works best.",
  },
  "image.format": {
    title: "Please choose a JPG or PNG",
    body: "That file type can’t be used. Most phone photos work if you save them as JPG.",
  },
  "image.tooSmall": {
    title: "That photo is a little small",
    body: "Choose a larger photo, or take a new one a bit closer.",
  },
  "image.tooLarge": {
    title: "That photo is too large",
    body: "Choose a smaller photo, or take a new one with your camera.",
  },
  "budget.sessionReached": {
    title: "You’ve used this session’s previews",
    body: "Your saved looks are still here. You can keep exploring with a sample person.",
  },
  "live.disabled": {
    title: "Photo previews are paused",
    body: "You can still explore with a sample person. Please check back later.",
  },
  "feature.disabled": {
    title: "That isn’t available right now",
    body: "You can carry on with the rest of your plan.",
  },
  "result.notReady": {
    title: "Almost there",
    body: "Your preview is still being made. Please wait a moment.",
  },
  "result.expired": {
    title: "This preview has expired",
    body: "Previews are only kept for a short time. You can make it again.",
  },
  "share.unauthorised": {
    title: "This link isn’t working",
    body: "It may have expired or been removed. Ask for a new one.",
  },
  "capture.retake.shoulders": {
    title: "Show your shoulders",
    body: "Move back a little so your head and both shoulders are in the photo.",
  },
  "capture.retake.faceForward": {
    title: "Look straight at the camera",
    body: "Keep your head level and facing forward, then try again.",
  },
  "capture.retake.faceVisible": {
    title: "We couldn’t see your face clearly",
    body: "Make sure only you are in the photo, with good light on your face.",
  },
  "capture.retake.size": {
    title: "Let’s retake it a bit closer",
    body: "Your face needs to fill a little more of the photo.",
  },
  "capture.hairTooShort": {
    title: "This works best while hair is longer",
    body: "The styling tool needs enough hair to work with. You can still read the plan guidance and see what to ask for.",
  },
} satisfies Record<MessageKey, Message>;
