# aegis-mobile

Mobile clients (iOS + Android, eventually a shared React Native app)
backed by the Rust `aegis-crypto` core via a UniFFI bridge — so the
post-quantum primitives that ship in the relay, gateway, CLI, and Rust
SDK are the *same code* that runs on phones. There's no
re-implementation of ML-KEM-768 / ML-DSA-65 / hybrid signing in
TypeScript or Swift; the bridge is the only boundary.

## Layout

```
apps/mobile/
├── README.md          ← you are here
├── rust/
│   └── aegis-mobile-ffi/      Rust crate exposed via UniFFI
│       ├── Cargo.toml
│       ├── src/lib.rs         JSON-string bridge wrapping aegis-crypto + aegis-identity
│       └── tests/roundtrip.rs end-to-end seal/open through the FFI surface
├── ios/               (planned — Swift package consuming generated bindings)
├── android/           (planned — Kotlin module consuming generated bindings)
└── app/               (planned — React Native app, Phase 4b)
```

The Rust crate is a member of the Cargo workspace at the
[aegis-client repo root](../../Cargo.toml). Its path-dependencies on
`aegis-core/crates/{aegis-proto, aegis-crypto, aegis-identity}` assume
`mlaify/aegis-core` is cloned next to `mlaify/aegis-client` under a
shared workspace root (see [aegis-client/AGENTS.md](../../AGENTS.md)).
CI mirrors that layout via `git clone` of `mlaify/aegis-core` in the
[Rust workflow](../../.github/workflows/rust-ci.yml).

## FFI surface (Phase 4a — shipped 2026-05-04)

Inputs and outputs are JSON strings whose shapes match the existing
`aegis-proto` / `aegis-identity` wire types. The React Native app can
reuse the `@aegis/sdk` TypeScript types directly via `JSON.parse`.

| Function                  | Purpose |
|---------------------------|---------|
| `generate_identity`       | Fresh hybrid PQ keypair → unsigned `IdentityDocument` + private key material |
| `sign_identity_document`  | Attach Ed25519 + ML-DSA-65 signature to a document |
| `generate_prekey_bundle`  | `count` fresh ML-KEM-768 one-time prekeys |
| `sign_prekey_bundle`      | Attach hybrid signature to a prekey bundle |
| `seal_hybrid_pq`          | Seal `PrivatePayload` to a recipient (optionally with a one-time prekey) |
| `open_hybrid_pq`          | Decrypt + classify outer signatures (`Verified` / `Failed` / `Unsigned` / `Unavailable`) |
| `version`                 | Crate version, useful for the platform side to confirm the bridge is wired up |

Errors collapse to a single `FfiError` enum with `InvalidInput`,
`InvalidKeyMaterial`, `Encryption`, `Decryption`,
`SignatureVerificationFailed`, `Serialization`, `Identity`, and
`Internal` variants — one Swift/Kotlin type to catch.

### Why JSON strings instead of typed records

The React Native app already has a typed view of every wire type via
`@aegis/sdk`. JSON-as-bridge means RN doesn't redefine those shapes.
For pure-Swift / pure-Kotlin consumers we'll layer typed wrappers on
top in a follow-up — doing so here would duplicate the wire types for
no benefit on the React Native path that's the main consumer.

## Local development

```bash
# From repo root (assumes mlaify/aegis-core is cloned as a sibling).
cargo test -p aegis-mobile-ffi
```

The integration test in `tests/roundtrip.rs` exercises the surface the
way a React Native client would: only JSON strings cross the FFI
boundary; the test never reaches into `aegis-crypto` /
`aegis-identity` directly.

## Generating Swift / Kotlin bindings

UniFFI's bindgen isn't run in CI yet — generation, framework packaging,
and platform-specific build glue land in subsequent iterations
alongside the Swift package and Kotlin module. The plan, for reference:

```bash
# Swift (iOS xcframework)
cargo build -p aegis-mobile-ffi --release --target aarch64-apple-ios
cargo build -p aegis-mobile-ffi --release --target aarch64-apple-ios-sim
cargo build -p aegis-mobile-ffi --release --target x86_64-apple-ios

cargo run -p uniffi-bindgen -- generate \
    --library target/release/libaegis_mobile_ffi.dylib \
    --language swift \
    --out-dir ios/Sources/AegisMobileFFI

# Kotlin (Android JNI library)
cargo build -p aegis-mobile-ffi --release --target aarch64-linux-android
cargo build -p aegis-mobile-ffi --release --target armv7-linux-androideabi
cargo build -p aegis-mobile-ffi --release --target x86_64-linux-android

cargo run -p uniffi-bindgen -- generate \
    --library target/release/libaegis_mobile_ffi.so \
    --language kotlin \
    --out-dir android/src/main/java
```

## Phase 4b — React Native app

`apps/mobile/app/` will host the React Native client once Phase 4b
starts. It implements the same `CryptoRuntime` interface that
[`@aegis/sdk`](../../../aegis-sdk/typescript) defines, with the
implementation delegating to the UniFFI bridge here. The screens
(Inbox, Compose, Identity, Setup) reuse ~80% of the apps/web component
code via shared logic modules.
