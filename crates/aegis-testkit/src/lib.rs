use aegis_crypto::{CryptoSuite, DemoSuite};
use aegis_proto::{Envelope, IdentityId, MessageBody, PrivateHeaders, PrivatePayload};

pub fn demo_round_trip(body: &str, passphrase: &str) -> (Envelope, PrivatePayload) {
    let suite = DemoSuite::from_passphrase(passphrase);

    let payload = PrivatePayload {
        private_headers: PrivateHeaders {
            subject: Some("test".to_string()),
            thread_id: Some("thr-demo".to_string()),
            in_reply_to: None,
        },
        body: MessageBody {
            mime: "text/plain".to_string(),
            content: body.to_string(),
        },
        attachments: vec![],
        extensions: serde_json::json!({}),
    };

    let encrypted = suite.encrypt_payload(&payload).expect("encrypt demo payload");
    let envelope = Envelope::new(
        IdentityId("amp:did:key:zRecipient".to_string()),
        Some(IdentityId("amp:did:key:zSender".to_string())),
        suite.suite_id(),
        encrypted,
    );

    let opened = suite.decrypt_payload(&envelope.payload).expect("decrypt demo payload");
    (envelope, opened)
}
