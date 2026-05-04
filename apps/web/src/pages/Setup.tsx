import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { cryptoRuntime } from "@/lib/crypto";
import { createIdentity, loadIdentity, loadRelayUrl, saveRelayUrl } from "@/lib/storage";

export function Setup() {
  const navigate = useNavigate();
  const [relayUrl, setRelayUrl] = useState("");
  const [savedRelayUrl, setSavedRelayUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [existingIdentityId, setExistingIdentityId] = useState<string | null>(null);
  const [alias, setAlias] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadRelayUrl().then((u) => {
      setSavedRelayUrl(u);
      if (u) setRelayUrl(u);
    });
    loadIdentity().then((i) => setExistingIdentityId(i?.identity_id ?? null));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let normalized = relayUrl.trim();
    if (!normalized) return;
    try {
      // Validate the URL parses; reject unsupported schemes early.
      const parsed = new URL(normalized);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setStatus("relay URL must use http:// or https://");
        return;
      }
      normalized = parsed.toString().replace(/\/$/, "");
    } catch {
      setStatus("relay URL is not a valid URL");
      return;
    }
    await saveRelayUrl(normalized);
    setSavedRelayUrl(normalized);
    setStatus(`saved ${normalized}`);
  };

  const create = async () => {
    setStatus(null);
    if (existingIdentityId) {
      setStatus(`identity already exists: ${existingIdentityId}`);
      return;
    }
    if (!passphrase || passphrase !== confirmPassphrase) {
      setStatus("passphrase is empty or does not match confirmation");
      return;
    }
    setCreating(true);
    try {
      const identityId = `amp:did:key:${crypto.randomUUID()}`;
      const runtime = cryptoRuntime();
      const { document, secrets } = await runtime.generateIdentity(identityId);
      if (alias.trim()) {
        document.aliases = [alias.trim()];
      }
      if (savedRelayUrl) {
        document.relay_endpoints = [savedRelayUrl];
      }
      await runtime.signIdentityDocument(document, secrets);
      await createIdentity(document, secrets, passphrase);
      setExistingIdentityId(identityId);
      setPassphrase("");
      setConfirmPassphrase("");
      setStatus(`created local identity ${identityId}`);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Setup</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Configure the relay you'll publish to and fetch from, then create or
          import a local hybrid PQ identity.
        </p>
      </header>

      <div className="aegis-surface space-y-4 p-6">
        <h3 className="text-base font-semibold">1. Relay URL</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          The base URL of the relay (e.g.{" "}
          <code className="font-mono">http://127.0.0.1:8787</code>). Persisted
          locally; never sent anywhere except as outgoing API calls.
        </p>
        <form onSubmit={submit} className="flex gap-3">
          <input
            value={relayUrl}
            onChange={(e) => setRelayUrl(e.target.value)}
            placeholder="http://127.0.0.1:8787"
            className="aegis-input"
          />
          <button type="submit" className="aegis-button-primary">
            Save
          </button>
        </form>
        {status && (
          <p className="aegis-mono" role="status">
            {status}
          </p>
        )}
        {savedRelayUrl && (
          <p className="text-sm text-aegis-ok">
            current: <code className="font-mono">{savedRelayUrl}</code>
          </p>
        )}
      </div>

      <div className="aegis-surface space-y-4 p-6">
        <h3 className="text-base font-semibold">2. Identity</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Generate a fresh hybrid PQ identity (X25519 + ML-KEM-768 +
          Ed25519 + Dilithium3) entirely in this browser. Private halves live
          in IndexedDB encrypted with a passphrase you choose; public halves
          go into the IdentityDocument that gets published to your relay.
        </p>
        {existingIdentityId ? (
          <div className="space-y-3">
            <p className="text-sm text-aegis-ok">
              existing local identity:{" "}
              <code className="font-mono">{existingIdentityId}</code>
            </p>
            <button
              onClick={() => navigate("/identity")}
              className="aegis-button-primary"
            >
              Open Identity
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="optional alias (e.g. matt@mesh)"
              className="aegis-input"
            />
            <input
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              type="password"
              placeholder="passphrase"
              className="aegis-input"
            />
            <input
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              type="password"
              placeholder="confirm passphrase"
              className="aegis-input"
            />
            <button
              onClick={create}
              className="aegis-button-primary"
              disabled={creating}
            >
              {creating ? "Creating…" : "Create new identity"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
