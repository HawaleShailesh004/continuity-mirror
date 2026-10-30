import { describe, expect, it } from "vitest";
import { THRESHOLDS } from "@/lib/client/capture/checks";
import { AutoCapture, CANCEL_AFTER_MS, COUNTDOWN_STEP_MS } from "@/lib/client/capture/countdown";

const STEADY = THRESHOLDS.steadyMs;

describe("AutoCapture", () => {
  it("waits for every check to pass AND the head to be still before counting", () => {
    const a = new AutoCapture();
    expect(a.update(false, 5000, 0).phase).toBe("guiding"); // still, but a check fails
    expect(a.update(true, STEADY - 1, 100).phase).toBe("guiding"); // passing, but not still long enough
    expect(a.update(true, STEADY, 200)).toEqual({ phase: "counting", countdown: 3, fire: false });
  });

  it("counts 3, 2, 1 and fires once at zero", () => {
    const a = new AutoCapture();
    a.update(true, STEADY, 0);
    expect(a.update(true, STEADY, COUNTDOWN_STEP_MS - 1).countdown).toBe(3);
    expect(a.update(true, STEADY, COUNTDOWN_STEP_MS).countdown).toBe(2);
    expect(a.update(true, STEADY, 2 * COUNTDOWN_STEP_MS).countdown).toBe(1);
    expect(a.update(true, STEADY, 3 * COUNTDOWN_STEP_MS)).toEqual({ phase: "guiding", countdown: null, fire: true });
  });

  it("never fires twice, and does not restart on its own after firing", () => {
    const a = new AutoCapture();
    a.update(true, STEADY, 0);
    a.update(true, STEADY, 3 * COUNTDOWN_STEP_MS); // fires
    expect(a.update(true, STEADY, 3 * COUNTDOWN_STEP_MS + 100).fire).toBe(false);
    expect(a.update(true, STEADY, 4 * COUNTDOWN_STEP_MS).phase).toBe("guiding");
  });

  it("can be armed again after a retake", () => {
    const a = new AutoCapture();
    a.update(true, STEADY, 0);
    a.update(true, STEADY, 3 * COUNTDOWN_STEP_MS);
    a.rearm();
    expect(a.update(true, STEADY, 10_000).phase).toBe("counting");
  });

  it("forgives a brief blip but cancels when a check keeps failing", () => {
    const a = new AutoCapture();
    a.update(true, STEADY, 0);
    expect(a.update(false, 0, 300).phase).toBe("counting"); // blip starts
    expect(a.update(true, STEADY, 300 + 100).phase).toBe("counting"); // recovered in time
    a.update(false, 0, 1000);
    const cancelled = a.update(false, 0, 1000 + CANCEL_AFTER_MS + 1);
    expect(cancelled).toEqual({ phase: "guiding", countdown: null, fire: false });
  });

  it("needs a fresh steady second after a cancelled countdown", () => {
    const a = new AutoCapture();
    a.update(true, STEADY, 0);
    a.update(false, 0, 100);
    a.update(false, 0, 100 + CANCEL_AFTER_MS + 1);
    expect(a.update(true, 200, 1000).phase).toBe("guiding");
    expect(a.update(true, STEADY, 1200).phase).toBe("counting");
  });
});
