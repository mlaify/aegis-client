//! End-to-end seal/open round-trip exercising the FFI surface the way a
//! React Native client (Phase 4b) would: only JSON strings cross the
//! boundary; the test never reaches into aegis-crypto / aegis-identity
//! directly.

use aegis_mobile_ffi::*;
use serde_json::Value;

fn alice_id() -> String {
    "amp:did:key:zAlice".into()
}

fn bob_id() -> String {
    "amp:did:key:zBob".into()
}

#[test]
fn version_is_non_empty() {
    assert!(!version().is_empty());
}

#[test]
fn generate_identity_rejects_empty_id() {
    let err = generate_identity(String::new()).unwrap_err();
    assert!(matches!(err, FfiError::InvalidInput(_)));
}

#[test]
fn generate_identity_emits_required_keys_and_suites() {
    let bundle = generate_identity(alice_id()).unwrap();
    let doc: Value = serde_json::from_str(&bundle.document_json).unwrap();
    assert_eq!(doc["identity_id"], alice_id());
    assert_eq!(doc["signature"], Value::Null);
    let suites: Vec<String> = serde_json::from_value(doc["supported_suites"].clone()).unwrap();
    assert!(suites.iter().any(|s| s.contains("HYBRID-X25519-MLKEM768")));

    let signing_algs: Vec<String> = doc["signing_keys"]
        .as_array()
        .unwrap()
        .iter()
        .map(|k| k["algorithm"].as_str().unwrap().to_string())
        .collect();
    assert!(signing_algs.contains(&"AMP-ED25519-V1".to_string()));
    assert!(signing_algs.contains(&"AMP-MLDSA65-V1".to_string()));

    let enc_algs: Vec<String> = doc["encryption_keys"]
        .as_array()
        .unwrap()
        .iter()
        .map(|k| k["algorithm"].as_str().unwrap().to_string())
        .collect();
    assert!(enc_algs.contains(&"AMP-X25519-V1".to_string()));
    assert!(enc_algs.contains(&"AMP-MLKEM768-V1".to_string()));
}

#[test]
fn sign_identity_document_attaches_hybrid_signature() {
    let bundle = generate_identity(alice_id()).unwrap();
    let signed = sign_identity_document(bundle.document_json.clone(), bundle.secrets_json).unwrap();
    let doc: Value = serde_json::from_str(&signed).unwrap();
    let sig = doc["signature"].as_str().expect("signature populated");
    assert!(sig.starts_with("ed25519:"));
    assert!(sig.contains("|dilithium3:"));
}

