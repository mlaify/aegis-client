import type {
  ClaimedPrekeyResponse,
  Envelope,
  HybridPqPrivateKeyMaterial,
  IdentityDocument,
  StoreEnvelopeResponse,
} from "@aegis/sdk";
import { ALG_ED25519, ALG_MLDSA65, ALG_MLKEM768, ALG_X25519, SUITE_HYBRID_PQ } from "@aegis/sdk";
import type { OpenResult } from "@/lib/crypto";

export { SUITE_HYBRID_PQ };

export const TEST_IDENTITY_ID = "amp:did:key:zTest1234";
export const TEST_RELAY_URL = "http://127.0.0.1:8787";

export const TEST_IDENTITY_DOC: IdentityDocument = {
  version: 1,
  identity_id: TEST_IDENTITY_ID,
  aliases: ["testuser@local"],
  supported_suites: [SUITE_HYBRID_PQ],
  signing_keys: [
    { key_id: "sig-ed25519-1", algorithm: ALG_ED25519, public_key_b64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    { key_id: "sig-mldsa65-1", algorithm: ALG_MLDSA65, public_key_b64: "AAAA" },
  ],
  encryption_keys: [
    { key_id: "enc-x25519-1", algorithm: ALG_X25519, public_key_b64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    { key_id: "enc-mlkem768-1", algorithm: ALG_MLKEM768, public_key_b64: "AAAA" },
  ],
  relay_endpoints: [TEST_RELAY_URL],
  signature: null,
};

export const TEST_SECRETS: HybridPqPrivateKeyMaterial = {
  identity_id: TEST_IDENTITY_ID,
  algorithm: "AMP-HYBRID-PQ-PRIVATE-V1",
  x25519_private_key_b64: "AAAA",
  kyber768_secret_key_b64: "AAAA",
  ed25519_signing_seed_b64: "AAAA",
  dilithium3_secret_key_b64: "AAAA",
};

export const TEST_ENVELOPE: Envelope = {
  version: 1,
  envelope_id: "env-abc-123",
  suite_id: "HybridX25519MlKem768Ed25519MlDsa65",
  recipient_id: TEST_IDENTITY_ID,
  sender_hint: TEST_IDENTITY_ID,
  created_at: "2026-05-04T00:00:00Z",
  expires_at: null,
  content_type: "message/private",
  used_prekey_ids: ["prekey-1"],
  payload: {
    nonce_b64: "AAAA",
    ciphertext_b64: "AAAA",
    eph_x25519_public_key_b64: "AAAA",
    mlkem_ciphertext_b64: "AAAA",
  },
  outer_signature_b64: null,
};

export const TEST_PREKEY_RESPONSE: ClaimedPrekeyResponse = {
  identity_id: TEST_IDENTITY_ID,
  key_id: "prekey-1",
  algorithm: ALG_MLKEM768,
  public_key_b64: "AAAA",
};

export const TEST_STORE_RESPONSE: StoreEnvelopeResponse = {
  accepted: true,
  relay_id: "relay-envelope-1",
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
