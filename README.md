# aegis-client

End-user client applications for Aegis.

## Surfaces

| Surface | Path | Status |
|---------|------|--------|
| Web | [`apps/web/`](apps/web/) | v0.3-alpha — UI scaffold; crypto runtime + live relay flows in progress |
| Desktop | [`apps/desktop/`](apps/desktop/) | v0.3-alpha — Electron shell wrapping `apps/web` (notifications, dock badge, tray, OS keychain via `safeStorage`, native file pickers, `electron-updater`) |
| Mobile | [`apps/mobile/`](apps/mobile/) | planned (iOS first — SwiftUI + UniFFI bindings to `aegis-core`) |
