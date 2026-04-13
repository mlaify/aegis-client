use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivateHeaders {
    pub subject: Option<String>,
    pub thread_id: Option<String>,
    pub in_reply_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageBody {
    pub mime: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentManifest {
    pub attachment_id: String,
    pub filename: String,
    pub mime: String,
    pub size: u64,
    pub blob_ref: String,
    pub content_key_wrap_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivatePayload {
    pub private_headers: PrivateHeaders,
    pub body: MessageBody,
    pub attachments: Vec<AttachmentManifest>,
    pub extensions: serde_json::Value,
}
