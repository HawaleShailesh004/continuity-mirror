"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { PrivacyReceipt } from "@/components/cm/privacy-receipt";
import { Screen } from "@/components/cm/screen";
import { copy } from "@/content/copy";
import { api } from "@/lib/client/api";
import { db } from "@/lib/client/db";
import { demoBaselineIds } from "@/lib/client/demo";
import { deleteEverything } from "@/lib/client/journey";

/*
 * Privacy Centre: a true receipt. What is on this device comes from
 * IndexedDB, what went to YouCam and what our server holds comes from
 * GET /api/privacy/receipt (no images, ever, unless the user made a share
 * link). Delete everything removes the server's records, every table on the
 * device and the journey, and says plainly that YouCam's own 30-day copy is
 * out of our hands.
 */
export function PrivacyScreen() {
  const [deleted, setDeleted] = useState(false);
  const photos = useLiveQuery(() => db.baselines.count(), []);
  const previews = useLiveQuery(() => db.results.count(), []);
  const sampleOnly = useLiveQuery(async () => {
    const all = await db.baselines.toArray();
    return all.length > 0 && all.every((b) => demoBaselineIds(all).has(b.id));
  }, []);

  const receipt = useQuery({ queryKey: ["privacy-receipt"], queryFn: api.privacyReceipt, retry: 1, enabled: !deleted });

  const ready = photos !== undefined && previews !== undefined;

  return (
    <Screen title={copy.privacy.title} backHref="/">
      <p className="text-text-soft">{copy.privacy.intro}</p>
      {ready && (
        <PrivacyReceipt
          // A sample person never touched the server or YouCam: show nothing for them.
          receipt={sampleOnly ? null : (receipt.data ?? null)}
          serverKnown={Boolean(sampleOnly) || receipt.isSuccess}
          device={{ photos, previews }}
          deleted={deleted}
          onDeleteAll={async () => {
            await deleteEverything();
            setDeleted(true);
          }}
        />
      )}
    </Screen>
  );
}
