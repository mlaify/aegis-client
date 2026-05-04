// Crypto runtime interface.
//
// The browser implementation uses pure-JS primitives:
//   - @noble/curves/ed25519 + @noble/curves/x25519
//   - @noble/post-quantum/ml-kem (ML-KEM-768 / Kyber768)
//   - @noble/post-quantum/ml-dsa (ML-DSA-65 / Dilithium3)
//   - @noble/ciphers/chacha (XChaCha20-Poly1305)
//   - @noble/hashes (HKDF-SHA256, BLAKE3)
//
// This module declares the *interface* that the rest of the app consumes;
// the implementation lands in the next iteration. Keeping the surface
// abstract means we can swap to a WASM-compiled aegis-core later without
// rewriting any UI code.

import type {
  Envelope,
  HybridPqPrivateKeyMaterial,
  IdentityDocument,
  PrekeyBundle,
  PrekeyBundlePrivateMaterial,
  PrivatePayload,
} from "@aegis/sdk";

export interface CryptoRuntime {
  /** Generate a fresh hybrid PQ identity. Returns the public IdentityDocument
   *  fields and the private key material (caller persists encrypted). */
  generateIdentity(identityId: string): Promise<{
    document: IdentityDocument;
    secrets: HybridPqPrivateKeyMaterial;
  }>;

  /** Sign an IdentityDocument in place using the holder's hybrid signing
   *  keys. Mutates `doc.signature`. */
  signIdentityDocument(
    doc: IdentityDocument,
    secrets: HybridPqPrivateKeyMaterial,
  ): Promise<void>;

  /** Generate `count` fresh ML-KEM-768 one-time prekeys for `identityId`. */
  generatePrekeyBundle(
    identityId: string,
    count: number,
    keyIdPrefix: string,
  ): Promise<{
    bundle: PrekeyBundle;
    private: PrekeyBundlePrivateMaterial;
  }>;

  /** Sign a PrekeyBundle in place using the identity's hybrid signing keys. */
  signPrekeyBundle(
    bundle: PrekeyBundle,
    secrets: HybridPqPrivateKeyMaterial,
  ): Promise<void>;

  /** Encrypt and sign a private payload to the recipient. If
   *  `prekeyKyber768PublicKey` is provided it replaces the recipient's
   *  long-term Kyber key in the hybrid combine and the resulting envelope's
   *  `used_prekey_ids` is populated by the caller. */
  sealHybridPq(args: {
    recipient: IdentityDocument;
    payload: PrivatePayload;
    senderSecrets: HybridPqPrivateKeyMaterial;
    senderHint: string;
    prekey?: { keyId: string; kyber768PublicKeyB64: string };
  }): Promise<Envelope>;

  /** Decrypt and verify an envelope addressed to the holder. If the envelope
   *  references a one-time prekey, the corresponding secret bytes must be
   *  supplied by the caller (caller is then responsible for atomically
   *  removing the secret from local persistence on success). */
  openHybridPq(args: {
    envelope: Envelope;
    recipientSecrets: HybridPqPrivateKeyMaterial;
    prekeyKyber768SecretB64?: string;
    senderDocument?: IdentityDocument;
  }): Promise<PrivatePayload>;
}

/** Returns the active crypto runtime. Stubbed until the `@noble`-based
 *  implementation lands in the next iteration. */
export function cryptoRuntime(): CryptoRuntime {
  throw new Error(
    "crypto runtime not yet implemented; ships in the next iteration",
  );
}
