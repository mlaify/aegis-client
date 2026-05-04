// Relay HTTP client.
//
// Thin wrapper around RFC-0004 relay endpoints. Crypto is handled upstream;
// this module is pure transport.

import type {
  ClaimedPrekeyResponse,
  Envelope,
  FetchEnvelopeResponse,
  IdentityDocument,
  PrekeyBundle,
  PublishPrekeysResponse,
  StoreEnvelopeResponse,
} from "@aegis/sdk";

function trim(url: string): string {
  return url.replace(/\/$/, "");
}

function encId(id: string): string {
  // Mirrors aegis_identity::resolver::url_encode — only ':' and '/' get %-encoded.
  return id.replace(/:/g, "%3A").replace(/\//g, "%2F");
}

async function getJson<T>(url: string): Promise<T> {
  const resp = await fetch(url, { headers: { accept: "application/json" } });
  if (!resp.ok) throw await relayError(resp);
  return (await resp.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw await relayError(resp);
  return (await resp.json()) as T;
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw await relayError(resp);
  return (await resp.json()) as T;
}

async function relayError(resp: Response): Promise<Error> {
  let detail = "";
  try {
    const body = await resp.json();
    detail = `${body?.error?.code ?? resp.statusText}: ${body?.error?.message ?? ""}`;
  } catch {
    detail = await resp.text();
  }
  return new Error(`relay ${resp.status}: ${detail.trim()}`);
}

// ---------------------------------------------------------------------------
// Read endpoints (wired in v0 scaffold)
// ---------------------------------------------------------------------------

export async function resolveIdentity(
  relayUrl: string,
  identityId: string,
): Promise<IdentityDocument> {
  return getJson<IdentityDocument>(
    `${trim(relayUrl)}/v1/identities/${encId(identityId)}`,
  );
}

export async function resolveAlias(relayUrl: string, alias: string): Promise<IdentityDocument> {
  return getJson<IdentityDocument>(`${trim(relayUrl)}/v1/aliases/${encId(alias)}`);
}

export async function fetchEnvelopes(
  relayUrl: string,
  recipientId: string,
): Promise<Envelope[]> {
  const body = await getJson<FetchEnvelopeResponse>(
    `${trim(relayUrl)}/v1/envelopes/${encId(recipientId)}`,
  );
  return body.envelopes;
}

// ---------------------------------------------------------------------------
// Write endpoints
// ---------------------------------------------------------------------------

export async function publishIdentity(
  relayUrl: string,
  doc: IdentityDocument,
): Promise<void> {
  await putJson<unknown>(`${trim(relayUrl)}/v1/identities/${encId(doc.identity_id)}`, doc);
}

export async function publishPrekeys(
  relayUrl: string,
  bundle: PrekeyBundle,
): Promise<PublishPrekeysResponse> {
  return postJson<PublishPrekeysResponse>(
    `${trim(relayUrl)}/v1/identities/${encId(bundle.identity_id)}/prekeys`,
    bundle,
  );
}

export async function claimOneTimePrekey(
  relayUrl: string,
  identityId: string,
): Promise<ClaimedPrekeyResponse> {
  return getJson<ClaimedPrekeyResponse>(
    `${trim(relayUrl)}/v1/identities/${encId(identityId)}/prekey`,
  );
}

export async function pushEnvelope(
  relayUrl: string,
  envelope: Envelope,
): Promise<StoreEnvelopeResponse> {
  return postJson<StoreEnvelopeResponse>(`${trim(relayUrl)}/v1/envelopes`, { envelope });
}
