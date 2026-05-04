// UniFFI bridge from aegis-crypto / aegis-identity to Swift (iOS) and
// Kotlin (Android), so the React Native client (Phase 4b) and any other
// native consumer doesn't re-implement post-quantum crypto.
//
// Surface mirrors the TypeScript `CryptoRuntime` interface in
// aegis-client/apps/web/src/lib/crypto.ts. Inputs/outputs are JSON strings
// matching the existing aegis-proto / aegis-identity wire shapes — that
// way the React Native side can reuse the `@aegis/sdk` TypeScript types
// directly via JSON.parse without redefining records on the platform side.
//
// Pure-Swift / pure-Kotlin consumers can layer typed wrappers over this
// in a follow-up; doing so here would just duplicate the wire types.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};

use aegis_crypto::{
    keygen::HybridPqKeyBundle, EnvelopeSigner, EnvelopeVerifier, HybridPqSuite, PayloadCipher,
};
use aegis_identity::{
    generate_prekey_bundle as identity_generate_prekey_bundle,
    sign_identity_document as identity_sign_document, sign_prekey_bundle as identity_sign_prekey,
    HybridPqPrivateKeyMaterial, ALG_ED25519, ALG_MLDSA65, ALG_MLKEM768, ALG_X25519,
    SUITE_HYBRID_PQ,
};
use aegis_proto::{
    Envelope, IdentityDocument, IdentityId, PrekeyBundle, PrivatePayload, PublicKeyRecord,
};

uniffi::setup_scaffolding!();

// ---------------------------------------------------------------------------
// Error type — single union over the underlying core errors so the platform
// side has one Swift/Kotlin type to catch.
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum FfiError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("invalid key material")]
    InvalidKeyMaterial,
    #[error("encryption failed")]
    Encryption,
    #[error("decryption failed")]
    Decryption,
    #[error("signature verification failed")]
    SignatureVerificationFailed,
    #[error("serialization: {0}")]
    Serialization(String),
    #[error("identity error: {0}")]
    Identity(String),
    #[error("internal error: {0}")]
    Internal(String),
}

impl From<aegis_crypto::CryptoError> for FfiError {
    fn from(value: aegis_crypto::CryptoError) -> Self {
        use aegis_crypto::CryptoError;
        match value {
            CryptoError::Serialization(s) => FfiError::Serialization(s),
            CryptoError::Encryption => FfiError::Encryption,
            CryptoError::Decryption => FfiError::Decryption,
            CryptoError::InvalidKeyMaterial => FfiError::InvalidKeyMaterial,
            CryptoError::SigningFailed => FfiError::Internal("signing failed".into()),
            CryptoError::SignatureVerificationFailed => FfiError::SignatureVerificationFailed,
            CryptoError::KeyAgreementUnsupported => {
                FfiError::Internal("key agreement unsupported by suite".into())
            }
        }
    }
}

impl From<aegis_identity::IdentityError> for FfiError {
    fn from(value: aegis_identity::IdentityError) -> Self {
        FfiError::Identity(format!("{value}"))
    }
}

impl From<serde_json::Error> for FfiError {
    fn from(value: serde_json::Error) -> Self {
        FfiError::Serialization(value.to_string())
    }
}

impl From<base64::DecodeError> for FfiError {
    fn from(_: base64::DecodeError) -> Self {
        FfiError::InvalidKeyMaterial
    }
}

// ---------------------------------------------------------------------------
// Records exposed across the FFI boundary.
// ---------------------------------------------------------------------------

#[derive(uniffi::Record, Debug, Clone)]
pub struct IdentityBundle {
    /// JSON-serialized `aegis_proto::IdentityDocument`. Unsigned; call
    /// `sign_identity_document` to attach a hybrid signature before
    /// publishing.
    pub document_json: String,
    /// JSON-serialized `aegis_identity::HybridPqPrivateKeyMaterial`.
    /// Persist this locally; never transmit it.
    pub secrets_json: String,
}

#[derive(uniffi::Record, Debug, Clone)]
pub struct PrekeyBundleResult {
    /// JSON-serialized `aegis_proto::PrekeyBundle` (public halves).
    /// Unsigned; call `sign_prekey_bundle` before publishing.
    pub bundle_json: String,
    /// JSON-serialized `aegis_identity::PrekeyBundlePrivateMaterial`.
    /// Each one-time prekey secret must be deleted immediately after the
    /// recipient uses it to open a single inbound envelope.
    pub private_json: String,
}

