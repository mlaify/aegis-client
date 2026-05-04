import { useEffect, useState } from "react";

import {
  forget as forgetRemembered,
  hasRemembered,
  isAvailable as desktopVaultAvailable,
  recall,
  remember,
} from "@/lib/desktopVault";
import { isSessionLocked, lockSession, unlockSession } from "@/lib/storage";

export function VaultSessionPanel(props: {
  onStatus?: (message: string | null) => void;
  onLockedChange?: (locked: boolean) => void;
  unlockButtonClassName?: string;
}) {
  const [locked, setLocked] = useState(isSessionLocked());
  const [passphrase, setPassphrase] = useState("");
  const [rememberOnDevice, setRememberOnDevice] = useState(false);
  const [vaultSupported, setVaultSupported] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [autoUnlocking, setAutoUnlocking] = useState(false);

  const unlockClassName = props.unlockButtonClassName ?? "aegis-button-primary";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = await desktopVaultAvailable();
      if (cancelled) return;
      setVaultSupported(supported);
      const has = hasRemembered();
      setRemembered(has);
      // Auto-unlock if a remembered passphrase is available and the vault is
      // currently locked. Failure here is non-fatal — the user can still
      // type the passphrase manually.
      if (supported && has && isSessionLocked()) {
        setAutoUnlocking(true);
        try {
          const stored = await recall();
          if (cancelled) return;
          if (stored) {
            const ok = await unlockSession(stored);
            if (cancelled) return;
            if (ok) {
              setLocked(false);
              props.onStatus?.("vault unlocked (remembered)");
              props.onLockedChange?.(false);
            } else {
              forgetRemembered();
              setRemembered(false);
              props.onStatus?.("remembered passphrase no longer matches; forgot it");
            }
          }
        } catch (e) {
          props.onStatus?.(`auto-unlock failed: ${String(e)}`);
        } finally {
          if (!cancelled) setAutoUnlocking(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally do not depend on props callbacks — they're stable
    // enough for this one-shot effect and we don't want to re-run on parent
    // re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlock = async () => {
    const ok = await unlockSession(passphrase);
    if (!ok) {
      props.onStatus?.(
        "unlock failed: incorrect passphrase or missing local identity vault",
      );
      return;
    }
    if (rememberOnDevice && vaultSupported) {
      try {
        await remember(passphrase);
        setRemembered(true);
      } catch (e) {
        props.onStatus?.(`unlocked, but failed to remember on device: ${String(e)}`);
        setLocked(false);
        setPassphrase("");
        props.onLockedChange?.(false);
        return;
      }
    }
    setLocked(false);
    setPassphrase("");
    props.onStatus?.("vault unlocked");
    props.onLockedChange?.(false);
  };

  const lock = () => {
    lockSession();
    setLocked(true);
    props.onStatus?.("vault locked");
    props.onLockedChange?.(true);
  };

  const forget = () => {
    forgetRemembered();
    setRemembered(false);
    props.onStatus?.("forgot remembered passphrase on this device");
  };

  return (
    <div className="aegis-surface space-y-3 p-4">
      <p className="aegis-mono">
        vault: {locked ? (autoUnlocking ? "unlocking…" : "locked") : "unlocked"}
      </p>
      {locked ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <input
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              type="password"
              placeholder="enter passphrase to unlock"
              className="aegis-input"
              disabled={autoUnlocking}
            />
            <button
              type="button"
              className={unlockClassName}
              onClick={unlock}
              disabled={autoUnlocking}
            >
              Unlock
            </button>
          </div>
          {vaultSupported && (
            <label className="aegis-mono flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={rememberOnDevice}
                onChange={(e) => setRememberOnDevice(e.target.checked)}
                disabled={autoUnlocking}
              />
              Remember on this device (uses OS keychain)
            </label>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="aegis-button-secondary" onClick={lock}>
            Lock
          </button>
          {vaultSupported && remembered && (
            <button
              type="button"
              className="aegis-button-secondary"
              onClick={forget}
            >
              Forget on this device
            </button>
          )}
        </div>
      )}
    </div>
  );
}
