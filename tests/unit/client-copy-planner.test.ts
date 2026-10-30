import { describe, expect, it } from "vitest";
import { copy } from "@/content/copy";
import { messageFor } from "@/lib/client/messages";
import { MESSAGE_KEYS } from "@/lib/contracts";

describe("copy", () => {
  it("has words for every backend message key", () => {
    for (const key of MESSAGE_KEYS) {
      const words = copy.messages[key];
      expect(words?.title, key).toBeTruthy();
      expect(words?.body, key).toBeTruthy();
    }
  });

  it("falls back to a calm generic message for a key it doesn't know", () => {
    expect(messageFor("from.a.newer.server")).toEqual(copy.unknownMessage);
  });
});
