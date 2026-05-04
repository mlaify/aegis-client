// Local persistence layer.
//
// Long-term identity secrets are encrypted at rest using PBKDF2-SHA256 →
// AES-256-GCM (Web Crypto API). The derived key is cached in memory for the
// session so the passphrase is only entered once per page load.
//
// One-time prekey secrets are stored unencrypted in IndexedDB (each is
// single-use; encrypting them individually would require the passphrase on
// every message open). TODO: encrypt prekeys at rest in a future iteration.
//
// UI preferences (relay URL) remain in localStorage (non-sensitive).

import type {
  HybridPqPrivateKeyMaterial,
  IdentityDocument,
  OneTimePrekeySecret,
  PrekeyBundlePrivateMaterial,
} from "@aegis/sdk";

// ---------------------------------------------------------------------------
// IndexedDB schema
// ---------------------------------------------------------------------------

const DB_NAME = "aegis-web-v0";
const DB_VERSION = 1;

interface IdentityRecord {
  id: "singleton";
  doc: IdentityDocument;
  vault: EncryptedVault;
}

interface EncryptedVault {
  salt_b64: string;
  iv_b64: string;
  ciphertext_b64: string;
}

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < raw.length; i++) binary += String.fromCharCode(raw[i]);
  return btoa(binary);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("identity")) {
        db.createObjectStore("identity", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("prekeys")) {
        db.createObjectStore("prekeys", { keyPath: "key_id" });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbPut(store: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const req = tx.objectStore(store).put(value);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const req = tx.objectStore(store).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbGetAll<T>(store: string): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ---------------------------------------------------------------------------
// PBKDF2 + AES-256-GCM vault
// ---------------------------------------------------------------------------

let _sessionKey: CryptoKey | null = null;

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(salt), iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptSecrets(
  key: CryptoKey,
  secrets: HybridPqPrivateKeyMaterial,
): Promise<EncryptedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(secrets));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return {
    salt_b64: "", // salt is stored separately in IdentityRecord; set by caller
    iv_b64: b64(iv),
    ciphertext_b64: b64(ciphertext),
  };
}

async function decryptSecrets(
  key: CryptoKey,
  vault: EncryptedVault,
): Promise<HybridPqPrivateKeyMaterial> {
  const iv = fromB64(vault.iv_b64);
  const ciphertext = fromB64(vault.ciphertext_b64);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    new Uint8Array(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as HybridPqPrivateKeyMaterial;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export function isSessionLocked(): boolean {
  return _sessionKey === null;
}

/** Unlock the session: derive the AES key from the passphrase and cache it.
 *  Returns true if there is a stored identity that can be decrypted with this
 *  passphrase, false if the vault does not exist or the passphrase is wrong. */
export async function unlockSession(passphrase: string): Promise<boolean> {
  const record = await idbGet<IdentityRecord & { salt_b64: string }>("identity", "singleton");
  if (!record) return false;
  const salt = fromB64((record.vault as unknown as { salt_b64: string }).salt_b64);
  const key = await deriveKey(passphrase, salt);
  try {
    await decryptSecrets(key, record.vault);
    _sessionKey = key;
    return true;
  } catch {
    return false;
  }
}

export function lockSession(): void {
  _sessionKey = null;
}

// ---------------------------------------------------------------------------
// localStorage prefs
// ---------------------------------------------------------------------------

const RELAY_URL_KEY = "aegis.relay_url";

export async function loadRelayUrl(): Promise<string | null> {
  return localStorage.getItem(RELAY_URL_KEY);
}

export async function saveRelayUrl(url: string): Promise<void> {
  localStorage.setItem(RELAY_URL_KEY, url);
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface StoredIdentity {
  identity_id: string;
  aliases: string[];
  supported_suites: string[];
  prekey_secret_count: number;
  document?: IdentityDocument;
}

export async function loadIdentity(): Promise<StoredIdentity | null> {
  const record = await idbGet<IdentityRecord>("identity", "singleton");
  if (!record) return null;
  const prekeySecrets = await idbGetAll<OneTimePrekeySecret>("prekeys");
  return {
    identity_id: record.doc.identity_id,
    aliases: record.doc.aliases,
    supported_suites: record.doc.supported_suites,
    prekey_secret_count: prekeySecrets.length,
    document: record.doc,
  };
}

/** Create a new identity, encrypting secrets with the passphrase.
 *  Also sets the session key so the caller doesn't need to unlock immediately. */
export async function createIdentity(
  doc: IdentityDocument,
  secrets: HybridPqPrivateKeyMaterial,
  passphrase: string,
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const vault = await encryptSecrets(key, secrets);
  vault.salt_b64 = b64(salt); // store salt in the vault blob
  await idbPut("identity", { id: "singleton", doc, vault });
  _sessionKey = key;
}

/** Load the decrypted secrets. Requires an unlocked session. */
export async function loadSecrets(): Promise<HybridPqPrivateKeyMaterial> {
  if (!_sessionKey) throw new Error("vault is locked — call unlockSession() first");
  const record = await idbGet<IdentityRecord>("identity", "singleton");
  if (!record) throw new Error("no identity stored");
  return decryptSecrets(_sessionKey, record.vault);
}

/** Persist an updated identity document (e.g. after adding relay_endpoints). */
export async function updateIdentityDoc(doc: IdentityDocument): Promise<void> {
  const record = await idbGet<IdentityRecord>("identity", "singleton");
  if (!record) throw new Error("no identity stored");
  await idbPut("identity", { ...record, doc });
}

// ---------------------------------------------------------------------------
// One-time prekey secrets
// ---------------------------------------------------------------------------

export async function loadPrekeySecrets(): Promise<OneTimePrekeySecret[]> {
  return idbGetAll<OneTimePrekeySecret>("prekeys");
}

export async function savePrekeyBundle(priv: PrekeyBundlePrivateMaterial): Promise<void> {
  for (const secret of priv.one_time_prekey_secrets) {
    await idbPut("prekeys", secret);
  }
}

/** Remove a consumed prekey secret after successful open. */
export async function consumePrekeySecret(keyId: string): Promise<void> {
  await idbDelete("prekeys", keyId);
}
