// Tracks which envelope_ids the user has already seen, so the Inbox can
// distinguish "freshly arrived" from "already-shown" between fetches and
// drive the OS-level dock badge / new-envelope notification on desktop.
//
// Persisted in localStorage (non-sensitive — it's a list of relay-assigned
// envelope IDs the user has already been shown a notification for).
// Identity-scoped so signing out / switching identities resets the set.

const KEY_PREFIX = "aegis.inbox_seen_v1.";
const MAX_RETAINED = 1000; // cap so the set doesn't grow without bound

function key(identityId: string): string {
  return `${KEY_PREFIX}${identityId}`;
}

export function loadSeen(identityId: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(identityId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

export function saveSeen(identityId: string, seen: Set<string>): void {
  let ids = Array.from(seen);
  if (ids.length > MAX_RETAINED) ids = ids.slice(-MAX_RETAINED);
  localStorage.setItem(key(identityId), JSON.stringify(ids));
}

export function clearSeen(identityId: string): void {
  localStorage.removeItem(key(identityId));
}

/** Returns the envelope IDs in `current` that are not in `seen`. */
export function newEnvelopeIds(
  current: { envelope_id: string }[],
  seen: Set<string>,
): string[] {
  return current
    .map((e) => e.envelope_id)
    .filter((id) => !seen.has(id));
}
