// Optional convenience layer that lets the desktop client remember the
// vault passphrase across launches via the OS keychain (Electron
// `safeStorage` — Keychain on macOS, DPAPI on Windows, libsecret on Linux).
//
// Security model: the IndexedDB vault (PBKDF2 → AES-GCM) is unchanged.
// What we cache is just the passphrase that derives the AES key — encrypted
// at rest by the OS keychain. The renderer only handles base64 ciphertext;
// decrypted plaintext lives only in the main process and is round-tripped
// for one unlock at a time.
//
// In the browser this module is dormant: `isAvailable()` returns false and
// callers fall back to the existing passphrase-on-every-launch flow.

import { getBridge } from "./platform";

const STORAGE_KEY = "aegis.desktop.passphrase_v1";

/** True when the desktop bridge is present AND the OS keychain is usable
 *  (e.g. on Linux this can be false if libsecret isn't running). */
export async function isAvailable(): Promise<boolean> {
  const bridge = getBridge();
  if (!bridge) return false;
  try {
    return await bridge.vault.isAvailable();
  } catch {
    return false;
  }
}

/** Returns true if a remembered passphrase is currently stored. Only
 *  meaningful on desktop; always false in the browser. */
export function hasRemembered(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/** Encrypt and persist the passphrase via the OS keychain. */
export async function remember(passphrase: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge) throw new Error("desktop bridge unavailable");
  const ciphertextB64 = await bridge.vault.encrypt(passphrase);
  localStorage.setItem(STORAGE_KEY, ciphertextB64);
}

/** Decrypt and return the remembered passphrase, or null if none is stored
 *  or the keychain refuses to decrypt. */
export async function recall(): Promise<string | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  const ciphertextB64 = localStorage.getItem(STORAGE_KEY);
  if (!ciphertextB64) return null;
  try {
    return await bridge.vault.decrypt(ciphertextB64);
  } catch {
    // Cipher might be stale (OS-key rotation, app reinstall, profile move).
    // Drop it so the user is prompted next time instead of looping.
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/** Forget any remembered passphrase. Always safe to call. */
export function forget(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