#[test]
fn full_seal_open_round_trip_with_prekey() {
    // Alice (sender) and Bob (recipient).
    let alice = generate_identity(alice_id()).unwrap();
    let bob = generate_identity(bob_id()).unwrap();

    // Sign both docs.
    let alice_doc_signed =
        sign_identity_document(alice.document_json.clone(), alice.secrets_json.clone()).unwrap();
    let bob_doc_signed =
        sign_identity_document(bob.document_json.clone(), bob.secrets_json.clone()).unwrap();

    // Bob generates + signs a prekey bundle and pulls one prekey.
    let prekeys = generate_prekey_bundle(bob_id(), 3, "ot".into()).unwrap();
    let _bundle_signed =
        sign_prekey_bundle(prekeys.bundle_json.clone(), bob.secrets_json.clone()).unwrap();
    let bundle: Value = serde_json::from_str(&prekeys.bundle_json).unwrap();
    let private: Value = serde_json::from_str(&prekeys.private_json).unwrap();
    let pub_prekey = bundle["one_time_prekeys"][0].clone();
    let secret_prekey = private["one_time_prekey_secrets"][0].clone();
    assert_eq!(pub_prekey["key_id"], secret_prekey["key_id"]);
    let prekey_hint = PrekeyHint {
        key_id: pub_prekey["key_id"].as_str().unwrap().to_string(),
        kyber768_public_key_b64: pub_prekey["public_key_b64"].as_str().unwrap().to_string(),
    };
    let prekey_secret_b64 = secret_prekey["kyber768_secret_key_b64"]
        .as_str()
        .unwrap()
        .to_string();

    // Payload — minimal, matches PrivatePayload shape.
    let payload_json = serde_json::json!({
        "private_headers": {
            "subject": "Hello from FFI roundtrip",
            "thread_id": null,
            "in_reply_to": null
        },
        "body": { "mime": "text/plain", "content": "ml-kem-768 + xchacha20poly1305 round-trip ok" },
        "attachments": [],
        "extensions": null
    })
    .to_string();

    // Alice seals to Bob using Bob's one-time prekey.
    let envelope_json = seal_hybrid_pq(
        bob_doc_signed.clone(),
        payload_json.clone(),
        alice.secrets_json.clone(),
        alice_id(),
        Some(prekey_hint.clone()),
    )
    .unwrap();

    let envelope: Value = serde_json::from_str(&envelope_json).unwrap();
    assert_eq!(envelope["recipient_id"], bob_id());
    assert_eq!(envelope["sender_hint"], alice_id());
    assert_eq!(envelope["used_prekey_ids"][0], prekey_hint.key_id);
    assert!(envelope["outer_signature_b64"].is_string());
    assert!(envelope["outer_pq_signature_b64"].is_string());

    // Bob opens with the matching prekey secret and Alice's signed doc.
    let opened = open_hybrid_pq(
        envelope_json.clone(),
        bob.secrets_json,
        Some(prekey_secret_b64.clone()),
        Some(alice_doc_signed.clone()),
    )
    .unwrap();

    assert_eq!(opened.sig_status, SigStatus::Verified);
    let payload: Value = serde_json::from_str(&opened.payload_json).unwrap();
    assert_eq!(
        payload["body"]["content"],
        "ml-kem-768 + xchacha20poly1305 round-trip ok"
    );
    assert_eq!(
        payload["private_headers"]["subject"],
        "Hello from FFI roundtrip"
    );
}

#[test]
fn open_without_sender_doc_returns_unavailable_sig_status() {
    let alice = generate_identity(alice_id()).unwrap();
    let bob = generate_identity(bob_id()).unwrap();
    let bob_signed =
        sign_identity_document(bob.document_json.clone(), bob.secrets_json.clone()).unwrap();

    let payload = r#"{"private_headers":{"subject":null,"thread_id":null,"in_reply_to":null},"body":{"mime":"text/plain","content":"x"},"attachments":[],"extensions":null}"#;

    let envelope_json = seal_hybrid_pq(
        bob_signed,
        payload.into(),
        alice.secrets_json.clone(),
        alice_id(),
        None,
    )
    .unwrap();

    let opened = open_hybrid_pq(envelope_json, bob.secrets_json, None, None).unwrap();
    assert_eq!(opened.sig_status, SigStatus::Unavailable);
}

#[test]
fn open_with_wrong_recipient_secrets_fails_decryption() {
    let alice = generate_identity(alice_id()).unwrap();
    let bob = generate_identity(bob_id()).unwrap();
    let charlie = generate_identity("amp:did:key:zCharlie".into()).unwrap();
    let bob_signed =
        sign_identity_document(bob.document_json.clone(), bob.secrets_json.clone()).unwrap();

    let payload = r#"{"private_headers":{"subject":null,"thread_id":null,"in_reply_to":null},"body":{"mime":"text/plain","content":"y"},"attachments":[],"extensions":null}"#;

    let envelope_json = seal_hybrid_pq(
        bob_signed,
        payload.into(),
        alice.secrets_json.clone(),
        alice_id(),
        None,
    )
    .unwrap();

    let err = open_hybrid_pq(envelope_json, charlie.secrets_json, None, None).unwrap_err();
    assert!(matches!(err, FfiError::Decryption));
}
