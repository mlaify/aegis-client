import { useState } from "react";

import { isSessionLocked, lockSession, unlockSession } from "@/lib/storage";

export function VaultSessionPanel(props: {
  onStatus?: (message: string | null) => void;
  onLockedChange?: (locked: boolean) => void;
  unlockButtonClassName?: string;
}) {
  const [locked, setLocked] = useState(isSessionLocked());
  const [passphrase, setPassphrase] = useState("");

  const unlockClassName = props.unlockButtonClassName ?? "aegis-button-primary";

  const unlock = async () => {
    const ok = await unlockSession(passphrase);
    if (ok) {
      setLocked(false);
      setPassphrase("");
      props.onStatus?.("vault unlocked");
      props.onLockedChange?.(false);
    } else {
      props.onStatus?.("unlock failed: incorrect passphrase or missing local identity vault");
    }
  };

  const lock = () => {
    lockSession();
    setLocked(true);
    props.onStatus?.("vault locked");
    props.onLockedChange?.(true);
  };

  return (
    <div className="aegis-surface space-y-3 p-4">
      <p className="aegis-mono">vault: {locked ? "locked" : "unlocked"}</p>
      {locked ? (
        <div className="flex flex-wrap gap-3">
          <input
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            type="password"
            placeholder="enter passphrase to unlock"
            className="aegis-input"
          />
          <button type="button" className={unlockClassName} onClick={unlock}>
            Unlock
          </button>
        </div>
      ) : (
        <button type="button" className="aegis-button-secondary" onClick={lock}>
          Lock
        </button>
      )}
    </div>
  );
}