#[derive(uniffi::Record, Debug, Clone)]
pub struct PrekeyHint {
    pub key_id: String,
    pub kyber768_public_key_b64: String,
}

#[derive(uniffi::Enum, Debug, Clone, PartialEq, Eq)]
pub enum SigStatus {
    /// Both Ed25519 and ML-DSA-65 outer signatures verified against the
    /// resolved sender identity document.
    Verified,
    /// At least one outer signature failed verification, or the sender
    /// claimed an identity but the bytes don't match.
    Failed,
    /// The envelope carried no outer signature.
    Unsigned,
    /// The sender's identity document wasn't supplied, so signatures
    /// could not be checked.
    Unavailable,
}

#[derive(uniffi::Record, Debug, Clone)]
pub struct OpenResult {
    /// JSON-serialized `aegis_proto::PrivatePayload`.
    pub payload_json: String,
    pub sig_status: SigStatus,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Returns the `aegis-mobile-ffi` crate version. Useful for the platform
/// side to confirm the bridge is wired up.
#[uniffi::export]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Generate a fresh hybrid PQ identity. The returned document is unsigned.
/// Call `sign_identity_document` before publishing it to a relay.
#[uniffi::export]
pub fn generate_identity(identity_id: String) -> Result<IdentityBundle, FfiError> {
    if identity_id.is_empty() {
        return Err(FfiError::InvalidInput("identity_id is empty".into()));
    }
    let bundle = HybridPqKeyBundle::generate();
    let doc = IdentityDocument {
        version: 1,
        identity_id: IdentityId(identity_id.clone()),
        aliases: vec![],
        signing_keys: vec![
            PublicKeyRecord {
                key_id: "sig-ed25519-1".into(),
                algorithm: ALG_ED25519.into(),
                public_key_b64: B64.encode(bundle.ed25519_verifying_key_bytes),
            },
            PublicKeyRecord {
                key_id: "sig-mldsa65-1".into(),
                algorithm: ALG_MLDSA65.into(),
                public_key_b64: B64.encode(&bundle.dilithium3_public_key_bytes),
            },
        ],
        encryption_keys: vec![
            PublicKeyRecord {
                key_id: "enc-x25519-1".into(),
                algorithm: ALG_X25519.into(),
                public_key_b64: B64.encode(bundle.x25519_public_key_bytes),
            },
            PublicKeyRecord {
                key_id: "enc-mlkem768-1".into(),
                algorithm: ALG_MLKEM768.into(),
                public_key_b64: B64.encode(&bundle.kyber768_public_key_bytes),
            },
        ],
        supported_suites: vec![SUITE_HYBRID_PQ.into()],
        relay_endpoints: vec![],
        signature: None,
    };

    let secrets = HybridPqPrivateKeyMaterial {
        identity_id: identity_id.clone(),
        algorithm: HybridPqPrivateKeyMaterial::algorithm_marker().to_string(),
        x25519_private_key_b64: B64.encode(bundle.x25519_private_key_bytes),
        kyber768_secret_key_b64: B64.encode(&bundle.kyber768_secret_key_bytes),
        ed25519_signing_seed_b64: B64.encode(bundle.ed25519_signing_seed_bytes),
        dilithium3_secret_key_b64: B64.encode(&bundle.dilithium3_secret_key_bytes),
    };

    Ok(IdentityBundle {
        document_json: serde_json::to_string(&doc)?,
        secrets_json: serde_json::to_string(&secrets)?,
    })
}

/// Attach a hybrid Ed25519 + ML-DSA-65 signature to the supplied identity
/// document. Returns the document JSON with `signature` populated.
#[uniffi::export]
pub fn sign_identity_document(
    document_json: String,
    secrets_json: String,
) -> Result<String, FfiError> {
    let mut doc: IdentityDocument = serde_json::from_str(&document_json)?;
    let secrets: HybridPqPrivateKeyMaterial = serde_json::from_str(&secrets_json)?;
    let (ed25519_seed, dilithium3_sk) = decode_signing_keys(&secrets)?;
    identity_sign_document(&mut doc, &ed25519_seed, &dilithium3_sk)?;
    Ok(serde_json::to_string(&doc)?)
}

/// Generate `count` fresh ML-KEM-768 one-time prekeys for `identity_id`.
/// The returned bundle is unsigned — call `sign_prekey_bundle` before
/// publishing it to a relay.
#[uniffi::export]
pub fn generate_prekey_bundle(
    identity_id: String,
    count: u32,
    key_id_prefix: String,
) -> Result<PrekeyBundleResult, FfiError> {
    if identity_id.is_empty() {
        return Err(FfiError::InvalidInput("identity_id is empty".into()));
    }
    let id = IdentityId(identity_id);
    let (bundle, private) =
        identity_generate_prekey_bundle(&id, count as usize, &key_id_prefix);
    Ok(PrekeyBundleResult {
        bundle_json: serde_json::to_string(&bundle)?,
        private_json: serde_json::to_string(&private)?,
    })
}

/// Attach a hybrid signature to the supplied prekey bundle, mirroring
/// `sign_identity_document` for one-time prekey publishing.
#[uniffi::export]
pub fn sign_prekey_bundle(
    bundle_json: String,
    secrets_json: String,
) -> Result<String, FfiError> {
    let mut bundle: PrekeyBundle = serde_json::from_str(&bundle_json)?;
    let secrets: HybridPqPrivateKeyMaterial = serde_json::from_str(&secrets_json)?;
    let (ed25519_seed, dilithium3_sk) = decode_signing_keys(&secrets)?;
    identity_sign_prekey(&mut bundle, &ed25519_seed, &dilithium3_sk)?;
    Ok(serde_json::to_string(&bundle)?)
}

/// Seal a payload to a recipient's identity document. If `prekey` is
/// supplied, that one-time ML-KEM-768 public key is used in the hybrid
/// combine instead of the recipient's long-term Kyber key, and its
/// `key_id` is stamped into the envelope before signing.
#[uniffi::export]
pub fn seal_hybrid_pq(
    recipient_doc_json: String,
    payload_json: String,
    sender_secrets_json: String,
    sender_hint: String,
    prekey: Option<PrekeyHint>,
) -> Result<String, FfiError> {
    let recipient: IdentityDocument = serde_json::from_str(&recipient_doc_json)?;
    let payload: PrivatePayload = serde_json::from_str(&payload_json)?;
    let sender_secrets: HybridPqPrivateKeyMaterial = serde_json::from_str(&sender_secrets_json)?;
    if sender_hint.is_empty() {
        return Err(FfiError::InvalidInput("sender_hint is empty".into()));
    }

    let recipient_x25519_pk = recipient
        .encryption_keys
        .iter()
        .find(|k| k.algorithm == ALG_X25519)
        .ok_or_else(|| FfiError::InvalidInput("recipient missing X25519 key".into()))?;
    let recipient_x25519_pk: [u8; 32] = decode_b64_fixed(&recipient_x25519_pk.public_key_b64)?;

    let (recipient_kyber_pk, used_prekey_ids) = match prekey {
        Some(p) => (B64.decode(p.kyber768_public_key_b64)?, vec![p.key_id]),
        None => {
            let kyber = recipient
                .encryption_keys
                .iter()
                .find(|k| k.algorithm == ALG_MLKEM768)
                .ok_or_else(|| FfiError::InvalidInput("recipient missing ML-KEM-768 key".into()))?;
            (B64.decode(&kyber.public_key_b64)?, vec![])
        }
    };

    let (ed25519_seed, dilithium3_sk) = decode_signing_keys(&sender_secrets)?;

    let suite = HybridPqSuite::for_sender_with_recipient_keys(
        ed25519_seed,
        dilithium3_sk,
        recipient_x25519_pk,
        recipient_kyber_pk,
    );

    let encrypted = suite.encrypt_payload(&payload)?;
    let mut envelope = Envelope::new(
        recipient.identity_id.clone(),
        Some(IdentityId(sender_hint)),
        suite.suite_id(),
        encrypted,
    );
    envelope.used_prekey_ids = used_prekey_ids;

    // Sign AFTER stamping used_prekey_ids so the signature covers them.
    let classical_sig = suite.sign_envelope(&envelope)?;
    let pq_sig = suite.sign_envelope_pq(&envelope)?;
    envelope.outer_signature_b64 = Some(classical_sig);
    envelope.outer_pq_signature_b64 = Some(pq_sig);

    Ok(serde_json::to_string(&envelope)?)
}

/// Open an envelope. Returns the decrypted payload and a separate
/// signature-verification status — callers should check `sig_status`
/// before trusting the payload's purported sender.
///
/// `prekey_kyber768_secret_b64`, when supplied, replaces the recipient's
/// long-term Kyber secret with the matching one-time prekey's secret
/// (consumed by RFC-0003 §12 forward secrecy). `sender_doc_json`, when
/// supplied, enables outer-signature verification; without it the
/// returned `sig_status` is `Unavailable`.
#[uniffi::export]
pub fn open_hybrid_pq(
    envelope_json: String,
    recipient_secrets_json: String,
    prekey_kyber768_secret_b64: Option<String>,
    sender_doc_json: Option<String>,
) -> Result<OpenResult, FfiError> {
    let envelope: Envelope = serde_json::from_str(&envelope_json)?;
    let secrets: HybridPqPrivateKeyMaterial = serde_json::from_str(&recipient_secrets_json)?;

    let x25519_sk: [u8; 32] = decode_b64_fixed(&secrets.x25519_private_key_b64)?;
    let kyber_sk = match prekey_kyber768_secret_b64 {
        Some(b64) => B64.decode(b64)?,
        None => B64.decode(&secrets.kyber768_secret_key_b64)?,
    };

    // Resolve sender keys for outer-signature verification, if a sender
    // document was supplied. Either signing key being missing flips
    // sig_status to Unavailable rather than failing the open.
    let (sender_ed_vk, sender_dil_vk) = match sender_doc_json.as_deref() {
        Some(json) => {
            let doc: IdentityDocument = serde_json::from_str(json)?;
            let ed = doc
                .signing_keys
                .iter()
                .find(|k| k.algorithm == ALG_ED25519)
                .map(|k| decode_b64_fixed::<32>(&k.public_key_b64))
                .transpose()?;
            let dil = doc
                .signing_keys
                .iter()
                .find(|k| k.algorithm == ALG_MLDSA65)
                .map(|k| B64.decode(&k.public_key_b64))
                .transpose()?;
            (ed, dil)
        }
        None => (None, None),
    };

    let suite = HybridPqSuite::for_recipient(x25519_sk, kyber_sk, sender_ed_vk, sender_dil_vk);

    let payload = suite.decrypt_payload(&envelope.payload)?;
    let sig_status = classify_signatures(&suite, &envelope, sender_doc_json.is_some());

    Ok(OpenResult {
        payload_json: serde_json::to_string(&payload)?,
        sig_status,
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn decode_b64_fixed<const N: usize>(input: &str) -> Result<[u8; N], FfiError> {
    let bytes = B64.decode(input)?;
    bytes
        .as_slice()
        .try_into()
        .map_err(|_| FfiError::InvalidKeyMaterial)
}

fn decode_signing_keys(
    secrets: &HybridPqPrivateKeyMaterial,
) -> Result<([u8; 32], Vec<u8>), FfiError> {
    let ed25519_seed: [u8; 32] = decode_b64_fixed(&secrets.ed25519_signing_seed_b64)?;
    let dilithium3_sk = B64.decode(&secrets.dilithium3_secret_key_b64)?;
    Ok((ed25519_seed, dilithium3_sk))
}

fn classify_signatures(
    suite: &HybridPqSuite,
    envelope: &Envelope,
    sender_doc_supplied: bool,
) -> SigStatus {
    if !sender_doc_supplied {
        return SigStatus::Unavailable;
    }
    match (
        envelope.outer_signature_b64.as_deref(),
        envelope.outer_pq_signature_b64.as_deref(),
    ) {
        (None, None) => SigStatus::Unsigned,
        (Some(ed), Some(pq)) => {
            let ed_ok = suite.verify_envelope(envelope, ed).is_ok();
            let pq_ok = suite.verify_envelope_pq(envelope, pq).is_ok();
            if ed_ok && pq_ok {
                SigStatus::Verified
            } else {
                SigStatus::Failed
            }
        }
        // Only one of the two signatures present — treat as failure under
        // the hybrid suite, which requires both halves.
        _ => SigStatus::Failed,
    }
}
