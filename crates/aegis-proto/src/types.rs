use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct IdentityId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct EnvelopeId(pub Uuid);

impl EnvelopeId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicKeyRecord {
    pub key_id: String,
    pub algorithm: String,
    pub public_key_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityDocument {
    pub version: u8,
    pub identity_id: IdentityId,
    pub aliases: Vec<String>,
    pub signing_keys: Vec<PublicKeyRecord>,
    pub encryption_keys: Vec<PublicKeyRecord>,
    pub supported_suites: Vec<String>,
    pub relay_endpoints: Vec<String>,
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrekeyBundle {
    pub identity_id: IdentityId,
    pub signed_prekeys: Vec<PublicKeyRecord>,
    pub one_time_prekeys: Vec<PublicKeyRecord>,
    pub supported_suites: Vec<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub signature: Option<String>,
}
