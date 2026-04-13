use aegis_proto::{EncryptedBlob, PrivatePayload, SuiteId};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    Key, XChaCha20Poly1305, XNonce,
};
use rand::RngCore;

use crate::{CryptoError, CryptoSuite};

pub struct DemoSuite {
    key: [u8; 32],
}

impl DemoSuite {
    pub fn from_passphrase(passphrase: &str) -> Self {
        let hash = blake3::hash(passphrase.as_bytes());
        let mut key = [0u8; 32];
        key.copy_from_slice(hash.as_bytes());
        Self { key }
    }
}

impl CryptoSuite for DemoSuite {
    fn suite_id(&self) -> SuiteId {
        SuiteId::DemoXChaCha20Poly1305
    }

    fn encrypt_payload(&self, payload: &PrivatePayload) -> Result<EncryptedBlob, CryptoError> {
        let serialized = serde_json::to_vec(payload)
            .map_err(|e| CryptoError::Serialization(e.to_string()))?;

        let cipher = XChaCha20Poly1305::new(Key::from_slice(&self.key));
        let mut nonce = [0u8; 24];
        rand::thread_rng().fill_bytes(&mut nonce);

        let ciphertext = cipher
            .encrypt(XNonce::from_slice(&nonce), serialized.as_ref())
            .map_err(|_| CryptoError::Encryption)?;

        Ok(EncryptedBlob {
            nonce_b64: STANDARD.encode(nonce),
            ciphertext_b64: STANDARD.encode(ciphertext),
        })
    }

    fn decrypt_payload(&self, blob: &EncryptedBlob) -> Result<PrivatePayload, CryptoError> {
        let nonce = STANDARD
            .decode(&blob.nonce_b64)
            .map_err(|_| CryptoError::InvalidKeyMaterial)?;
        let ciphertext = STANDARD
            .decode(&blob.ciphertext_b64)
            .map_err(|_| CryptoError::InvalidKeyMaterial)?;

        if nonce.len() != 24 {
            return Err(CryptoError::InvalidKeyMaterial);
        }

        let cipher = XChaCha20Poly1305::new(Key::from_slice(&self.key));
        let plaintext = cipher
            .decrypt(XNonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|_| CryptoError::Decryption)?;

        serde_json::from_slice(&plaintext)
            .map_err(|e| CryptoError::Serialization(e.to_string()))
    }
}
