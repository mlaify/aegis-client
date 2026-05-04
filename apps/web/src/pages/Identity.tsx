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
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const copyIdentityId = async () => {
    await navigator.clipboard.writeText(identity.identity_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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

  const exportIdentity = async () => {
    setStatus(null);
    try {
      const secrets = await loadSecrets();
      const blob = JSON.stringify(
        { version: "aegis-web-export-v1", document: identity.document, secrets },
        null,
        2,
      );
      setExportJson(blob);
    } catch (error) {
      setStatus(String(error));
    }
  };

  const downloadExport = () => {
    if (!exportJson) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([exportJson], { type: "application/json" }));
    a.download = `aegis-identity-${identity.identity_id.slice(-12)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyExport = async () => {
    if (!exportJson) return;
    await navigator.clipboard.writeText(exportJson);
    setStatus("copied export JSON to clipboard");
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
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
          <span className="aegis-mono shrink-0">identity_id</span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-sm break-all">{identity.identity_id}</span>
            <button
              onClick={copyIdentityId}
              className="aegis-button-secondary shrink-0 px-2 py-0.5 text-xs"
              title="Copy to clipboard"
            >
              {copied ? "copied" : "copy"}
            </button>
          </div>
        </div>
        <Row label="aliases" value={identity.aliases.join(", ") || "<none>"} />
        <Row
          label="supported_suites"
          value={identity.supported_suites.join(", ") || "<none>"}
        />
        <Row
          label="relay_endpoints"
          value={identity.document?.relay_endpoints.join(", ") || "<none>"}
        />
        <Row
          label="signing_keys"
          value={identity.document?.signing_keys.map((k) => k.key_id).join(", ") || "<none>"}
        />
        <Row
          label="encryption_keys"
          value={identity.document?.encryption_keys.map((k) => k.key_id).join(", ") || "<none>"}
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
        <button
          className="aegis-button-secondary"
          disabled={locked}
          onClick={exportIdentity}
        >
          Export
        </button>
      </div>

      {status && <p className="aegis-mono" role="status">{status}</p>}

      {exportJson && (
        <div className="aegis-surface space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Identity export</p>
            <div className="flex gap-2">
              <button className="aegis-button-secondary text-xs px-2 py-0.5" onClick={copyExport}>
                Copy
              </button>
              <button className="aegis-button-secondary text-xs px-2 py-0.5" onClick={downloadExport}>
                Download
              </button>
              <button
                className="aegis-button-secondary text-xs px-2 py-0.5"
                onClick={() => setExportJson(null)}
              >
                Hide
              </button>
            </div>
          </div>
          <p className="text-xs text-aegis-warn">
            Keep this file secret — it contains your private key material.
          </p>
          <pre className="max-h-64 overflow-y-auto rounded-md bg-slate-100 p-3 text-xs dark:bg-slate-800">
            {exportJson}
          </pre>
        </div>
      )}
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
