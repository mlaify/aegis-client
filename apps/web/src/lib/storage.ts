// Local persistence layer.
//
// Identity material and prekey secrets live in IndexedDB so they survive a
// page reload but never leak into Vite's dev cache or browser localStorage.
// Keys are stored as opaque base64; encryption-at-rest with a
// passphrase-derived AEAD key wraps everything in a single blob in the
// `secrets` store. UI prefs that are not security-sensitive (current relay
// URL, color-scheme override, etc.) live in localStorage.
//
// This module currently exposes only the read/write contract that the
// scaffolded UI consumes. The actual IndexedDB and AEAD wrapper land
// alongside the crypto runtime in the next iteration.

import type { IdentityDocument } from "@aegis/sdk";

const RELAY_URL_KEY = "aegis.relay_url";

/** UI-facing summary of the local identity. */
export interface StoredIdentity {
  identity_id: string;
  aliases: string[];
  supported_suites: string[];
  /** Number of unclaimed one-time prekey secrets currently held locally. */
  prekey_secret_count: number;
  /** The (public-only) IdentityDocument as it would be published to a relay. */
  document?: IdentityDocument;
}

export async function loadRelayUrl(): Promise<string | null> {
  return localStorage.getItem(RELAY_URL_KEY);
}

export async function saveRelayUrl(url: string): Promise<void> {
  localStorage.setItem(RELAY_URL_KEY, url);
}

/**
 * Returns the locally-stored identity, or null if none has been generated yet.
 *
 * Stub implementation: always returns null until the IndexedDB-backed key
 * store ships in the next iteration.
 */
export async function loadIdentity(): Promise<StoredIdentity | null> {
  return null;
}
