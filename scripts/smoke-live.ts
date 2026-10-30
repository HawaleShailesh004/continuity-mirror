// Post-deploy smoke test: drives a deployed (or local) server over HTTP exactly like the app does.
//   pnpm smoke:live -- --url https://your-app.vercel.app            1 live unit (a colour job)
//   pnpm smoke:live -- --url https://… --route                      + one full route (3 units, the real pipeline)
//   pnpm smoke:live -- --url http://localhost:3100 --allow-mock      validate this script against a mock server (0 units)
// Checks: status, baseline upload, a job to success, the result image, share create/read/vote/results/revoke
// (free), the privacy receipt, and cleanup. Exits non-zero on any failure. Never prints secrets.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JobResponse, PrivacyReceipt, StatusResponse, type Job } from "@/lib/contracts/api";
import { sniffImage } from "@/lib/contracts/mocks/image";

const args = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const base = (arg("url") ?? "").replace(/\/$/, "");
const WITH_ROUTE = args.includes("--route");
const ALLOW_MOCK = args.includes("--allow-mock");
const MAX_UNITS = Number(arg("max-units") ?? 3);
if (!/^https?:\/\//.test(base)) {
  console.error("usage: pnpm smoke:live -- --url https://your-app.vercel.app [--route] [--allow-mock] [--max-units=3]");
  process.exit(2);
}

