/// <reference path="../../../desktop/src/window.d.ts" />

// Platform abstraction for the Electron desktop bridge.
//
// In the browser, `window.aegis` is undefined and the desktop-specific
// helpers degrade to no-ops or to web-equivalent APIs. The renderer code
// should call `getBridge()` rather than touching `window.aegis` directly,
// so that the same code path runs in both surfaces.

export interface DesktopBridge {
  notify(title: string, body?: string): Promise<void>;
  setBadge(count: number): Promise<void>;
  vault: {
    isAvailable(): Promise<boolean>;
    encrypt(plaintext: string): Promise<string>;
    decrypt(ciphertextB64: string): Promise<string>;
  };
}

export function getBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const aegis = window.aegis;
  if (!aegis?.platform.isElectron) return null;

  return {
    notify: (title, body) => aegis.notify({ title, body }),
    setBadge: (count) => aegis.setBadge(count),
    vault: {
      isAvailable: () => aegis.vault.isAvailable(),
      encrypt: (plaintext) => aegis.vault.encrypt(plaintext),
      decrypt: (ciphertextB64) => aegis.vault.decrypt(ciphertextB64),
    },
  };
}

export function isDesktop(): boolean {
  return getBridge() !== null;
}

/** Best-effort OS notification. On desktop uses the Electron bridge; in the
 *  browser falls back to the Web Notifications API if permission is granted.
 *  Silently no-ops in unsupported environments. */
export async function notify(title: string, body?: string): Promise<void> {
  const bridge = getBridge();
  if (bridge) {
    await bridge.notify(title, body);
    return;
  }
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

/** Best-effort dock/taskbar badge. No-op in the browser. */
export async function setBadge(count: number): Promise<void> {
  const bridge = getBridge();
  if (bridge) await bridge.setBadge(count);
}
