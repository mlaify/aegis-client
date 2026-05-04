import { useEffect, useState } from "react";
import type { Envelope, PrivatePayload } from "@aegis/sdk";

import { VaultSessionPanel } from "@/components/VaultSessionPanel";
import { cryptoRuntime } from "@/lib/crypto";
import { fetchEnvelopes, resolveIdentity } from "@/lib/relay";
import {
  consumePrekeySecret,
  isSessionLocked,
  loadIdentity,
  loadPrekeySecrets,
  loadRelayUrl,
  loadSecrets,
} from "@/lib/storage";

export function Inbox() {
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [relayUrl, setRelayUrl] = useState<string | null>(null);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, PrivatePayload>>({});
  const [openStatus, setOpenStatus] = useState<Record<string, string>>({});
  const [locked, setLocked] = useState(isSessionLocked());

  useEffect(() => {
    loadIdentity().then((i) => setIdentityId(i?.identity_id ?? null));
    loadRelayUrl().then((u) => setRelayUrl(u));
  }, []);

  const refresh = async () => {
    if (!identityId || !relayUrl) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchEnvelopes(relayUrl, identityId);
      setEnvelopes(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!identityId || !relayUrl) {
    return (
      <EmptyState
        title="Inbox unavailable"
        body="Configure a relay URL and create or import an identity in Setup before fetching messages."
        action={{ to: "/setup", label: "Open Setup" }}
      />
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Inbox</h2>
          <p className="aegis-mono mt-1">
            recipient {truncate(identityId, 24)} · relay {hostFor(relayUrl)}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="aegis-button-primary"
        >
          {loading ? "Fetching…" : "Fetch"}
        </button>
      </header>

      {error && (
        <div className="aegis-surface border-aegis-danger/30 bg-aegis-danger/10 p-4 text-sm text-aegis-danger">
          {error}
        </div>
      )}
      <VaultSessionPanel
        onLockedChange={setLocked}
        onStatus={(message) => {
          if (message?.startsWith("unlock failed")) {
            setError(message);
          } else if (message === "vault unlocked") {
            setError(null);
          }
        }}
        unlockButtonClassName="aegis-button-secondary"
      />

      {envelopes.length === 0 ? (
        <div className="aegis-surface p-8 text-center text-sm text-slate-500">
          No envelopes fetched yet. Click <strong>Fetch</strong> above to query
          the relay.
        </div>
      ) : (
        <ul className="space-y-3">
          {envelopes.map((env) => (
            <li key={env.envelope_id} className="aegis-surface p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">
                    from{" "}
                    <span className="aegis-mono">
                      {env.sender_hint ?? "<anonymous>"}
                    </span>
                  </p>
                  <p className="aegis-mono mt-1">
                    {env.envelope_id} · {env.created_at}
                  </p>
                </div>
                <span className="aegis-mono">{env.suite_id}</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  className="aegis-button-secondary"
                  onClick={() => openEnvelope(env)}
                >
                  Open
                </button>
                {openStatus[env.envelope_id] && (
                  <span className="aegis-mono">{openStatus[env.envelope_id]}</span>
                )}
              </div>
              {opened[env.envelope_id] && (
                <div className="mt-3 rounded-md bg-slate-100 p-3 dark:bg-slate-800">
                  <p className="text-sm font-medium">
                    subject:{" "}
                    {opened[env.envelope_id].private_headers.subject ?? "<none>"}
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap text-sm">
                    {opened[env.envelope_id].body.content}
                  </pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  async function openEnvelope(env: Envelope) {
    if (locked) {
      setOpenStatus((prev) => ({ ...prev, [env.envelope_id]: "open failed: vault is locked" }));
      return;
    }
    try {
      const recipientSecrets = await loadSecrets();
      const prekeys = await loadPrekeySecrets();
      const prekeyId = env.used_prekey_ids[0];
      const matchingPrekey = prekeyId
        ? prekeys.find((p) => p.key_id === prekeyId)
        : undefined;

      let senderDocument = undefined;
      if (relayUrl && env.sender_hint?.startsWith("amp:")) {
        try {
          senderDocument = await resolveIdentity(relayUrl, env.sender_hint);
        } catch {
          senderDocument = undefined;
        }
      }

      const payload = await cryptoRuntime().openHybridPq({
        envelope: env,
        recipientSecrets,
        prekeyKyber768SecretB64: matchingPrekey?.kyber768_secret_key_b64,
        senderDocument,
      });

      if (matchingPrekey) {
        await consumePrekeySecret(matchingPrekey.key_id);
      }

      setOpened((prev) => ({ ...prev, [env.envelope_id]: payload }));
      setOpenStatus((prev) => ({ ...prev, [env.envelope_id]: "opened" }));
    } catch (e) {
      setOpenStatus((prev) => ({ ...prev, [env.envelope_id]: `open failed: ${String(e)}` }));
    }
  }
}

function EmptyState(props: {
  title: string;
  body: string;
  action: { to: string; label: string };
}) {
  return (
    <section className="aegis-surface mx-auto max-w-xl p-8 text-center">
      <h2 className="text-lg font-semibold">{props.title}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {props.body}
      </p>
      <a className="aegis-button-primary mt-6" href={props.action.to}>
        {props.action.label}
      </a>
    </section>
  );
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}…`;
}

function hostFor(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
