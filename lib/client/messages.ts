import { copy } from "@/content/copy";

/**
 * Backend messageKey → words. A key we don't know (older client, newer
 * server) gets the calm generic message instead of a blank or a raw key.
 */
export function messageFor(key: string): { title: string; body: string } {
  return (copy.messages as Record<string, { title: string; body: string }>)[key] ?? copy.unknownMessage;
}
