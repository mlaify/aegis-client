import { useEffect, useState } from "react";
import type { Envelope } from "@aegis/sdk";

import { fetchEnvelopes } from "@/lib/relay";
import { loadIdentity, loadRelayUrl } from "@/lib/storage";

export function Inbox() {
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [relayUrl, setRelayUrl] = useState<string | null>(null);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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
