# aegis-core

`aegis-core` is the shared Rust foundation for the Aegis ecosystem.

This repo contains protocol primitives, crypto abstractions, identity helpers, API types, and test tooling.

## Design goals

- keep security-critical logic centralized
- keep service code out of the core
- make cryptographic suites pluggable
- model the protocol in small, composable crates
- make it easy for `aegit-cli`, `aegis-relay`, `aegis-gateway`, and `aegis-client` to depend on the same types

## Workspace crates

- `aegis-proto`: core protocol data structures
- `aegis-crypto`: crypto traits and demo suite
- `aegis-identity`: identity document helpers
- `aegis-api-types`: HTTP-facing request/response types shared across services
- `aegis-testkit`: fixtures and round-trip helpers for tests

## Current scope

This is a prototype-grade workspace. It is intentionally using a demo symmetric suite right now so the object model and workflow can solidify before full hybrid/PQ integration lands.
