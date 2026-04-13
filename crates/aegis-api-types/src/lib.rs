use aegis_proto::Envelope;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreEnvelopeRequest {
    pub envelope: Envelope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreEnvelopeResponse {
    pub accepted: bool,
    pub relay_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchEnvelopeResponse {
    pub envelopes: Vec<Envelope>,
}
