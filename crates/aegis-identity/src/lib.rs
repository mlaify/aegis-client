use aegis_proto::{IdentityDocument, IdentityId};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum IdentityError {
    #[error("identity document missing signing keys")]
    MissingSigningKeys,

    #[error("identity document missing encryption keys")]
    MissingEncryptionKeys,

    #[error("identity id mismatch")]
    IdentityMismatch,
}

pub fn validate_identity_document(doc: &IdentityDocument) -> Result<(), IdentityError> {
    if doc.signing_keys.is_empty() {
        return Err(IdentityError::MissingSigningKeys);
    }

    if doc.encryption_keys.is_empty() {
        return Err(IdentityError::MissingEncryptionKeys);
    }

    Ok(())
}

pub fn parse_identity_id(raw: &str) -> IdentityId {
    IdentityId(raw.to_string())
}
