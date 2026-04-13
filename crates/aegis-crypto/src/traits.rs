use thiserror::Error;

use aegis_proto::{EncryptedBlob, PrivatePayload, SuiteId};

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("serialization error: {0}")]
    Serialization(String),

    #[error("encryption failed")]
    Encryption,

    #[error("decryption failed")]
    Decryption,

    #[error("invalid key material")]
    InvalidKeyMaterial,
}

pub trait CryptoSuite {
    fn suite_id(&self) -> SuiteId;
    fn encrypt_payload(&self, payload: &PrivatePayload) -> Result<EncryptedBlob, CryptoError>;
    fn decrypt_payload(&self, blob: &EncryptedBlob) -> Result<PrivatePayload, CryptoError>;
}
