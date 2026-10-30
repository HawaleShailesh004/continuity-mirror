import type { ReactNode } from "react";
import { Providers } from "@/components/providers";

/* Plan, Privacy and About read the same local data (and keep any job polling alive). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
