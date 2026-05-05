# aegis-client (archived)

> **⚠️ This repository is archived as of 2026-05-05.** It exists for
> historical reference only — no further development happens here.
> Use the per-platform client repos below instead.

The original monorepo-of-clients structure was split into focused
per-platform repos to give each surface its own toolchain, CI lane,
and release cadence:

| What you used to find here | New home |
|----------------------------|----------|
| `apps/web/` (Vite + React browser client) | [`mlaify/aegis-web`](https://github.com/mlaify/aegis-web) |
| `apps/desktop/` (Electron shell — **dropped**) | superseded by `mlaify/aegis-apple`; Windows / Linux users use `mlaify/aegis-web` |
| `apps/mobile/rust/aegis-mobile-ffi/` (UniFFI Rust bridge) | [`mlaify/aegis-ffi`](https://github.com/mlaify/aegis-ffi) |
| `apps/mobile/` (planned native iOS, planned RN — **never shipped**) | [`mlaify/aegis-apple`](https://github.com/mlaify/aegis-apple) (macOS + iOS + iPadOS) and [`mlaify/aegis-android`](https://github.com/mlaify/aegis-android) (Kotlin / Compose) |

History is preserved here for the carve-out commits (PRs #14, #15, #16
landed in this repo before the split). The new repos were carved with
`git filter-repo` so the original commit history follows each
surface's code into its new home.

The Electron desktop shell was dropped on 2026-05-05 — see
[`mlaify/aegis-apple`'s README](https://github.com/mlaify/aegis-apple#why-native-instead-of-an-electron-shell)
for the rationale (native Mail.app feel, real Keychain access, etc.).
Windows and Linux users continue to be served by `mlaify/aegis-web` in
any browser.

If you have a clone of this repo: pull the new repos and the redirects
from `mlaify/aegis-client` should already be in place via GitHub's
auto-redirect, but go ahead and update your remotes to point at the
right new repo for what you actually work on.
