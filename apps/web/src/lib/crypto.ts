// Crypto runtime — @noble-based implementation of the Aegis hybrid PQ suite.
//
// Encryption: X25519 ECDH + ML-KEM-768 → HKDF-SHA256 → XChaCha20-Poly1305.
// Signing:    Ed25519 + ML-DSA-65 (FIPS 204) hybrid signatures.
//
// Wire-compatible with the Rust aegis-core implementation (ml-kem 0.3 / ml-dsa
// 0.1.0-rc.9, both FIPS 203/204 final) because @noble/post-quantum 0.2.x also
// implements FIPS 203/204 final.
//
// NOTE: The ML-KEM-768 secretKey stored in HybridPqPrivateKeyMaterial is the
// 2400-byte full decapsulation key as returned by noble (not the 64-byte seed
// that aegit-cli stores). Web-client private key files are not interchangeable
// with CLI key files, but public keys and ciphertexts are wire-compatible.

import { ml_kem768 } from "@noble/post-quantum/ml-kem";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa";
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes, utf8ToBytes, concatBytes } from "@noble/hashes/utils";

import type {
  EncryptedBlob,
  Envelope,
  HybridPqPrivateKeyMaterial,
  IdentityDocument,
  PrekeyBundle,
  PrekeyBundlePrivateMaterial,
  PrivatePayload,
  PublicKeyRecord,
} from "@aegis/sdk";

import { ALG_ED25519, ALG_MLDSA65, ALG_MLKEM768, ALG_X25519, SUITE_HYBRID_PQ } from "@aegis/sdk";

// The Rust SuiteId enum serializes as its variant name, not the human-readable
// AMP-* string. That string is used only in IdentityDocument.supported_suites.
const ENVELOPE_SUITE_ID = "HybridX25519MlKem768Ed25519MlDsa65";
const HKDF_INFO = utf8ToBytes("aegis-v2-hybrid-encrypt");

// ---------------------------------------------------------------------------
// Base64 utilities (standard, matches Rust's base64::engine::general_purpose::STANDARD)
// ---------------------------------------------------------------------------

export function toB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function fromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Canonical JSON — field order must exactly match Rust serde_json struct order
// ---------------------------------------------------------------------------

function canonicalPkr(k: PublicKeyRecord): object {
  return { key_id: k.key_id, algorithm: k.algorithm, public_key_b64: k.public_key_b64 };
}

export function canonicalIdentityDocBytes(doc: IdentityDocument): Uint8Array {
  return utf8ToBytes(
    JSON.stringify({
      version: doc.version,
      identity_id: doc.identity_id,
      aliases: doc.aliases,
      signing_keys: doc.signing_keys.map(canonicalPkr),
      encryption_keys: doc.encryption_keys.map(canonicalPkr),
      supported_suites: doc.supported_suites,
      relay_endpoints: doc.relay_endpoints,
      signature: null,
    }),
  );
}

export function canonicalPrekeyBundleBytes(bundle: PrekeyBundle): Uint8Array {
  return utf8ToBytes(
    JSON.stringify({
      identity_id: bundle.identity_id,
      signed_prekeys: bundle.signed_prekeys.map(canonicalPkr),
      one_time_prekeys: bundle.one_time_prekeys.map(canonicalPkr),
      supported_suites: bundle.supported_suites,
      expires_at: bundle.expires_at ?? null,
      signature: null,
    }),
  );
}

