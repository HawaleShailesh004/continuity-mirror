"use client";

import { InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { LocalTime } from "./local-time";
import { copy } from "@/content/copy";
import type { Job } from "@/lib/contracts";

/*
 * "How this was made": the real endpoint, version, settings, task id and time
 * for every step, from the job's provenance. Judges and careful users can see
 * exactly what happened. In mock mode it says plainly the result isn't YouCam's.
 */
export function HowMadeDrawer({ provenance, units }: { provenance: Job["provenance"]; units?: readonly number[] }) {
  return (
    <Sheet
      title={copy.howMade.title}
      description={copy.howMade.intro}
      trigger={
        <Button variant="quiet" className="h-11 px-3 text-sm">
          <InfoIcon aria-hidden="true" className="size-4" />
          {copy.howMade.open}
        </Button>
      }
    >
      <p className="mb-4 rounded-2xl bg-surface px-4 py-3 text-sm font-semibold">{copy.howMade.mode[provenance.mode]}</p>
      <ol className="flex flex-col gap-5">
        {provenance.steps.map((step, i) => (
          <li key={i} className="flex flex-col gap-2">
            <h3 className="text-base">
              {copy.howMade.step(i + 1)}
              {units?.[i] != null && <span className="font-normal text-text-muted"> · {copy.howMade.units(units[i])}</span>}
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-text-muted">{copy.howMade.endpoint}</dt>
              <dd className="font-mono text-xs break-all">{step.endpoint}</dd>
              <dt className="text-text-muted">{copy.howMade.version}</dt>
              <dd>{step.apiVersion}</dd>
              <dt className="text-text-muted">{copy.howMade.taskId}</dt>
              <dd className="font-mono text-xs break-all">{step.youcamTaskId ?? copy.howMade.none}</dd>
              <dt className="text-text-muted">{copy.howMade.time}</dt>
              <dd>{step.finishedAt ? <LocalTime iso={step.finishedAt} /> : copy.howMade.none}</dd>
            </dl>
            <div>
              <p className="mb-1 text-sm text-text-muted">{copy.howMade.params}</p>
              <pre
                tabIndex={0}
                aria-label={`${copy.howMade.params}, ${copy.howMade.step(i + 1)}`}
                className="overflow-x-auto rounded-2xl bg-surface p-3 font-mono text-xs leading-relaxed"
              >
                {JSON.stringify(step.params, null, 2)}
              </pre>
            </div>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
