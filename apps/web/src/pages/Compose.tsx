import { FormEvent, useEffect, useState } from "react";

import { VaultSessionPanel } from "@/components/VaultSessionPanel";
import { cryptoRuntime } from "@/lib/crypto";
import {
  claimOneTimePrekey,
  pushEnvelope,
  resolveAlias,
  resolveIdentity,
} from "@/lib/relay";
import { isSessionLocked, loadIdentity, loadRelayUrl, loadSecrets } from "@/lib/storage";

export function Compose() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [identityReady, setIdentityReady] = useState(false);
  const [relayUrl, setRelayUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [locked, setLocked] = useState(isSessionLocked());

  useEffect(() => {
    loadIdentity().then((i) => setIdentityReady(i !== null));
    loadRelayUrl().then(setRelayUrl);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus(null);
    if (locked) {
      setStatus("vault is locked; unlock it before sending");
      return;
    }
    if (!relayUrl) {
      setStatus("relay URL is not configured");
      return;
    }
    try {
      const sender = await loadIdentity();
      if (!sender?.document) {
        setStatus("identity missing; create one in Setup first");
        return;
      }
      const senderSecrets = await loadSecrets();
      const recipient = to.trim().startsWith("amp:")
        ? await resolveIdentity(relayUrl, to.trim())
        : await resolveAlias(relayUrl, to.trim());
      const claimed = await claimOneTimePrekey(relayUrl, recipient.identity_id);

      const payload = {
        private_headers: {
          subject: subject.trim() || null,
          thread_id: null,
          in_reply_to: null,
        },
        body: { mime: "text/plain", content: body },
        attachments: [],
        extensions: null,
      };

      const envelope = await cryptoRuntime().sealHybridPq({
        recipient,
        payload,
        senderSecrets,
        senderHint: sender.identity_id,
        prekey: {
          keyId: claimed.key_id,
          kyber768PublicKeyB64: claimed.public_key_b64,
        },
      });
      const response = await pushEnvelope(relayUrl, envelope);
      setStatus(`sent envelope ${response.relay_id}`);
      setBody("");
      setSubject("");
      setTo("");
    } catch (e) {
      setStatus(String(e));
    }
  };

  if (!identityReady || !relayUrl) {
    return (
      <section className="aegis-surface mx-auto max-w-xl p-8 text-center">
        <h2 className="text-lg font-semibold">Set up before composing</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          You need a local identity and a configured relay URL before you can
          send a message.
        </p>
        <a className="aegis-button-primary mt-6" href="/setup">
          Open Setup
        </a>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Compose</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Seal a hybrid post-quantum envelope and push it to the relay.
        </p>
      </header>

      <form onSubmit={submit} className="aegis-surface space-y-4 p-6">
        <VaultSessionPanel
          onStatus={setStatus}
          onLockedChange={setLocked}
          unlockButtonClassName="aegis-button-secondary"
        />
        <Field label="To" hint="amp:did:key:… or alias">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="amp:did:key:z6Mk…"
            className="aegis-input"
            required
          />
        </Field>
        <Field label="Subject" hint="encrypted in private payload">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="aegis-input"
          />
        </Field>
        <Field label="Body" hint="text/plain">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="aegis-input font-mono"
            required
          />
        </Field>

        <div className="flex items-center justify-between">
          <p className="aegis-mono">
            seal will claim one ML-KEM-768 prekey + sign Ed25519 + Dilithium3
          </p>
          <button type="submit" className="aegis-button-primary">
            Seal &amp; send
          </button>
        </div>

        {status && (
          <p className="text-sm text-aegis-warn" role="status">
            {status}
          </p>
        )}
      </form>
    </section>
  );
}

function Field(props: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{props.label}</span>
        {props.hint && <span className="aegis-mono">{props.hint}</span>}
      </span>
      {props.children}
    </label>
  );
}