function canonicalEnvelopeBytes(env: Envelope): Uint8Array {
  // Payload: skip_serializing_if = "Option::is_none" for the optional fields
  const payload: Record<string, unknown> = {
    nonce_b64: env.payload.nonce_b64,
    ciphertext_b64: env.payload.ciphertext_b64,
  };
  if (env.payload.eph_x25519_public_key_b64 != null)
    payload.eph_x25519_public_key_b64 = env.payload.eph_x25519_public_key_b64;
  if (env.payload.mlkem_ciphertext_b64 != null)
    payload.mlkem_ciphertext_b64 = env.payload.mlkem_ciphertext_b64;

  // outer_pq_signature_b64 uses #[serde(skip_serializing_if = "Option::is_none")]
  // so it must NOT appear in canonical bytes (both sigs zeroed during signing).
  const obj: Record<string, unknown> = {
    version: env.version,
    envelope_id: env.envelope_id,
    recipient_id: env.recipient_id,
    sender_hint: env.sender_hint ?? null,
    created_at: env.created_at,
    expires_at: env.expires_at ?? null,
    content_type: env.content_type,
    suite_id: env.suite_id,
    used_prekey_ids: env.used_prekey_ids,
    payload,
    outer_signature_b64: null,
    // outer_pq_signature_b64 intentionally absent — skip_serializing_if = None
  };
  return utf8ToBytes(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Hybrid sign helper (Ed25519 + ML-DSA-65)
// ---------------------------------------------------------------------------

function hybridSign(
  bytes: Uint8Array,
  ed25519Seed: Uint8Array,
  mldsaSk: Uint8Array,
): string {
  const edSig = ed25519.sign(bytes, ed25519Seed);
  const pqSig = ml_dsa65.sign(mldsaSk, bytes);
  return `ed25519:${toB64(edSig)}|dilithium3:${toB64(pqSig)}`;
}

// ---------------------------------------------------------------------------
// CryptoRuntime interface (re-exported so callers don't need a second import)
// ---------------------------------------------------------------------------

export interface CryptoRuntime {
  generateIdentity(identityId: string): Promise<{
    document: IdentityDocument;
    secrets: HybridPqPrivateKeyMaterial;
  }>;

  signIdentityDocument(
    doc: IdentityDocument,
    secrets: HybridPqPrivateKeyMaterial,
  ): Promise<void>;

  generatePrekeyBundle(
    identityId: string,
    count: number,
    keyIdPrefix: string,
  ): Promise<{ bundle: PrekeyBundle; private: PrekeyBundlePrivateMaterial }>;

  signPrekeyBundle(bundle: PrekeyBundle, secrets: HybridPqPrivateKeyMaterial): Promise<void>;

  sealHybridPq(args: {
    recipient: IdentityDocument;
    payload: PrivatePayload;
    senderSecrets: HybridPqPrivateKeyMaterial;
    senderHint: string;
    prekey?: { keyId: string; kyber768PublicKeyB64: string };
  }): Promise<Envelope>;

  openHybridPq(args: {
    envelope: Envelope;
    recipientSecrets: HybridPqPrivateKeyMaterial;
    prekeyKyber768SecretB64?: string;
    senderDocument?: IdentityDocument;
  }): Promise<PrivatePayload>;
}

// ---------------------------------------------------------------------------
// Noble implementation
// ---------------------------------------------------------------------------

class NobleCryptoRuntime implements CryptoRuntime {
  async generateIdentity(identityId: string) {
    const x25519Priv = x25519.utils.randomPrivateKey();
    const x25519Pub = x25519.getPublicKey(x25519Priv);

    const mlkemKeys = ml_kem768.keygen();

    const ed25519Seed = randomBytes(32);
    const ed25519Pub = ed25519.getPublicKey(ed25519Seed);

    const mldsaKeys = ml_dsa65.keygen(randomBytes(32));

    const document: IdentityDocument = {
      version: 1,
      identity_id: identityId,
      aliases: [],
      signing_keys: [
        { key_id: "sig-ed25519-1", algorithm: ALG_ED25519, public_key_b64: toB64(ed25519Pub) },
        {
          key_id: "sig-mldsa65-1",
          algorithm: ALG_MLDSA65,
          public_key_b64: toB64(mldsaKeys.publicKey),
        },
      ],
      encryption_keys: [
        { key_id: "enc-x25519-1", algorithm: ALG_X25519, public_key_b64: toB64(x25519Pub) },
        {
          key_id: "enc-mlkem768-1",
          algorithm: ALG_MLKEM768,
          public_key_b64: toB64(mlkemKeys.publicKey),
        },
      ],
      supported_suites: [SUITE_HYBRID_PQ],
      relay_endpoints: [],
      signature: null,
    };

    const secrets: HybridPqPrivateKeyMaterial = {
      identity_id: identityId,
      algorithm: "AMP-HYBRID-PQ-PRIVATE-V1",
      x25519_private_key_b64: toB64(x25519Priv),
      kyber768_secret_key_b64: toB64(mlkemKeys.secretKey),
      ed25519_signing_seed_b64: toB64(ed25519Seed),
      dilithium3_secret_key_b64: toB64(mldsaKeys.secretKey),
    };

    return { document, secrets };
  }

  async signIdentityDocument(doc: IdentityDocument, secrets: HybridPqPrivateKeyMaterial) {
    const bytes = canonicalIdentityDocBytes(doc);
    doc.signature = hybridSign(
      bytes,
      fromB64(secrets.ed25519_signing_seed_b64),
      fromB64(secrets.dilithium3_secret_key_b64),
    );
  }

  async generatePrekeyBundle(identityId: string, count: number, keyIdPrefix: string) {
    const publicRecords: PublicKeyRecord[] = [];
    const secretRecords: PrekeyBundlePrivateMaterial["one_time_prekey_secrets"] = [];

    for (let i = 0; i < count; i++) {
      const keys = ml_kem768.keygen();
      const suffixBytes = randomBytes(8);
      const suffix = Array.from(suffixBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const keyId = `${keyIdPrefix}-${suffix}`;

      publicRecords.push({
        key_id: keyId,
        algorithm: ALG_MLKEM768,
        public_key_b64: toB64(keys.publicKey),
      });
      secretRecords.push({
        key_id: keyId,
        algorithm: ALG_MLKEM768,
        kyber768_secret_key_b64: toB64(keys.secretKey),
      });
    }

    const bundle: PrekeyBundle = {
      identity_id: identityId,
      signed_prekeys: [],
      one_time_prekeys: publicRecords,
      supported_suites: [SUITE_HYBRID_PQ],
      expires_at: null,
      signature: null,
    };
    const priv: PrekeyBundlePrivateMaterial = {
      identity_id: identityId,
      one_time_prekey_secrets: secretRecords,
    };

    return { bundle, private: priv };
  }

  async signPrekeyBundle(bundle: PrekeyBundle, secrets: HybridPqPrivateKeyMaterial) {
    const bytes = canonicalPrekeyBundleBytes(bundle);
    bundle.signature = hybridSign(
      bytes,
      fromB64(secrets.ed25519_signing_seed_b64),
      fromB64(secrets.dilithium3_secret_key_b64),
    );
  }

  async sealHybridPq(args: {
    recipient: IdentityDocument;
    payload: PrivatePayload;
    senderSecrets: HybridPqPrivateKeyMaterial;
    senderHint: string;
    prekey?: { keyId: string; kyber768PublicKeyB64: string };
  }): Promise<Envelope> {
    const { recipient, payload, senderSecrets, senderHint, prekey } = args;

    const x25519Rec = recipient.encryption_keys.find((k) => k.algorithm === ALG_X25519);
    if (!x25519Rec) throw new Error("recipient has no X25519 key");
    const recipientX25519Pub = fromB64(x25519Rec.public_key_b64);

    let recipientKyberPub: Uint8Array;
    let usedPrekeyIds: string[] = [];
    if (prekey) {
      recipientKyberPub = fromB64(prekey.kyber768PublicKeyB64);
      usedPrekeyIds = [prekey.keyId];
    } else {
      const kyberRec = recipient.encryption_keys.find((k) => k.algorithm === ALG_MLKEM768);
      if (!kyberRec) throw new Error("recipient has no ML-KEM-768 key");
      recipientKyberPub = fromB64(kyberRec.public_key_b64);
    }

    // X25519 ECDH with ephemeral key
    const ephPriv = x25519.utils.randomPrivateKey();
    const ephPub = x25519.getPublicKey(ephPriv);
    const x25519SS = x25519.getSharedSecret(ephPriv, recipientX25519Pub);

    // ML-KEM-768 encapsulation
    const { cipherText: kyberCt, sharedSecret: kyberSS } =
      ml_kem768.encapsulate(recipientKyberPub);

    // HKDF-SHA256: ikm = x25519_ss || kyber_ss, salt = nonce
    const nonce = randomBytes(24);
    const symmetricKey = hkdf(sha256, concatBytes(x25519SS, kyberSS), nonce, HKDF_INFO, 32);

    // XChaCha20-Poly1305 encrypt
    const plaintext = utf8ToBytes(JSON.stringify(payload));
    const ciphertext = xchacha20poly1305(symmetricKey, nonce).encrypt(plaintext);

    const encPayload: EncryptedBlob = {
      nonce_b64: toB64(nonce),
      ciphertext_b64: toB64(ciphertext),
      eph_x25519_public_key_b64: toB64(ephPub),
      mlkem_ciphertext_b64: toB64(kyberCt),
    };

    // Build envelope (used_prekey_ids must be set BEFORE signing)
    const envelope: Envelope = {
      version: 1,
      envelope_id: crypto.randomUUID(),
      recipient_id: recipient.identity_id,
      sender_hint: senderHint,
      created_at: new Date().toISOString(),
      expires_at: null,
      content_type: "message/private",
      suite_id: ENVELOPE_SUITE_ID,
      used_prekey_ids: usedPrekeyIds,
      payload: encPayload,
      outer_signature_b64: null,
    };

    // Sign canonical bytes (outer_pq_signature_b64 absent = None/skip_serializing_if)
    const canonical = canonicalEnvelopeBytes(envelope);
    envelope.outer_signature_b64 = toB64(
      ed25519.sign(canonical, fromB64(senderSecrets.ed25519_signing_seed_b64)),
    );
    envelope.outer_pq_signature_b64 = toB64(
      ml_dsa65.sign(fromB64(senderSecrets.dilithium3_secret_key_b64), canonical),
    );

    return envelope;
  }

  async openHybridPq(args: {
    envelope: Envelope;
    recipientSecrets: HybridPqPrivateKeyMaterial;
    prekeyKyber768SecretB64?: string;
    senderDocument?: IdentityDocument;
  }): Promise<PrivatePayload> {
    const { envelope, recipientSecrets, prekeyKyber768SecretB64, senderDocument } = args;
    const { payload } = envelope;

    if (!payload.eph_x25519_public_key_b64 || !payload.mlkem_ciphertext_b64)
      throw new Error("envelope missing hybrid PQ payload fields");

    // Verify Ed25519 sender signature if sender document is available
    if (senderDocument && envelope.outer_signature_b64) {
      const canonical = canonicalEnvelopeBytes(envelope);
      const edRec = senderDocument.signing_keys.find((k) => k.algorithm === ALG_ED25519);
      if (edRec) {
        const valid = ed25519.verify(
          fromB64(envelope.outer_signature_b64),
          canonical,
          fromB64(edRec.public_key_b64),
        );
        if (!valid) throw new Error("Ed25519 outer signature verification failed");
      }
    }

    // X25519 ECDH
    const x25519SS = x25519.getSharedSecret(
      fromB64(recipientSecrets.x25519_private_key_b64),
      fromB64(payload.eph_x25519_public_key_b64),
    );

    // ML-KEM-768 decapsulation (use prekey secret if one was used to seal)
    const kyberSkB64 = prekeyKyber768SecretB64 ?? recipientSecrets.kyber768_secret_key_b64;
    const kyberSS = ml_kem768.decapsulate(
      fromB64(payload.mlkem_ciphertext_b64),
      fromB64(kyberSkB64),
    );

    // HKDF-SHA256
    const nonce = fromB64(payload.nonce_b64);
    const symmetricKey = hkdf(sha256, concatBytes(x25519SS, kyberSS), nonce, HKDF_INFO, 32);

    // XChaCha20-Poly1305 decrypt
    let plaintext: Uint8Array;
    try {
      plaintext = xchacha20poly1305(symmetricKey, nonce).decrypt(fromB64(payload.ciphertext_b64));
    } catch {
      throw new Error("decryption failed: wrong key or corrupted data");
    }

    return JSON.parse(new TextDecoder().decode(plaintext)) as PrivatePayload;
  }
}

const _runtime = new NobleCryptoRuntime();

export function cryptoRuntime(): CryptoRuntime {
  return _runtime;
}
