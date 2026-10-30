// Loaded lazily by MotionProvider so animation features stay out of the
// first-paint bundle. domMax (not domAnimation) because layoutId morphs
// (sliding pill, capture → "You, before" thumbnail, card → compare) need it.
import { domMax } from "motion/react";

export default domMax;
