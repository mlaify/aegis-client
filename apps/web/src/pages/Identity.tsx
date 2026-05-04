import { useEffect, useState } from "react";

import { VaultSessionPanel } from "@/components/VaultSessionPanel";
import { cryptoRuntime } from "@/lib/crypto";
import { publishIdentity, publishPrekeys } from "@/lib/relay";
import {
  isSessionLocked,
  loadIdentity,
  loadRelayUrl,
  loadSecrets,
  savePrekeyBundle,
  type StoredIdentity,
} from "@/lib/storage";

export function Identity() {
  const [identity, setIdentity] = useState<StoredIdentity | null>(null);
  const [relayUrl, setRelayUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(isSessionLocked());

  useEffect(() => {
    loadIdentity().then((i) => {
      setIdentity(i);
      setLoading(false);
    });
    loadRelayUrl().then(setRelayUrl);
  }, []);

  if (loading) {
    return <div className="aegis-mono">loading identity…</div>;
  }

  if (!identity) {
    return (
      <section className="aegis-surface mx-auto max-w-xl p-8 text-center">
        <h2 className="text-lg font-semibold">No identity yet</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Generate a local hybrid PQ identity in Setup. Your private keys never
          leave this browser.
        </p>
        <a className="aegis-button-primary mt-6" href="/setup">
          Open Setup
        </a>
      </section>
    );
  }

  const publishIdentityDoc = async () => {
    if (!relayUrl || !identity.document) {
      setStatus("missing relay URL or identity document");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await publishIdentity(relayUrl, identity.document);
      setStatus(`published identity to ${relayUrl}`);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  };

  const publishPrekeyBatch = async () => {
    if (!relayUrl) {
      setStatus("missing relay URL");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const secrets = await loadSecrets();
      const runtime = cryptoRuntime();
      const { bundle, private: priv } = await runtime.generatePrekeyBundle(
        identity.identity_id,
        10,
        "otp-mlkem768",
      );
      await runtime.signPrekeyBundle(bundle, secrets);
      const published = await publishPrekeys(relayUrl, bundle);
      await savePrekeyBundle(priv);
      const refreshed = await loadIdentity();
      setIdentity(refreshed);
      setStatus(
        `published prekeys (inserted=${published.inserted}, skipped=${published.skipped})`,
      );
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Identity</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Your local identity document and key material. Private halves are
          stored in IndexedDB; only the public halves get published.
        </p>
      </header>

      <div className="aegis-surface space-y-4 p-6">
        <Row label="identity_id" value={identity.identity_id} mono />
        <Row label="aliases" value={identity.aliases.join(", ") || "<none>"} />
        <Row
          label="supported_suites"
          value={identity.supported_suites.join(", ") || "<none>"}
        />
        <Row
          label="prekey_pool"
          value={`${identity.prekey_secret_count} unclaimed local secrets`}
        />
      </div>
      <VaultSessionPanel onStatus={setStatus} onLockedChange={setLocked} />

      <div className="flex flex-wrap gap-3">
        <button
          className="aegis-button-primary"
          disabled={busy || !relayUrl || locked}
          onClick={publishIdentityDoc}
        >
          Publish identity
        </button>
        <button
          className="aegis-button-secondary"
          disabled={busy || !relayUrl || locked}
          onClick={publishPrekeyBatch}
        >
          Publish prekeys (10)
        </button>
        <button className="aegis-button-secondary" disabled>
          Export
        </button>
      </div>
      {status && <p className="aegis-mono">{status}</p>}
    </section>
  );
}

function Row(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 pb-3 last:border-0 last:pb-0 dark:border-slate-800">
      <span className="aegis-mono shrink-0">{props.label}</span>
      <span
        className={
          props.mono
            ? "font-mono text-sm break-all"
            : "text-sm text-slate-700 dark:text-slate-200"
        }
      >
        {props.value}
      </span>
    </div>
  );
}
