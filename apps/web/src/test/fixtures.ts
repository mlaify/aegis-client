import type { Envelope, HybridPqPrivateKeyMaterial, IdentityDocument } from "@aegis/sdk";
import type { OpenResult } from "@/lib/crypto";

export const SUITE_HYBRID_PQ = "AMP-HYBRID-X25519-MLKEM768-ED25519-MLDSA65-V1";

export const TEST_IDENTITY_ID = "amp:did:key:zTest1234";
export const TEST_RELAY_URL = "http://127.0.0.1:8787";

export const TEST_IDENTITY_DOC: IdentityDocument = {
  version: "1",
  identity_id: TEST_IDENTITY_ID,
  aliases: ["testuser@local"],
  supported_suites: [SUITE_HYBRID_PQ],
  signing_keys: [
    { algorithm: "Ed25519", key_id: "sig-ed25519-1", public_key_b64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    { algorithm: "MlDsa65", key_id: "sig-mldsa65-1", public_key_b64: "AAAA" },
  ],
  encryption_keys: [
    { algorithm: "X25519", key_id: "enc-x25519-1", public_key_b64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    { algorithm: "MlKem768", key_id: "enc-mlkem768-1", public_key_b64: "AAAA" },
  ],
  relay_endpoints: [TEST_RELAY_URL],
  prekey_bundle_url: null,
  created_at: "2026-05-04T00:00:00Z",
  expires_at: null,
  identity_signature_b64: null,
};

export const TEST_SECRETS: HybridPqPrivateKeyMaterial = {
  ed25519_secret_key_b64: "AAAA",
  mldsa65_secret_key_b64: "AAAA",
  x25519_secret_key_b64: "AAAA",
  mlkem768_secret_key_b64: "AAAA",
};

export const TEST_ENVELOPE: Envelope = {
  envelope_id: "env-abc-123",
  suite_id: "HybridX25519MlKem768Ed25519MlDsa65",
  recipient_id: TEST_IDENTITY_ID,
  sender_hint: TEST_IDENTITY_ID,
  created_at: "2026-05-04T00:00:00Z",
  expires_at: null,
  used_prekey_ids: ["prekey-1"],
  kem_ciphertext_b64: "AAAA",
  encrypted_payload_b64: "AAAA",
  outer_signature_b64: null,
  outer_pq_signature_b64: undefined,
  nonce_b64: "AAAA",
  x25519_ephemeral_public_key_b64: "AAAA",
};

export const TEST_OPEN_RESULT: OpenResult = {
  payload: {
    private_headers: { subject: "Hello test", thread_id: null, in_reply_to: null },
    body: { mime: "text/plain", content: "This is a test message." },
    attachments: [],
    extensions: null,
  },
  sigStatus: "unsigned",
};
