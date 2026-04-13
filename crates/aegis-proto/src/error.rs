use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProtoError {
    #[error("serialization error: {0}")]
    Serialization(String),

    #[error("invalid data: {0}")]
    InvalidData(String),
}
