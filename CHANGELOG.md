# Changelog

All notable changes to this repository are documented here.

## [Unreleased]

### v0.3.0-alpha — web client scaffold

- New `apps/web/` Vite + React 18 + TypeScript + Tailwind project. Replaces the 6-byte stub README.
- App shell wired up: `react-router-dom` routes for `/inbox`, `/compose`, `/identity`, `/setup`; `Layout` with nav header and footer; `index.css` with Tailwind base + Aegis design tokens (cyan accent, slate base, dark-mode aware).
- Library module signatures defined as `src/lib/{storage,relay,crypto}.ts`:
  - `storage.ts` — IndexedDB-backed key persistence + `localStorage` for UI prefs (impl ships next iteration).
  - `relay.ts` — HTTP client for RFC-0004 endpoints. `resolveIdentity`, `resolveAlias`, `fetchEnvelopes` wired now; `publishIdentity`, `publishPrekeys`, `claimOneTimePrekey`, `pushEnvelope` stubbed pending crypto runtime.
  - `crypto.ts` — `CryptoRuntime` interface declared; pure-JS implementation backed by `@noble/post-quantum`, `@noble/curves`, `@noble/ciphers`, `@noble/hashes` ships next iteration.
- Page stubs: `Inbox` (fetch + list envelopes; decrypt pending), `Compose` (form for seal & send), `Identity` (local identity summary), `Setup` (relay URL + identity create).
- `@aegis/sdk` aliased via Vite's `resolve.alias` to the sibling `aegis-sdk` repo's TS source — no `npm link` required during development.
- Build green: `npm run build` produces ~220 KB gzipped JS + 16 KB CSS. `npm run dev` serves on `http://localhost:5173`.

## Pre-history

- Repo created 2026-04-21 with `apps/{web,desktop,mobile}` stub directories. No commits between then and v0.3 phase 3 work landing in sibling repos.
