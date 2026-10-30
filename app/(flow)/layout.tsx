import type { ReactNode } from "react";
import { Providers } from "@/components/providers";

/* The guided journey reads and writes the local journey, so it carries the data providers. */
export default function FlowLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
