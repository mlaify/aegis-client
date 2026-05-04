# aegis-web

Browser-based client for Aegis. Compose, send, fetch, and decrypt
post-quantum-encrypted messages without leaving the page.

> **v0.3-alpha scaffold.** This iteration ships the project layout,
> routing, page shells, and library-module signatures. The crypto runtime
> (`@noble`-based hybrid PQ implementation) and the live relay flows
> (publish identity, publish prekeys, claim prekey, seal, push, fetch,
> open, consume secret) land in subsequent iterations.

## Stack

- **Build / dev:** Vite 5 + TypeScript 5
- **UI:** React 18 + Tailwind CSS 3
- **Routing:** react-router-dom 6 (browser router)
- **Crypto runtime (planned):** pure-JS via [`@noble/post-quantum`][noble-pq]
  for ML-KEM-768 / ML-DSA-65, [`@noble/curves`][noble-curves] for
  X25519 / Ed25519, [`@noble/ciphers`][noble-ciphers] for
  XChaCha20-Poly1305, [`@noble/hashes`][noble-hashes] for HKDF-SHA256.
  Pure-JS for v0; a WASM-compiled `aegis-core` is the v1 production path.
- **Local persistence:** IndexedDB for identity + prekey secrets
  (encrypted at rest with a passphrase-derived AEAD key);
  `localStorage` for non-sensitive UI prefs.
- **Desktop integration (Electron):** when running inside the
  [`apps/desktop/`](../desktop/) shell, the renderer detects
  `window.aegis` and opts into native affordances — OS notifications
  on inbound envelopes, dock/taskbar badge for unread count, and an
  optional "Remember on this device" path that wraps the vault
  passphrase in the OS keychain (Electron `safeStorage`). All of these
  fall back to no-ops in a plain browser, so the same code paths run
  in both surfaces.

[noble-pq]: https://github.com/paulmillr/noble-post-quantum
[noble-curves]: https://github.com/paulmillr/noble-curves
[noble-ciphers]: https://github.com/paulmillr/noble-ciphers
[noble-hashes]: https://github.com/paulmillr/noble-hashes

## Layout

```
apps/web/
├── index.html             # Vite entry
├── package.json
├── vite.config.ts         # aliases @aegis/sdk -> ../../../aegis-sdk/typescript/src
├── tsconfig.json
├── postcss.config.js
├── tailwind.config.js
└── src/
    ├── main.tsx           # ReactDOM root
    ├── router.tsx         # react-router-dom routes
    ├── index.css          # Tailwind + Aegis design tokens
    ├── components/
    │   └── Layout.tsx     # header + nav + footer chrome
    ├── pages/
    │   ├── Inbox.tsx      # fetch + list envelopes (open ships next iter)
    │   ├── Compose.tsx    # form for seal & send (wires up next iter)
    │   ├── Identity.tsx   # local identity summary + publish actions
    │   └── Setup.tsx      # configure relay URL + create identity
    └── lib/
        ├── storage.ts     # IndexedDB / localStorage wrapper (stubs)
        ├── relay.ts       # HTTP client for RFC-0004 endpoints
        ├── crypto.ts      # CryptoRuntime interface (impl ships next iter)
        ├── platform.ts    # window.aegis detection + web-fallback notify/setBadge
        ├── inboxBadge.ts  # seen-envelope set for de-duping notifications
        └── desktopVault.ts # opt-in: passphrase memoized via OS keychain
```

## Develop

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # type-check + production build to dist/
npm run preview # serve dist/ for production smoke-test
```

## Sibling repo dependency

The web app imports types directly from the sibling
[`mlaify/aegis-sdk`](https://github.com/mlaify/aegis-sdk) repo, which
must be cloned at `../../../aegis-sdk/` relative to this directory (i.e.,
sitting next to `mlaify/aegis-client/` inside the same workspace root).
The Vite alias resolves `@aegis/sdk` to that file at compile time; no
`npm link` needed.

## What ships next

Next iteration on this app:

1. Crypto runtime (`src/lib/crypto.ts`) backed by the `@noble/*` libs above.
2. IndexedDB + AEAD-wrapped key persistence (`src/lib/storage.ts`).
3. Identity create / publish / publish-prekeys flows.
4. Compose: claim prekey → encrypt → sign → push.
5. Inbox: fetch → decrypt → consume secret → render.
6. Wire-compat smoke tests against `aegit-cli` (encrypt with TS, decrypt
   with Rust; encrypt with Rust, decrypt with TS).
