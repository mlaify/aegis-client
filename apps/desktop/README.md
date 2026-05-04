# aegis-desktop

Electron shell that wraps the [`aegis-web`](../web) renderer with native
desktop affordances:

| Capability       | Mechanism (main process)                              | Renderer surface                  |
|------------------|-------------------------------------------------------|-----------------------------------|
| OS notifications | `Notification` (Electron)                             | `window.aegis.notify(...)`        |
| Dock badge       | `app.setBadgeCount`                                   | `window.aegis.setBadge(n)`        |
| System tray      | `Tray` + context menu                                 | (no renderer API — tray-driven)   |
| File pickers     | `dialog.showOpenDialog` / `showSaveDialog`            | `window.aegis.openFile / saveFile` |
| OS keychain      | `safeStorage` (Keychain / DPAPI / libsecret)          | `window.aegis.vault.{encrypt,decrypt,isAvailable}` |
| Auto-updates     | [`electron-updater`](https://www.electron.build/auto-update) | `window.aegis.updates.{check,install,onStatus}` |

> **v0.3-alpha scaffold.** Ships the Electron shell, IPC bridge, and
> packaging config. The renderer is the existing `apps/web` build and
> does not yet *use* the bridge — integration (badge for unread count,
> notifications on inbound envelopes, native attachment picker, vault-
> backed key storage) lands in subsequent iterations alongside the web
> client's crypto runtime.

## Layout

```
apps/desktop/
├── electron/
│   ├── main.ts          # BrowserWindow, tray, IPC handlers, auto-updater wiring
│   ├── preload.ts       # contextBridge — exposes window.aegis to the renderer
│   └── shared.ts        # types shared between main, preload, and renderer
├── src/
│   └── window.d.ts      # ambient `window.aegis` type for the web renderer
├── build/               # electron-builder buildResources (icons go here)
├── electron-builder.yml # macOS .dmg / Windows .exe / Linux .AppImage targets
├── package.json
└── tsconfig.json        # compiles electron/ → dist-electron/
```

## Renderer source

In **dev**, the main process loads `http://localhost:5173` (the
`aegis-web` Vite dev server). Run the web dev server in one terminal
and the desktop shell in another:

```bash
# terminal 1
npm --prefix ../web install
npm --prefix ../web run dev      # http://localhost:5173

# terminal 2
npm install
npm run dev                      # builds electron/, launches Electron
```

Override the renderer URL with `AEGIS_DESKTOP_RENDERER_URL=...` if you
serve the web app on a different port.

In **production**, `npm run build` builds the web app to
`apps/web/dist/`, copies it to `apps/desktop/dist-renderer/`, compiles
`electron/` to `dist-electron/`, and `npm run package` invokes
`electron-builder` to produce per-OS installers in `dist-installers/`.

## Security model

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` —
  the renderer has no direct access to Node or Electron internals; only
  the explicitly bridged surface in `electron/preload.ts`.
- `setWindowOpenHandler` and `will-navigate` route external links to
  the system browser instead of letting the renderer navigate away.
- The `vault.*` APIs delegate to Electron's `safeStorage`, which uses
  Keychain on macOS, DPAPI on Windows, and libsecret on Linux. Strings
  are encrypted in the main process and round-tripped to the renderer
  as base64 — the renderer never sees the OS key material.

## Auto-updates

`electron-updater` is installed and the IPC surface is wired
(`window.aegis.updates`), but no publish feed is configured yet — the
`publish:` block in `electron-builder.yml` is commented out and the
in-app status reports `disabled` until a channel is set up. Likely
configuration:

```yaml
publish:
  provider: github
  owner: mlaify
  repo: aegis-client
```

…with a corresponding GitHub Actions release workflow uploading the
artifacts in `dist-installers/`.

## What ships next

1. Wire `setBadge` to the renderer's unread-count selector once the
   inbox flow lands in `apps/web`.
2. Wire `notify` to inbound-envelope events.
3. Replace the empty tray icon with a real asset in `build/`.
4. Use `vault.encrypt` / `vault.decrypt` to wrap the IndexedDB
   AEAD-key passphrase on desktop, replacing the per-launch passphrase
   prompt the web client uses.
5. Hook the `openFile` API into `Compose.tsx` for native attachment
   selection.
6. Configure the `electron-updater` publish feed and ship the first
   signed/notarized release.
