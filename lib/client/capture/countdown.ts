import { THRESHOLDS } from "./checks";

/*
 * The auto-capture decision, as a pure state machine (the camera engine feeds
 * it once per analysed frame):
 *
 *   guiding ── all checks pass and head still for 1 s ──▶ counting 3 · 2 · 1 ──▶ fire
 *   counting ── a check fails for > 400 ms ──▶ guiding (cancelled)
 *
 * `fire` is true exactly once per arming. Pure so it can be tested without a
 * camera, a clock or a DOM.
 */
export const COUNTDOWN_FROM = 3;
export const COUNTDOWN_STEP_MS = 1000;
/** A check may blip for this long during the countdown before it is cancelled. */
export const CANCEL_AFTER_MS = 400;

export type CountdownPhase = "guiding" | "counting";

export type CountdownOutput = {
  phase: CountdownPhase;
  /** 3, 2, 1 while counting; null otherwise. */
  countdown: number | null;
  /** True on the single frame where the photo should be taken. */
  fire: boolean;
};

export class AutoCapture {
  private phase: CountdownPhase = "guiding";
  private startedAt = 0;
  private failingSince: number | null = null;
  private fired = false;

  update(allChecksPass: boolean, steadyMs: number, now: number): CountdownOutput {
    if (this.phase === "counting") {
      if (allChecksPass) this.failingSince = null;
      else this.failingSince ??= now;

      if (this.failingSince !== null && now - this.failingSince > CANCEL_AFTER_MS) {
        this.phase = "guiding";
        this.failingSince = null;
        return { phase: "guiding", countdown: null, fire: false };
      }

      const countdown = COUNTDOWN_FROM - Math.floor((now - this.startedAt) / COUNTDOWN_STEP_MS);
      if (countdown <= 0) {
        this.phase = "guiding";
        const fire = !this.fired;
        this.fired = true;
        return { phase: "guiding", countdown: null, fire };
      }
      return { phase: "counting", countdown, fire: false };
    }

    if (allChecksPass && steadyMs >= THRESHOLDS.steadyMs && !this.fired) {
      this.phase = "counting";
      this.startedAt = now;
      this.failingSince = null;
      return { phase: "counting", countdown: COUNTDOWN_FROM, fire: false };
    }
    return { phase: "guiding", countdown: null, fire: false };
  }

  /** Allow another automatic capture (after "Retake"). */
  rearm() {
    this.phase = "guiding";
    this.fired = false;
    this.failingSince = null;
  }
}
