// Wire-compat smoke test for the noble crypto runtime.
//
// These tests use REAL noble cryptography — no mocks. They exercise the full
// pipeline: key-gen → seal → open, using the same algorithm constants as
// the Rust aegis-core implementation:
//
//   HKDF-SHA256(ikm = x25519_ss ‖ kyber_ss, salt = nonce, info = "aegis-v2-hybrid-encrypt")
//   XChaCha20-Poly1305(key = hkdf_output, nonce = hkdf_salt)
//   outer_signature: Ed25519(canonical_envelope_bytes)
//
// Test vectors from the Rust CLI cannot be directly imported because the CLI
// stores the ML-KEM-768 64-byte seed whereas noble stores the full 2400-byte
// decapsulation key (DK). The public encapsulation key (1184 bytes) IS
// wire-compatible. CLI interop for the private key path is tracked separately.

import { describe, it, expect } from "vitest";

import { cryptoRuntime } from "@/lib/crypto";
import type { PrivatePayload } from "@aegis/sdk";

const TEST_PAYLOAD: PrivatePayload = {
  private_headers: { subject: "smoke test subject", thread_id: null, in_reply_to: null },
  body: { mime: "text/plain", content: "post-quantum encrypted content" },
  attachments: [],
  extensions: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeIdentity(id: string) {
  const runtime = cryptoRuntime();
  const { document, secrets } = await runtime.generateIdentity(id);
  await runtime.signIdentityDocument(document, secrets);
  return { document, secrets };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CryptoRuntime round-trip (real noble crypto, no mocks)", () => {
  it("seal → open with one-time prekey, sigStatus = verified", async () => {
    const runtime = cryptoRuntime();
    const recipient = await makeIdentity("amp:did:key:recipient-smoke");
    const sender = await makeIdentity("amp:did:key:sender-smoke");

    const { bundle, private: priv } = await runtime.generatePrekeyBundle(
      recipient.document.identity_id,
      1,
      "otp-smoke",
    );
    await runtime.signPrekeyBundle(bundle, recipient.secrets);

    const prekey = bundle.one_time_prekeys[0];
    const prekeySecret = priv.one_time_prekey_secrets[0];

    const envelope = await runtime.sealHybridPq({
      recipient: recipient.document,
      payload: TEST_PAYLOAD,
      senderSecrets: sender.secrets,
      senderHint: sender.document.identity_id,
      prekey: {
        keyId: prekey.key_id,
        kyber768PublicKeyB64: prekey.public_key_b64,
      },
    });

    // Structural assertions
    expect(envelope.suite_id).toBe("HybridX25519MlKem768Ed25519MlDsa65");
    expect(envelope.used_prekey_ids).toEqual([prekey.key_id]);
    expect(envelope.outer_signature_b64).toBeTruthy();
    expect(envelope.outer_pq_signature_b64).toBeTruthy();
    expect(envelope.payload.eph_x25519_public_key_b64).toBeTruthy();
    expect(envelope.payload.mlkem_ciphertext_b64).toBeTruthy();

    const result = await runtime.openHybridPq({
      envelope,
      recipientSecrets: recipient.secrets,
      prekeyKyber768SecretB64: prekeySecret.kyber768_secret_key_b64,
      senderDocument: sender.document,
    });

    expect(result.payload.body.content).toBe(TEST_PAYLOAD.body.content);
    expect(result.payload.private_headers.subject).toBe(TEST_PAYLOAD.private_headers.subject);
    expect(result.payload.attachments).toHaveLength(0);
    expect(result.sigStatus).toBe("verified");
  }, 30_000);

  it("seal → open using identity long-term ML-KEM key (no prekey)", async () => {
    const runtime = cryptoRuntime();
    const recipient = await makeIdentity("amp:did:key:recipient-smoke-2");
    const sender = await makeIdentity("amp:did:key:sender-smoke-2");

    const envelope = await runtime.sealHybridPq({
      recipient: recipient.document,
      payload: TEST_PAYLOAD,
      senderSecrets: sender.secrets,
      senderHint: sender.document.identity_id,
    });

    expect(envelope.used_prekey_ids).toHaveLength(0);

    const result = await runtime.openHybridPq({
      envelope,
      recipientSecrets: recipient.secrets,
      senderDocument: sender.document,
    });

    expect(result.payload.body.content).toBe(TEST_PAYLOAD.body.content);
    expect(result.sigStatus).toBe("verified");
  }, 30_000);

  it("sigStatus = unavailable when no sender document is provided", async () => {
    const runtime = cryptoRuntime();
    const recipient = await makeIdentity("amp:did:key:recipient-unavail");
    const sender = await makeIdentity("amp:did:key:sender-unavail");

    const envelope = await runtime.sealHybridPq({
      recipient: recipient.document,
      payload: TEST_PAYLOAD,
      senderSecrets: sender.secrets,
      senderHint: sender.document.identity_id,
    });

    const result = await runtime.openHybridPq({
      envelope,
      recipientSecrets: recipient.secrets,
      // senderDocument intentionally omitted
    });

    expect(result.payload.body.content).toBe(TEST_PAYLOAD.body.content);
    expect(result.sigStatus).toBe("unavailable");
  }, 30_000);

  it("sigStatus = unsigned when outer_signature_b64 is null", async () => {
    const runtime = cryptoRuntime();
    const recipient = await makeIdentity("amp:did:key:recipient-unsigned");
    const sender = await makeIdentity("amp:did:key:sender-unsigned");

    const envelope = await runtime.sealHybridPq({
      recipient: recipient.document,
      payload: TEST_PAYLOAD,
      senderSecrets: sender.secrets,
      senderHint: sender.document.identity_id,
    });

    const unsignedEnvelope = { ...envelope, outer_signature_b64: null };

    const result = await runtime.openHybridPq({
      envelope: unsignedEnvelope,
      recipientSecrets: recipient.secrets,
      senderDocument: sender.document,
    });

    expect(result.payload.body.content).toBe(TEST_PAYLOAD.body.content);
    expect(result.sigStatus).toBe("unsigned");
  }, 30_000);

  it("sigStatus = failed when outer_signature_b64 is tampered", async () => {
    const runtime = cryptoRuntime();
    const recipient = await makeIdentity("amp:did:key:recipient-tampered");
    const sender = await makeIdentity("amp:did:key:sender-tampered");
    const impostor = await makeIdentity("amp:did:key:impostor-tampered");

    const envelope = await runtime.sealHybridPq({
      recipient: recipient.document,
      payload: TEST_PAYLOAD,
      senderSecrets: sender.secrets,
      senderHint: sender.document.identity_id,
    });

    // Verify with the wrong sender document — signature won't match
    const result = await runtime.openHybridPq({
      envelope,
      recipientSecrets: recipient.secrets,
      senderDocument: impostor.document,
    });

    expect(result.payload.body.content).toBe(TEST_PAYLOAD.body.content);
    expect(result.sigStatus).toBe("failed");
  }, 30_000);

  it("decryption throws with wrong ML-KEM prekey secret", async () => {
    const runtime = cryptoRuntime();
    const recipient = await makeIdentity("amp:did:key:recipient-wrongkey");
    const sender = await makeIdentity("amp:did:key:sender-wrongkey");

    const { bundle } = await runtime.generatePrekeyBundle(
      recipient.document.identity_id,
      1,
      "otp-wrongkey",
    );
    const { private: wrongPrekeys } = await runtime.generatePrekeyBundle(
      recipient.document.identity_id,
      1,
      "otp-wrong2",
    );

    const envelope = await runtime.sealHybridPq({
      recipient: recipient.document,
      payload: TEST_PAYLOAD,
      senderSecrets: sender.secrets,
      senderHint: sender.document.identity_id,
      prekey: {
        keyId: bundle.one_time_prekeys[0].key_id,
        kyber768PublicKeyB64: bundle.one_time_prekeys[0].public_key_b64,
      },
    });

    await expect(
      runtime.openHybridPq({
        envelope,
        recipientSecrets: recipient.secrets,
        prekeyKyber768SecretB64: wrongPrekeys.one_time_prekey_secrets[0].kyber768_secret_key_b64,
      }),
    ).rejects.toThrow("decryption failed");
  }, 30_000);

  it("round-trip preserves null subject and empty attachments", async () => {
    const runtime = cryptoRuntime();
    const recipient = await makeIdentity("amp:did:key:recipient-null");
    const sender = await makeIdentity("amp:did:key:sender-null");

    const nullPayload: PrivatePayload = {
      private_headers: { subject: null, thread_id: null, in_reply_to: null },
      body: { mime: "text/plain", content: "" },
      attachments: [],
      extensions: null,
    };

    const envelope = await runtime.sealHybridPq({
      recipient: recipient.document,
      payload: nullPayload,
      senderSecrets: sender.secrets,
      senderHint: sender.document.identity_id,
    });

    const result = await runtime.openHybridPq({
      envelope,
      recipientSecrets: recipient.secrets,
      senderDocument: sender.document,
    });

    expect(result.payload.private_headers.subject).toBeNull();
    expect(result.payload.body.content).toBe("");
    expect(result.sigStatus).toBe("verified");
  }, 30_000);
});
