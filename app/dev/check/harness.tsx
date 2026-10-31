"use client";

import { useEffect, useState } from "react";
import { deltaE2000, labToHex, repairColour } from "@/lib/client/check/colour";
import { judge, type ResultCheck } from "@/lib/client/check/judge";
import { faceDrift } from "@/lib/client/check/face";
import { loadCheckModels, measure } from "@/lib/client/check/measure";
import { db } from "@/lib/client/db";

type Row = { person: string; key: string; kind: string; drift: number | null; baselineHex: string | null; resultHex: string | null; deltaE: number | null; coverage: number | null };

type Manifest = { personas: { id: string; baseline: string; items: { key: string; kind: string; image: string; spec: { colour?: { source?: string } } }[] }[] };

declare global {
  interface Window {
    __checkRows?: Row[];
    __checkDone?: boolean;
    __cmJudge?: (baselineSrc: string, resultSrc: string, expectOwnColour: boolean) => Promise<ResultCheck>;
    __cmRepairHex?: (baselineSrc: string, resultSrc: string) => Promise<string | null>;
    __cmReady?: boolean;
  }
}

export function CheckHarness() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (new URLSearchParams(location.search).get("api")) {
        window.__cmJudge = async (baselineSrc, resultSrc, expectOwnColour) =>
          judge(await measure(baselineSrc), await measure(resultSrc), { expectOwnColour });
        window.__cmRepairHex = async (baselineSrc, resultSrc) => {
          const [b, r] = await Promise.all([measure(baselineSrc), measure(resultSrc)]);
          return b.hair && r.hair ? labToHex(repairColour(b.hair.lab, r.hair.lab)) : null;
        };
        await loadCheckModels();
        window.__cmReady = true;
        setStatus("api ready");
        return;
      }
      if (new URLSearchParams(location.search).get("live")) {
        // Measure what is stored on this device: the baseline, each result and, when a repair swapped it, the original.
        const out: Row[] = [];
        for (const result of await db.results.toArray()) {
          const baseline = await db.baselines.get(result.baselineId);
          if (!baseline) continue;
          const base = await measure(baseline.image);
          const job = await db.jobs.get(result.clientRequestId);
          for (const [label, blob] of [["image", result.image], ["original", result.original]] as const) {
            if (!blob) continue;
            const res = await measure(blob);
            out.push({ person: "live", key: `${job?.routeKey}:${label}`, kind: job?.check?.repaired?.state ?? "-", drift: base.landmarks && res.landmarks ? faceDrift(base.landmarks, base.size, res.landmarks, res.size) : null, baselineHex: base.hair?.hex ?? null, resultHex: res.hair?.hex ?? null, deltaE: base.hair && res.hair ? deltaE2000(base.hair.lab, res.hair.lab) : null, coverage: res.hair?.coverage ?? null });
          }
        }
        window.__checkRows = out;
        window.__checkDone = true;
        setRows(out);
        setStatus("done");
        return;
      }
      const spike = new URLSearchParams(location.search).get("spike");
      if (spike) {
        const out: Row[] = [];
        for (const name of spike.split(",")) {
          const person = name.startsWith("/") ? "meera" : name.split("-")[0]!;
          const base = await measure(`/demo/${person}/baseline.jpg`);
          const res = await measure(name.startsWith("/") ? name : `/_spike/${name}`);
          out.push({ person, key: name, kind: "spike", drift: base.landmarks && res.landmarks ? faceDrift(base.landmarks, base.size, res.landmarks, res.size) : null, baselineHex: base.hair?.hex ?? null, resultHex: res.hair?.hex ?? null, deltaE: base.hair && res.hair ? deltaE2000(base.hair.lab, res.hair.lab) : null, coverage: res.hair?.coverage ?? null });
        }
        window.__checkRows = out;
        window.__checkDone = true;
        setRows(out);
        setStatus("done");
        return;
      }
      const manifest = (await (await fetch("/demo/manifest.json")).json()) as Manifest;
      const out: Row[] = [];
      for (const person of manifest.personas) {
        const base = await measure(person.baseline);
        for (const item of person.items) {
          if (cancelled) return;
          setStatus(`${person.id} ${item.key}`);
          const res = await measure(item.image);
          const drift = base.landmarks && res.landmarks ? faceDrift(base.landmarks, base.size, res.landmarks, res.size) : null;
          out.push({
            person: person.id,
            key: item.key,
            kind: `${item.kind}:${item.spec.colour?.source ?? "-"}`,
            drift,
            baselineHex: base.hair?.hex ?? null,
            resultHex: res.hair?.hex ?? null,
            deltaE: base.hair && res.hair ? deltaE2000(base.hair.lab, res.hair.lab) : null,
            coverage: res.hair?.coverage ?? null,
          });
          setRows([...out]);
        }
      }
      // Negative control: a baseline against a DIFFERENT person's result must read as a changed face.
      const people = manifest.personas;
      for (let i = 0; i < people.length; i++) {
        const [a, b] = [people[i]!, people[(i + 1) % people.length]!];
        const other = b.items.find((x) => x.key === "closest");
        if (!other) continue;
        const [base, res] = [await measure(a.baseline), await measure(other.image)];
        out.push({ person: a.id, key: `control:${a.id}-vs-${b.id}`, kind: "control", drift: base.landmarks && res.landmarks ? faceDrift(base.landmarks, base.size, res.landmarks, res.size) : null, baselineHex: base.hair?.hex ?? null, resultHex: res.hair?.hex ?? null, deltaE: base.hair && res.hair ? deltaE2000(base.hair.lab, res.hair.lab) : null, coverage: res.hair?.coverage ?? null });
      }
      window.__checkRows = out;
      window.__checkDone = true;
      setStatus("done");
    })().catch((e) => setStatus(`error: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="p-6">
      <h1>Result check harness</h1>
      <p data-testid="status">{status}</p>
      <pre className="text-xs">{JSON.stringify(rows, null, 1)}</pre>
    </main>
  );
}
