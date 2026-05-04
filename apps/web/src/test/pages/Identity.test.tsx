import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { Identity } from "@/pages/Identity";
import {
  TEST_IDENTITY_DOC,
  TEST_IDENTITY_ID,
  TEST_RELAY_URL,
  TEST_SECRETS,
} from "../fixtures";
import type { PublishPrekeysResponse } from "@aegis/sdk";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/storage", () => ({
  loadIdentity: vi.fn(),
  loadRelayUrl: vi.fn(),
  loadSecrets: vi.fn(),
  savePrekeyBundle: vi.fn(),
  isSessionLocked: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
  cryptoRuntime: vi.fn(),
}));

vi.mock("@/lib/relay", () => ({
  publishIdentity: vi.fn(),
  publishPrekeys: vi.fn(),
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

const STORED_IDENTITY = {
  identity_id: TEST_IDENTITY_ID,
  aliases: ["testuser@local"],
  supported_suites: ["AMP-HYBRID-X25519-MLKEM768-ED25519-MLDSA65-V1"],
  prekey_secret_count: 5,
  document: TEST_IDENTITY_DOC,
};

const PUBLISH_PREKEYS_RESPONSE: PublishPrekeysResponse = {
  identity_id: TEST_IDENTITY_ID,
  inserted: 10,
  skipped: 0,
};

function makeRuntime() {
  return {
    generatePrekeyBundle: vi.fn().mockResolvedValue({
      bundle: {
        identity_id: TEST_IDENTITY_ID,
        signed_prekeys: [],
        one_time_prekeys: [],
        supported_suites: [],
        expires_at: null,
        signature: null,
      },
      private: { identity_id: TEST_IDENTITY_ID, one_time_prekey_secrets: [] },
    }),
    signPrekeyBundle: vi.fn().mockResolvedValue(undefined),
  };
}

function renderIdentity() {
  return render(
    <MemoryRouter>
      <Identity />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Identity page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.isSessionLocked).mockReturnValue(false);
    vi.mocked(storage.loadIdentity).mockResolvedValue(STORED_IDENTITY);
    vi.mocked(storage.loadRelayUrl).mockResolvedValue(TEST_RELAY_URL);
    vi.mocked(storage.loadSecrets).mockResolvedValue(TEST_SECRETS);
    vi.mocked(storage.savePrekeyBundle).mockResolvedValue(undefined);
    vi.mocked(relay.publishIdentity).mockResolvedValue(undefined);
    vi.mocked(relay.publishPrekeys).mockResolvedValue(PUBLISH_PREKEYS_RESPONSE);
    vi.mocked(cryptoLib.cryptoRuntime).mockReturnValue(
      makeRuntime() as unknown as ReturnType<typeof cryptoLib.cryptoRuntime>,
    );
  });

  it("shows the no-identity gate when no identity is stored", async () => {
    vi.mocked(storage.loadIdentity).mockResolvedValue(null);
    renderIdentity();
    await screen.findByText(/No identity yet/i);
  });

  it("renders identity_id and key info after load", async () => {
    renderIdentity();
    await screen.findByText(TEST_IDENTITY_ID);
    expect(screen.getByText(/testuser@local/i)).toBeInTheDocument();
    expect(screen.getByText(/sig-ed25519-1/)).toBeInTheDocument();
    expect(screen.getByText(/enc-x25519-1/)).toBeInTheDocument();
  });

  it("shows prekey pool count", async () => {
    renderIdentity();
    await screen.findByText(/5 unclaimed local secrets/i);
  });

  it("shows relay endpoint from document", async () => {
    renderIdentity();
    await screen.findByText(new RegExp(TEST_RELAY_URL));
  });

  it("publishes identity to relay on button click", async () => {
    const user = userEvent.setup();
    renderIdentity();
    await user.click(await screen.findByRole("button", { name: /Publish identity/i }));
    await waitFor(() => expect(relay.publishIdentity).toHaveBeenCalledWith(TEST_RELAY_URL, TEST_IDENTITY_DOC));
    await screen.findByText(/published identity to/i);
  });

  it("shows relay error when publish identity fails", async () => {
    vi.mocked(relay.publishIdentity).mockRejectedValue(new Error("relay 503: unavailable"));
    const user = userEvent.setup();
    renderIdentity();
    await user.click(await screen.findByRole("button", { name: /Publish identity/i }));
    await screen.findByText(/relay 503/i);
  });

  it("publishes prekeys and refreshes pool count", async () => {
    const user = userEvent.setup();
    vi.mocked(storage.loadIdentity)
      .mockResolvedValueOnce(STORED_IDENTITY)
      .mockResolvedValueOnce({ ...STORED_IDENTITY, prekey_secret_count: 15 });
    renderIdentity();
    await user.click(await screen.findByRole("button", { name: /Publish prekeys/i }));
    await waitFor(() => expect(relay.publishPrekeys).toHaveBeenCalled());
    await screen.findByText(/inserted=10.*skipped=0/i);
    await screen.findByText(/15 unclaimed local secrets/i);
  });

  it("shows export JSON when Export is clicked", async () => {
    const user = userEvent.setup();
    renderIdentity();
    await user.click(await screen.findByRole("button", { name: /Export/i }));
    await screen.findByText(/aegis-web-export-v1/i);
    expect(screen.getByText(/Keep this file secret/i)).toBeInTheDocument();
  });

  it("hides export JSON when Hide is clicked", async () => {
    const user = userEvent.setup();
    renderIdentity();
    await user.click(await screen.findByRole("button", { name: /Export/i }));
    await screen.findByText(/Keep this file secret/i);
    await user.click(screen.getByRole("button", { name: /Hide/i }));
    expect(screen.queryByText(/Keep this file secret/i)).not.toBeInTheDocument();
  });

  it("disables action buttons when vault is locked", async () => {
    vi.mocked(storage.isSessionLocked).mockReturnValue(true);
    renderIdentity();
    await screen.findByText(TEST_IDENTITY_ID);
    expect(screen.getByRole("button", { name: /Publish identity/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Publish prekeys/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Export/i })).toBeDisabled();
  });

  it("disables publish buttons when relay URL is missing", async () => {
    vi.mocked(storage.loadRelayUrl).mockResolvedValue(null);
    renderIdentity();
    await screen.findByText(TEST_IDENTITY_ID);
    expect(screen.getByRole("button", { name: /Publish identity/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Publish prekeys/i })).toBeDisabled();
  });
});
