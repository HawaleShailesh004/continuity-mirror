import "server-only";
import { join } from "node:path";
import type { Env } from "../env";
import type { YouCamAdapter } from "./adapter";
import { LiveYouCamAdapter } from "./live";
import { MockYouCamAdapter } from "./mock";
import { ReplayYouCamAdapter } from "./replay";

export function createAdapter(env: Env): YouCamAdapter {
  switch (env.YOUCAM_MODE) {
    case "live":
      return new LiveYouCamAdapter({ base: env.YOUCAM_API_BASE, apiKey: env.YOUCAM_API_KEY! });
    case "replay":
      return new ReplayYouCamAdapter({ fixturesDir: join(process.cwd(), "tests", "fixtures", "youcam"), publicDir: join(process.cwd(), "public"), strict: false });
    case "mock":
      return new MockYouCamAdapter();
  }
}
