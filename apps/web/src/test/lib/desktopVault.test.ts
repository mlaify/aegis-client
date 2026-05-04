import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forget,
  hasRemembered,
  isAvailable,
  recall,
  remember,
} from "@/lib/desktopVault";

const STORAGE_KEY = "aegis.desktop.passphrase_v1";

afterEach(() => {
  delete (window as { aegis?: unknown }).aegis;
  localStorage.clear();
  vi.restoreAllMocks();
});

function installBridge(
  vaultOverrides: Partial<NonNullable<Window["aegis"]>["vault"]> = {},
) {
  const vault = {
    isAvailable: vi.fn().mockResolvedValue(true),
    encrypt: vi.fn().mockImplementation(async (s: string) => `ct:${s}`),
    decrypt: vi.fn().mockImplementation(async (c: string) => c.replace(/^ct:/, "")),
    ...vaultOverrides,
  };
  (window as { aegis?: unknown }).aegis = {
    platform: {
      isElectron: true,
      os: "darwin",
      arch: "arm64",
      versions: { electron: "33", chrome: "129", node: "20" },
    },
    notify: vi.fn(),
    setBadge: vi.fn(),
    openFile: vi.fn(),
    saveFile: vi.fn(),
    vault,
    updates: { check: vi.fn(), install: vi.fn(), onStatus: vi.fn() },
  };
  return vault;
}

describe("desktopVault", () => {
  it("isAvailable false in browser", async () => {
    expect(await isAvailable()).toBe(false);
  });

  it("isAvailable mirrors bridge.vault.isAvailable", async () => {
    installBridge({ isAvailable: vi.fn().mockResolvedValue(true) });
    expect(await isAvailable()).toBe(true);
  });

  it("isAvailable false when bridge.vault.isAvailable returns false", async () => {
    installBridge({ isAvailable: vi.fn().mockResolvedValue(false) });
    expect(await isAvailable()).toBe(false);
  });

  it("isAvailable false when bridge throws", async () => {
    installBridge({
      isAvailable: vi.fn().mockRejectedValue(new Error("nope")),
    });
    expect(await isAvailable()).toBe(false);
  });

  it("remember stores encrypted ciphertext in localStorage", async () => {
    const vault = installBridge();
    await remember("hunter2");
    expect(vault.encrypt).toHaveBeenCalledWith("hunter2");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("ct:hunter2");
    expect(hasRemembered()).toBe(true);
  });

  it("remember throws without a bridge", async () => {
    await expect(remember("x")).rejects.toThrow(/desktop bridge unavailable/);
  });

  it("recall returns null when nothing is remembered", async () => {
    installBridge();
    expect(await recall()).toBeNull();
  });

  it("recall returns the original passphrase via bridge.vault.decrypt", async () => {
    const vault = installBridge();
    localStorage.setItem(STORAGE_KEY, "ct:hunter2");
    expect(await recall()).toBe("hunter2");
    expect(vault.decrypt).toHaveBeenCalledWith("ct:hunter2");
  });

  it("recall drops the stored ciphertext when decrypt fails", async () => {
    installBridge({ decrypt: vi.fn().mockRejectedValue(new Error("kex")) });
    localStorage.setItem(STORAGE_KEY, "stale");
    expect(await recall()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("forget clears the stored ciphertext", () => {
    localStorage.setItem(STORAGE_KEY, "ct:x");
    forget();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(hasRemembered()).toBe(false);
  });
});
