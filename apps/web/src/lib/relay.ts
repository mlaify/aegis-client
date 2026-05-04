// Relay HTTP client.
//
// Thin wrapper around the relay endpoints documented in RFC-0004. Does
// nothing crypto-related — encryption / signing / claim-handling all live
// in the seal/open flows that call into this module for transport.
//
// Endpoints that are stubbed (return placeholder data) will be implemented
// alongside the real crypto runtime in the next iteration. The signatures
// match the relay's actual response shapes from `aegis-api-types`.

import type {
  ClaimedPrekeyResponse,
  Envelope,
  FetchEnvelopeResponse,
  IdentityDocument,
  PrekeyBundle,
  PublishPrekeysResponse,
  StoreEnvelopeResponse,
} from "@aegis/sdk";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function urlEncodeIdentity(id: string): string {
  // Mirrors `aegis_identity::resolver::url_encode` -- only ':' and '/' get
  // percent-encoded; aliases like alice@mesh pass through unchanged.
  return id.replace(/:/g, "%3A").replace(/\//g, "%2F");
}

async function getJson<T>(url: string): Promise<T> {
  const resp = await fetch(url, { headers: { accept: "application/json" } });
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

export async function resolveIdentity(
  relayUrl: string,
  identityId: string,
): Promise<IdentityDocument> {
  return getJson<IdentityDocument>(
    `${trimTrailingSlash(relayUrl)}/v1/identities/${urlEncodeIdentity(identityId)}`,
  );
}

export async function resolveAlias(
  relayUrl: string,
  alias: string,
): Promise<IdentityDocument> {
  return getJson<IdentityDocument>(
    `${trimTrailingSlash(relayUrl)}/v1/aliases/${urlEncodeIdentity(alias)}`,
  );
}

export async function fetchEnvelopes(
  relayUrl: string,
  recipientId: string,
): Promise<Envelope[]> {
  const body = await getJson<FetchEnvelopeResponse>(
    `${trimTrailingSlash(relayUrl)}/v1/envelopes/${urlEncodeIdentity(recipientId)}`,
  );
  return body.envelopes;
}

// --- Stubs that wire up alongside the crypto runtime ---

export async function publishIdentity(
  _relayUrl: string,
  _doc: IdentityDocument,
): Promise<void> {
  throw new Error("publishIdentity not yet implemented in v0 scaffold");
}

export async function publishPrekeys(
  _relayUrl: string,
  _bundle: PrekeyBundle,
): Promise<PublishPrekeysResponse> {
  throw new Error("publishPrekeys not yet implemented in v0 scaffold");
}

export async function claimOneTimePrekey(
  _relayUrl: string,
  _identityId: string,
): Promise<ClaimedPrekeyResponse> {
  throw new Error("claimOneTimePrekey not yet implemented in v0 scaffold");
}

export async function pushEnvelope(
  _relayUrl: string,
  _envelope: Envelope,
): Promise<StoreEnvelopeResponse> {
  throw new Error("pushEnvelope not yet implemented in v0 scaffold");
}
