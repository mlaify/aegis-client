use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{EnvelopeId, IdentityId, ProtoError, SuiteId};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedBlob {
    pub nonce_b64: String,
    pub ciphertext_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope {
    pub version: u8,
    pub envelope_id: EnvelopeId,
    pub recipient_id: IdentityId,
    pub sender_hint: Option<IdentityId>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub content_type: String,
    pub suite_id: SuiteId,
    pub used_prekey_ids: Vec<String>,
    pub payload: EncryptedBlob,
    pub outer_signature_b64: Option<String>,
}

impl Envelope {
    pub fn new(
        recipient_id: IdentityId,
        sender_hint: Option<IdentityId>,
        suite_id: SuiteId,
        payload: EncryptedBlob,
    ) -> Self {
        Self {
            version: 1,
            envelope_id: EnvelopeId::new(),
            recipient_id,
            sender_hint,
            created_at: Utc::now(),
            expires_at: None,
            content_type: "message/private".to_string(),
            suite_id,
            used_prekey_ids: vec![],
            payload,
            outer_signature_b64: None,
        }
    }

    pub fn to_json_pretty(&self) -> Result<String, ProtoError> {
        serde_json::to_string_pretty(self)
            .map_err(|e| ProtoError::Serialization(e.to_string()))
    }

    pub fn from_json(data: &str) -> Result<Self, ProtoError> {
        serde_json::from_str(data)
            .map_err(|e| ProtoError::Serialization(e.to_string()))
    }
}
