/*
 * The camera session (frontend plan §6, signature moments 2 and 3).
 *
 * Opens the front camera, analyses the centred 3:4 region the user sees about
 * ten times a second, and turns the checks into one calm instruction at a time.
 * When every check has passed and the head has been still for a second it
 * counts 3-2-1 and asks the screen to take the photo; any failing check during
 * the countdown cancels it. A manual shutter is always available.
 *
 * If the models can't load (old phone, blocked WASM), the camera still works:
 * `models` is "failed" and the screen shows a written checklist instead of live
 * tips. YouCam's own rejections still protect the user later.
 */
import { SteadyTracker, allPass, primaryTip, type CheckResult, type TipKey } from "./checks";
import { AutoCapture } from "./countdown";
import { encodeForUpload, portraitCrop } from "./encode";
import { analyseFrame, loadDetectors, type Detectors } from "./mediapipe";

export type CameraProblem = "denied" | "none" | "unavailable";

export type EngineState = {
  phase: "starting" | "guiding" | "counting" | "failed";
  /** The guide models: still loading, ready (live checks run), or failed (manual mode). */
  models: "loading" | "ready" | "failed";
  results: readonly CheckResult[];
  tip: TipKey | undefined;
  /** 3, 2, 1 while counting down. */
  countdown: number | null;
  problem?: CameraProblem;
};

const ANALYSE_EVERY_MS = 100; // ~10 fps

const initial: EngineState = { phase: "starting", models: "loading", results: [], tip: undefined, countdown: null };

function classify(error: unknown): CameraProblem {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "none";
  return "unavailable";
}

export class CaptureEngine {
  private state: EngineState = initial;
  private stream: MediaStream | null = null;
  private detectors: Detectors | null = null;
  private steady = new SteadyTracker();
  private stopped = false;
  private lastAnalysis = -Infinity;
  private auto = new AutoCapture();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private frameHandle: number | undefined;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onState: (state: EngineState) => void,
    /** Called once when the countdown reaches zero. The screen then calls capture(). */
    private readonly onAutoCapture: () => void,
  ) {}

  private set(patch: Partial<EngineState>) {
    const next = { ...this.state, ...patch };
    // Re-render only when something the user can see changed (not every 100 ms frame).
    const sig = (s: EngineState) =>
      `${s.phase}|${s.models}|${s.tip}|${s.countdown}|${s.problem}|${s.results.map((r) => (r.ok ? 1 : 0)).join("")}`;
    const changed = sig(next) !== sig(this.state);
    this.state = next;
    if (changed) this.onState(next);
  }

  /** Open the camera and start checking. Resolves when the preview is playing. */
  async start(): Promise<void> {
    this.stopped = false;
    this.auto.rearm();
    this.set({ ...initial });
    this.onState(this.state);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1706 } },
        audio: false,
      });
    } catch (error) {
      if (!this.stopped) this.set({ phase: "failed", problem: classify(error) });
      return;
    }
    // Stopped while waiting for the camera (React's dev double-mount, or a quick
    // tab switch): hand the camera back and leave the <video> alone, because a
    // newer engine may already be using it.
    if (this.stopped) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;

    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    try {
      await this.video.play();
    } catch {
      if (!this.stopped) this.set({ phase: "failed", problem: "unavailable" });
      return this.release();
    }
    if (this.stopped) return;

    this.set({ phase: "guiding" });
    this.schedule();

    // Models load in the background; the preview is already live.
    loadDetectors()
      .then((detectors) => {
        if (this.stopped) return;
        this.detectors = detectors;
        this.set({ models: "ready" });
      })
      .catch(() => this.set({ models: "failed" }));
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.frameHandle !== undefined && "cancelVideoFrameCallback" in this.video) {
      this.video.cancelVideoFrameCallback(this.frameHandle);
    }
    this.release();
  }

  private release() {
    this.stream?.getTracks().forEach((track) => track.stop());
    // Only clear the preview if it is still ours; a newer engine may have taken the <video>.
    if (this.stream && this.video.srcObject === this.stream) this.video.srcObject = null;
    this.stream = null;
  }

  private schedule() {
    if (this.stopped) return;
    if ("requestVideoFrameCallback" in this.video) {
      this.frameHandle = this.video.requestVideoFrameCallback((now) => this.tick(now));
    } else {
      this.timer = setTimeout(() => this.tick(performance.now()), ANALYSE_EVERY_MS);
    }
  }

  private tick(now: number) {
    if (this.stopped) return;
    const { video, detectors } = this;
    if (detectors && video.readyState >= 2 && video.videoWidth > 0 && now - this.lastAnalysis >= ANALYSE_EVERY_MS) {
      this.lastAnalysis = now;
      try {
        const analysis = analyseFrame(detectors, video, portraitCrop(video.videoWidth, video.videoHeight), now);
        this.advance(analysis.results, this.steady.push(now, analysis.nose, analysis.aspect), now);
      } catch {
        // One bad frame is not worth interrupting the preview for.
      }
    }
    this.schedule();
  }

  /** Feed the checks to the auto-capture machine and publish what changed. */
  private advance(results: readonly CheckResult[], steadyMs: number, now: number) {
    const out = this.auto.update(allPass(results), steadyMs, now);
    this.set({ results, tip: primaryTip(results), phase: out.phase, countdown: out.countdown });
    if (out.fire) this.onAutoCapture();
  }

  /** Take the photo now (the shutter, or the end of the countdown). */
  async capture(): Promise<{ blob: Blob; width: number; height: number }> {
    const { video } = this;
    return encodeForUpload(video, portraitCrop(video.videoWidth, video.videoHeight));
  }

  /** Allow another automatic capture (after "Retake"). */
  rearm() {
    this.auto.rearm();
    this.steady.reset();
    this.set({ phase: this.state.phase === "failed" ? "failed" : "guiding", countdown: null });
  }
}
