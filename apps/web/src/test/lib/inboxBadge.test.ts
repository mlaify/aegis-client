import { afterEach, describe, expect, it } from "vitest";

import {
  clearSeen,
  loadSeen,
  newEnvelopeIds,
  saveSeen,
} from "@/lib/inboxBadge";

const ID = "amp:did:key:test";

afterEach(() => {
  localStorage.clear();
});

describe("inboxBadge", () => {
  it("loadSeen returns empty when nothing stored", () => {
    expect(loadSeen(ID).size).toBe(0);
  });

  it("round-trips a seen set through localStorage", () => {
    const seen = new Set(["a", "b", "c"]);
    saveSeen(ID, seen);
    expect(loadSeen(ID)).toEqual(new Set(["a", "b", "c"]));
  });

  it("clearSeen removes the stored set", () => {
    saveSeen(ID, new Set(["a"]));
    clearSeen(ID);
    expect(loadSeen(ID).size).toBe(0);
  });

  it("identity-scopes the seen set", () => {
    saveSeen(ID, new Set(["a"]));
    saveSeen("amp:did:key:other", new Set(["b"]));
    expect(loadSeen(ID)).toEqual(new Set(["a"]));
    expect(loadSeen("amp:did:key:other")).toEqual(new Set(["b"]));
  });

  it("loadSeen recovers from corrupted JSON without throwing", () => {
    localStorage.setItem(`aegis.inbox_seen_v1.${ID}`, "{not json");
    expect(loadSeen(ID).size).toBe(0);
  });

  it("loadSeen ignores non-array payloads", () => {
    localStorage.setItem(`aegis.inbox_seen_v1.${ID}`, '{"a":1}');
    expect(loadSeen(ID).size).toBe(0);
  });

  it("newEnvelopeIds returns only those not in the seen set", () => {
    const fresh = newEnvelopeIds(
      [{ envelope_id: "a" }, { envelope_id: "b" }, { envelope_id: "c" }],
      new Set(["a", "c"]),
    );
    expect(fresh).toEqual(["b"]);
  });

  it("saveSeen caps retained ids at 1000 to bound localStorage growth", () => {
    const huge = new Set<string>();
    for (let i = 0; i < 1500; i++) huge.add(`id-${i}`);
    saveSeen(ID, huge);
    expect(loadSeen(ID).size).toBe(1000);
  });
});
