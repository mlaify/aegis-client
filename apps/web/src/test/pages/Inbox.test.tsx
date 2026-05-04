import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { Inbox } from "@/pages/Inbox";
import type { SigStatus } from "@/lib/crypto";
import {
  TEST_ENVELOPE,
  TEST_IDENTITY_DOC,
  TEST_IDENTITY_ID,
  TEST_OPEN_RESULT,
  TEST_RELAY_URL,
  TEST_SECRETS,
} from "../fixtures";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/storage", () => ({
  loadIdentity: vi.fn(),
  loadRelayUrl: vi.fn(),
  loadSecrets: vi.fn(),
  loadPrekeySecrets: vi.fn(),
  consumePrekeySecret: vi.fn(),
  isSessionLocked: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
  cryptoRuntime: vi.fn(),
}));

vi.mock("@/lib/relay", () => ({
  fetchEnvelopes: vi.fn(),
  resolveIdentity: vi.fn(),
}));

vi.mock("@/components/VaultSessionPanel", () => ({
  VaultSessionPanel: () => null,
}));

// ---------------------------------------------------------------------------
// Imports after mocking
// ---------------------------------------------------------------------------

import * as storage from "@/lib/storage";
import * as cryptoLib from "@/lib/crypto";
import * as relay from "@/lib/relay";

function renderInbox() {
  return render(
    <MemoryRouter>
      <Inbox />
    </MemoryRouter>,
  );
}

function makeRuntime(sigStatus: SigStatus) {
  return {
    openHybridPq: vi.fn().mockResolvedValue({ ...TEST_OPEN_RESULT, sigStatus }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Inbox page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.isSessionLocked).mockReturnValue(false);
    vi.mocked(storage.loadIdentity).mockResolvedValue({
      identity_id: TEST_IDENTITY_ID,
      aliases: [],
      supported_suites: [],
      prekey_secret_count: 0,
      document: TEST_IDENTITY_DOC,
    });
    vi.mocked(storage.loadRelayUrl).mockResolvedValue(TEST_RELAY_URL);
    vi.mocked(storage.loadSecrets).mockResolvedValue(TEST_SECRETS);
    vi.mocked(storage.loadPrekeySecrets).mockResolvedValue([]);
    vi.mocked(storage.consumePrekeySecret).mockResolvedValue(undefined);
    vi.mocked(relay.fetchEnvelopes).mockResolvedValue([TEST_ENVELOPE]);
    vi.mocked(relay.resolveIdentity).mockResolvedValue(TEST_IDENTITY_DOC);
    vi.mocked(cryptoLib.cryptoRuntime).mockReturnValue(
      makeRuntime("unsigned") as unknown as ReturnType<typeof cryptoLib.cryptoRuntime>,
    );
  });

  it("renders header with identity and relay info", async () => {
    renderInbox();
    await screen.findByText(/Inbox/i);
    expect(screen.getByRole("button", { name: /Fetch/i })).toBeInTheDocument();
  });

  it("shows empty state before fetching", async () => {
    renderInbox();
    await screen.findByText(/No envelopes fetched yet/i);
  });

  it("fetches and lists envelopes on Fetch click", async () => {
    const user = userEvent.setup();
    renderInbox();
    await screen.findByText(/Fetch/i);
    await user.click(screen.getByRole("button", { name: /Fetch/i }));
    await screen.findByText(new RegExp(TEST_ENVELOPE.envelope_id));
  });

  it("shows empty state when no identity configured", async () => {
    vi.mocked(storage.loadIdentity).mockResolvedValue(null);
    renderInbox();
    await screen.findByText(/Inbox unavailable/i);
  });

  it("opens envelope and shows plaintext body", async () => {
    const user = userEvent.setup();
    renderInbox();
    await user.click(await screen.findByRole("button", { name: /Fetch/i }));
    await screen.findByText(new RegExp(TEST_ENVELOPE.envelope_id));
    await user.click(screen.getByRole("button", { name: /Open/i }));
    await screen.findByText(TEST_OPEN_RESULT.payload.body.content);
  });

  it("shows subject from private_headers", async () => {
    const user = userEvent.setup();
    renderInbox();
    await user.click(await screen.findByRole("button", { name: /Fetch/i }));
    await user.click(await screen.findByRole("button", { name: /Open/i }));
    await screen.findByText(/Hello test/i);
  });

  it.each<[SigStatus, string]>([
    ["verified", "sig: verified"],
    ["failed", "sig: failed"],
    ["unsigned", "sig: unsigned"],
    ["unavailable", "sig: unavailable"],
  ])("renders SigBadge for '%s' status", async (sigStatus, expectedLabel) => {
    vi.mocked(cryptoLib.cryptoRuntime).mockReturnValue(
      makeRuntime(sigStatus) as unknown as ReturnType<typeof cryptoLib.cryptoRuntime>,
    );
    const user = userEvent.setup();
    renderInbox();
    await user.click(await screen.findByRole("button", { name: /Fetch/i }));
    await user.click(await screen.findByRole("button", { name: /Open/i }));
    await screen.findByText(expectedLabel);
  });

  it("shows error string when openHybridPq rejects", async () => {
    vi.mocked(cryptoLib.cryptoRuntime).mockReturnValue({
      openHybridPq: vi.fn().mockRejectedValue(new Error("decryption failed")),
    } as unknown as ReturnType<typeof cryptoLib.cryptoRuntime>);
    const user = userEvent.setup();
    renderInbox();
    await user.click(await screen.findByRole("button", { name: /Fetch/i }));
    await user.click(await screen.findByRole("button", { name: /Open/i }));
    await screen.findByText(/decryption failed/i);
  });

  it("consumes the prekey after a successful open", async () => {
    vi.mocked(storage.loadPrekeySecrets).mockResolvedValue([
      { key_id: "prekey-1", kyber768_secret_key_b64: "AAAA" },
    ]);
    const user = userEvent.setup();
    renderInbox();
    await user.click(await screen.findByRole("button", { name: /Fetch/i }));
    await user.click(await screen.findByRole("button", { name: /Open/i }));
    await waitFor(() =>
      expect(storage.consumePrekeySecret).toHaveBeenCalledWith("prekey-1"),
    );
  });

  it("shows fetch error when relay returns an error", async () => {
    vi.mocked(relay.fetchEnvelopes).mockRejectedValue(new Error("relay 503: unavailable"));
    const user = userEvent.setup();
    renderInbox();
    await user.click(await screen.findByRole("button", { name: /Fetch/i }));
    await screen.findByText(/relay 503/i);
  });
});