let cookie: string | undefined;
const failures: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (ok: boolean, what: string, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${what}${extra ? `  ${extra}` : ""}`);
  if (!ok) failures.push(what);
  return ok;
};

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(base + path, { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) }, redirect: "manual" });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return res;
}

async function runJob(baselineId: string, spec: unknown, label: string, timeoutMs = 240_000): Promise<{ job: Job; bytes: Uint8Array } | undefined> {
  const started = Date.now();
  const res = await call("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ baselineId, clientRequestId: crypto.randomUUID(), spec }) });
  if (!say(res.status === 202 || res.status === 200, `${label}: job created`, `HTTP ${res.status}`)) {
    console.log("   ", (await res.text()).slice(0, 200));
    return undefined;
  }
  let job = JobResponse.parse(await res.json()).job;
  while (job.status !== "succeeded" && job.status !== "failed" && Date.now() - started < timeoutMs) {
    await sleep(Math.max(job.retryAfterMs, 2000));
    const poll = await call(`/api/jobs/${job.id}`);
    if (!poll.ok) return void say(false, `${label}: poll`, `HTTP ${poll.status}`);
    job = JobResponse.parse(await poll.json()).job;
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  if (!say(job.status === "succeeded", `${label}: finished`, `${job.status} in ${seconds}s${job.error ? ` (${job.error.code} ${job.error.youcamCode ?? ""})` : ""}`)) return undefined;
  const result = await call(`/api/jobs/${job.id}/result`);
  const bytes = new Uint8Array(await result.arrayBuffer());
  const type = sniffImage(bytes);
  say(result.ok && (type.type === "jpeg" || type.type === "png"), `${label}: result is an image`, `${result.headers.get("content-type")} ${bytes.length} bytes ${type.width ?? ""}x${type.height ?? ""}`);
  say(result.headers.get("cache-control")?.includes("no-store") === true, `${label}: result is not cacheable`);
  return { job, bytes };
}

async function main() {
  console.log(`smoke test → ${base}\n`);

  const status = StatusResponse.parse(await (await call("/api/status")).json());
  say(true, "status", `mode=${status.mode} live=${status.live} version=${status.version} shares=${status.capabilities.shares}`);
  if (status.mode !== "live" && !ALLOW_MOCK) {
    say(false, "server is in live mode", `it reports "${status.mode}"; pass --allow-mock only to test this script`);
    return;
  }
  say(status.live, "live generation is on", status.reason ?? "");
  if (!status.live) return;

  const photo = new Uint8Array(readFileSync(join(process.cwd(), "public/demo/amara/baseline.jpg")));
  const form = new FormData();
  form.set("image", new Blob([photo as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), "smoke.jpg");
  const up = await call("/api/baselines", { method: "POST", body: form });
  if (!say(up.status === 201 || up.status === 200, "baseline upload", `HTTP ${up.status}`)) return;
  const baseline = (await up.json()) as { baselineId: string; width: number; height: number };
  say(Math.max(baseline.width, baseline.height) === 1024, "baseline normalised to 1024", `${baseline.width}x${baseline.height}`);

  // A 1-unit colour job exercises upload → task → poll → result on the real API for the cheapest price.
  const colour = await runJob(baseline.baselineId, { kind: "colour", colour: { presetId: "soft-copper", mode: "full" }, attempt: 0 }, "colour job");
  if (colour) say(colour.job.provenance.mode === (status.mode === "live" ? "live" : "mock"), "provenance reports the real mode", colour.job.provenance.mode);
  if (WITH_ROUTE) {
    const route = await runJob(baseline.baselineId, { kind: "route", routeId: "closest", styleId: "coily-shoulder", colour: { source: "own", hex: "#1C1714" }, attempt: 0 }, "route job (2 steps or 1 for references)");
    if (route) say(route.job.steps.length >= 1, "route ran its steps", route.job.steps.map((s) => s.kind).join(" → "));
  }

  // Share links: free, and the part of the product that stores images.
  const after = StatusResponse.parse(await (await call("/api/status")).json());
  if (status.capabilities.shares && colour) {
    const sform = new FormData();
    sform.set("meta", JSON.stringify({ consent: true, items: [{ label: "Smoke test" }], expiresInDays: 1 }));
    sform.append("images", new Blob([colour.bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), "r.jpg");
    const created = await call("/api/shares", { method: "POST", body: sform });
    if (say(created.status === 201, "share created", `HTTP ${created.status}`)) {
      const share = (await created.json()) as { token: string; ownerKey: string; url: string };
      const helperCookie = cookie;
      cookie = undefined; // a helper has no session
      const manifest = await call(`/api/shares/${share.token}`);
      const m = (await manifest.json()) as { items: { key: string; imageUrl: string }[] };
      say(manifest.ok && m.items.length === 1, "helper sees the manifest", `HTTP ${manifest.status}`);
      const img = await call(m.items[0]!.imageUrl);
      say(img.ok && sniffImage(new Uint8Array(await img.arrayBuffer())).type === "jpeg", "helper loads the image (private storage → our route)", `HTTP ${img.status}`);
      const vote = await call(`/api/shares/${share.token}/votes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemKey: "i1", note: "smoke" }) });
      say(vote.status === 201, "helper votes", `HTTP ${vote.status}`);
      say((await call(`/api/shares/${share.token}/results`)).status === 401, "results need the owner key");
      cookie = helperCookie;
      const results = await call(`/api/shares/${share.token}/results`, { headers: { "x-owner-key": share.ownerKey } });
      say(results.ok && ((await results.json()) as { items: { votes: number }[] }).items[0]?.votes === 1, "owner sees the vote");
      const receipt = PrivacyReceipt.parse(await (await call("/api/privacy/receipt")).json());
      say(receipt.serverStoresImages && receipt.shares.length === 1, "receipt admits the stored share");
      say((await call(`/api/shares/${share.token}`, { method: "DELETE", headers: { "x-owner-key": share.ownerKey } })).ok, "owner revokes");
      cookie = undefined;
      say((await call(`/api/shares/${share.token}`)).status === 410, "revoked link answers 410");
      cookie = helperCookie;
    }
  } else {
    console.log("- share links are off on this server (status.capabilities.shares = false): skipped");
  }

  const del = await call(`/api/baselines/${baseline.baselineId}`, { method: "DELETE" });
  say(del.ok, "baseline deleted");
  const receipt = PrivacyReceipt.parse(await (await call("/api/privacy/receipt")).json());
  say(receipt.baselines.length === 0 && receipt.jobs.length === 0 && !receipt.serverStoresImages, "receipt is empty after delete");

  const spent = after.session.unitsUsed;
  say(spent <= MAX_UNITS, `units spent this session ≤ ${MAX_UNITS}`, `${spent} units`);
}

main()
  .catch((err) => {
    failures.push(`crashed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err instanceof Error ? err.message : err);
  })
  .finally(() => {
    console.log(failures.length ? `\nFAILED (${failures.length}):\n  - ${failures.join("\n  - ")}` : "\nall checks passed");
    process.exit(failures.length ? 1 : 0);
  });
