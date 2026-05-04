import { afterEach, describe, expect, it, vi } from "vitest";

import { getBridge, isDesktop, notify, setBadge } from "@/lib/platform";

afterEach(() => {
  delete (window as { aegis?: unknown }).aegis;
  vi.restoreAllMocks();
});

function installBridge(overrides: Partial<NonNullable<Window["aegis"]>> = {}) {
  const fns = {
    notify: vi.fn().mockResolvedValue(undefined),
    setBadge: vi.fn().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue(null),
    saveFile: vi.fn().mockResolvedValue(null),
    vault: {
      isAvailable: vi.fn().mockResolvedValue(true),
      encrypt: vi.fn().mockResolvedValue("ct"),
      decrypt: vi.fn().mockResolvedValue("pt"),
    },
    updates: {
      check: vi.fn(),
      install: vi.fn(),
      onStatus: vi.fn(),
    },
  };
  (window as { aegis?: unknown }).aegis = {
    platform: {
      isElectron: true,
      os: "darwin",
      arch: "arm64",
      versions: { electron: "33", chrome: "129", node: "20" },
    },
    ...fns,
    ...overrides,
  };
  return fns;
}

describe("platform", () => {
  it("returns null bridge in a plain browser context", () => {
    expect(getBridge()).toBeNull();
    expect(isDesktop()).toBe(false);
  });

  it("returns a typed bridge when window.aegis is present", () => {
    installBridge();
    const bridge = getBridge();
    expect(bridge).not.toBeNull();
    expect(isDesktop()).toBe(true);
  });

  it("notify forwards to the desktop bridge when present", async () => {
    const fns = installBridge();
    await notify("hello", "body");
    expect(fns.notify).toHaveBeenCalledWith({ title: "hello", body: "body" });
  });

  it("setBadge forwards to the desktop bridge when present", async () => {
    const fns = installBridge();
    await setBadge(7);
    expect(fns.setBadge).toHaveBeenCalledWith(7);
  });

  it("notify is a no-op when there is no bridge and Notifications are unavailable", async () => {
    // jsdom does provide a Notification stub, so simulate "no permission"
    if (typeof Notification !== "undefined") {
      vi.stubGlobal("Notification", {
        ...Notification,
        permission: "denied",
      });
    }
    await expect(notify("x")).resolves.toBeUndefined();
  });

  it("setBadge is a no-op without a bridge", async () => {
    await expect(setBadge(3)).resolves.toBeUndefined();
  });

  it("vault round-trips through the bridge", async () => {
    const fns = installBridge();
    const bridge = getBridge();
    await bridge!.vault.encrypt("secret");
    await bridge!.vault.decrypt("ct");
    expect(fns.vault.encrypt).toHaveBeenCalledWith("secret");
    expect(fns.vault.decrypt).toHaveBeenCalledWith("ct");
  });
});
