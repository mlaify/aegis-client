import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { Compose } from "@/pages/Compose";
import {
  TEST_IDENTITY_DOC,
  TEST_IDENTITY_ID,
  TEST_RELAY_URL,
  TEST_SECRETS,
  SUITE_HYBRID_PQ,
} from "../fixtures";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/storage", () => ({
  loadIdentity: vi.fn(),
  loadRelayUrl: vi.fn(),
  loadSecrets: vi.fn(),
  isSessionLocked: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
  cryptoRuntime: vi.fn(),
}));

vi.mock("@/lib/relay", () => ({
  resolveIdentity: vi.fn(),
  resolveAlias: vi.fn(),
  claimOneTimePrekey: vi.fn(),
  pushEnvelope: vi.fn(),
}));

// VaultSessionPanel just renders an unlock form; stub it out to remove deps
vi.mock("@/components/VaultSessionPanel", () => ({
  VaultSessionPanel: () => null,
}));

// ---------------------------------------------------------------------------
// Imports after mocking
// ---------------------------------------------------------------------------

import * as storage from "@/lib/storage";
import * as cryptoLib from "@/lib/crypto";
import * as relay from "@/lib/relay";

const TEST_ENVELOPE_RESPONSE = { envelope_id: "env-1", suite_id: "HybridX25519MlKem768Ed25519MlDsa65" };
const TEST_STORE_RESPONSE = { relay_id: "relay-envelope-1" };
const TEST_PREKEY_RESPONSE = { key_id: "prekey-1", public_key_b64: "AAAA" };

function renderCompose() {
  return render(
    <MemoryRouter>
      <Compose />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Compose page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.isSessionLocked).mockReturnValue(false);
    vi.mocked(storage.loadIdentity).mockResolvedValue({
      identity_id: TEST_IDENTITY_ID,
      aliases: ["testuser@local"],
      supported_suites: [SUITE_HYBRID_PQ],
      prekey_secret_count: 10,
      document: TEST_IDENTITY_DOC,
    });
    vi.mocked(storage.loadRelayUrl).mockResolvedValue(TEST_RELAY_URL);
    vi.mocked(storage.loadSecrets).mockResolvedValue(TEST_SECRETS);
    vi.mocked(relay.resolveAlias).mockResolvedValue(TEST_IDENTITY_DOC);
    vi.mocked(relay.resolveIdentity).mockResolvedValue(TEST_IDENTITY_DOC);
    vi.mocked(relay.claimOneTimePrekey).mockResolvedValue(TEST_PREKEY_RESPONSE);
    vi.mocked(relay.pushEnvelope).mockResolvedValue(TEST_STORE_RESPONSE);
    vi.mocked(cryptoLib.cryptoRuntime).mockReturnValue({
      sealHybridPq: vi.fn().mockResolvedValue(TEST_ENVELOPE_RESPONSE),
    } as unknown as ReturnType<typeof cryptoLib.cryptoRuntime>);
  });

  it("renders the compose form when identity and relay are ready", async () => {
    renderCompose();
    await screen.findByText(/Compose/i);
    expect(screen.getByPlaceholderText(/amp:did:key:/i)).toBeInTheDocument();
  });

  it("shows the 'set up' gate when no identity is stored", async () => {
    vi.mocked(storage.loadIdentity).mockResolvedValue(null);
    renderCompose();
    await screen.findByText(/Set up before composing/i);
  });

  it("shows 'hybrid PQ suite: supported' after resolving a PQ-capable recipient", async () => {
    const user = userEvent.setup();
    renderCompose();
    const toInput = await screen.findByPlaceholderText(/amp:did:key:/i);
    await user.type(toInput, "testuser@local");
    await screen.findByText(/resolved/i);
    expect(await screen.findByText("supported")).toBeInTheDocument();
  });

  it("shows 'not supported — cannot send' for a non-PQ recipient", async () => {
    vi.mocked(relay.resolveAlias).mockResolvedValue({
      ...TEST_IDENTITY_DOC,
      supported_suites: ["SOME-OTHER-SUITE"],
    });
    const user = userEvent.setup();
    renderCompose();
    const toInput = await screen.findByPlaceholderText(/amp:did:key:/i);
    await user.type(toInput, "testuser@local");
    await screen.findByText(/not supported/i);
  });

  it("disables send when recipient does not support hybrid PQ", async () => {
    vi.mocked(relay.resolveAlias).mockResolvedValue({
      ...TEST_IDENTITY_DOC,
      supported_suites: ["SOME-OTHER-SUITE"],
    });
    const user = userEvent.setup();
    renderCompose();
    const toInput = await screen.findByPlaceholderText(/amp:did:key:/i);
    await user.type(toInput, "testuser@local");
    await screen.findByText(/not supported/i);
    const sendBtn = screen.getByRole("button", { name: /Seal & send/i });
    expect(sendBtn).toBeDisabled();
  });

  it("sends envelope and clears form on success", async () => {
    const user = userEvent.setup();
    renderCompose();

    const toInput = await screen.findByPlaceholderText(/amp:did:key:/i);
    await user.type(toInput, "testuser@local");
    await screen.findByText(/resolved/i);

    const subjectInput = screen.getByRole("textbox", { name: /Subject/i });
    await user.type(subjectInput, "Test subject");

    const bodyInput = screen.getByRole("textbox", { name: /Body/i });
    await user.type(bodyInput, "Test body text");

    const sendBtn = await screen.findByRole("button", { name: /Seal & send/i });
    await waitFor(() => expect(sendBtn).not.toBeDisabled());
    await user.click(sendBtn);

    await screen.findByText(/sent envelope relay-envelope-1/i);
    expect(relay.pushEnvelope).toHaveBeenCalled();
  });

  it("shows error when relay returns an error on send", async () => {
    vi.mocked(relay.pushEnvelope).mockRejectedValue(new Error("relay 500: internal error"));
    const user = userEvent.setup();
    renderCompose();

    const toInput = await screen.findByPlaceholderText(/amp:did:key:/i);
    await user.type(toInput, "testuser@local");
    await screen.findByText(/resolved/i);

    const bodyInput = screen.getByRole("textbox", { name: /Body/i });
    await user.type(bodyInput, "hello");

    const sendBtn = await screen.findByRole("button", { name: /Seal & send/i });
    await waitFor(() => expect(sendBtn).not.toBeDisabled());
    await user.click(sendBtn);

    await screen.findByText(/relay 500/i);
  });

  it("resolves amp: addresses directly via resolveIdentity", async () => {
    const user = userEvent.setup();
    renderCompose();

    const toInput = await screen.findByPlaceholderText(/amp:did:key:/i);
    await user.type(toInput, `${TEST_IDENTITY_ID}`);
    await screen.findByText(/resolved/i);

    expect(relay.resolveIdentity).toHaveBeenCalled();
    expect(relay.resolveAlias).not.toHaveBeenCalled();
  });
});
