// Browser entry for API mocks. Call startMockWorker() from a client component when
// NEXT_PUBLIC_API_MOCKS=1, before the first API request.
//
//   ?mock=<scenario>    sets the default scenario (remembered), e.g. ?mock=no_shoulder
//   ?mockLatency=0      instant jobs (remembered); 1 = realistic
//   window.cmMock       { backend, setScenario, reset } for the console
import { setupWorker } from "msw/browser";
import { MockScenario } from "../api";
import { MockBackend, type MockState } from "./backend";
import { createHandlers } from "./handlers";

const STATE_KEY = "cm:mock:state";
const SCENARIO_KEY = "cm:mock:scenario";
const LATENCY_KEY = "cm:mock:latency";

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function readSetting(param: string, key: string): string | null {
  const fromUrl = new URL(window.location.href).searchParams.get(param);
  if (fromUrl !== null) storage()?.setItem(key, fromUrl);
  return fromUrl ?? storage()?.getItem(key) ?? null;
}

let started: Promise<MockBackend> | undefined;

export function startMockWorker(options: { scenario?: MockScenario; latencyScale?: number } = {}): Promise<MockBackend> {
  started ??= (async () => {
    const scenario = MockScenario.safeParse(readSetting("mock", SCENARIO_KEY) ?? options.scenario).data ?? "ok";
    const latency = Number(readSetting("mockLatency", LATENCY_KEY) ?? options.latencyScale ?? 1);
    const backend = new MockBackend({
      scenario,
      latencyScale: Number.isFinite(latency) ? latency : 1,
      loadImage: async (path) => (await fetch(path)).arrayBuffer(),
      onChange: (state) => {
        try {
          storage()?.setItem(STATE_KEY, JSON.stringify(state));
        } catch {
          /* quota or private mode: mocks still work for this page load */
        }
      },
    });
    try {
      const saved = storage()?.getItem(STATE_KEY);
      if (saved) backend.importState(JSON.parse(saved) as MockState);
    } catch {
      /* corrupt state: start fresh */
    }
    await setupWorker(...createHandlers(backend)).start({ onUnhandledFrame: "bypass", quiet: true });
    Object.assign(window, {
      cmMock: {
        backend,
        setScenario: (s: MockScenario) => {
          storage()?.setItem(SCENARIO_KEY, s);
          backend.setScenario(s);
        },
        reset: () => backend.reset(),
      },
    });
    console.info(`[mock api] scenario=${scenario} latency=${latency}`);
    return backend;
  })();
  return started;
}
