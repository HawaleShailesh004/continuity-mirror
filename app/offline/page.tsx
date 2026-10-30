import { Screen } from "@/components/cm/screen";
import { EmptyState } from "@/components/cm/states";
import { ButtonLink } from "@/components/ui/button";
import { copy } from "@/content/copy";

export const metadata = { title: "You’re offline" };

/* Precached by the service worker (F7). Plan, export and privacy work from local data. */
export default function OfflinePage() {
  return (
    <Screen title={copy.offline.title}>
      <EmptyState
        title={copy.states.offlineTitle}
        body={copy.states.offlineBody}
        action={
          <ButtonLink href="/plan" size="lg">
            {copy.states.offlineCta}
          </ButtonLink>
        }
      />
    </Screen>
  );
}
