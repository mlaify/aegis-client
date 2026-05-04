import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { Setup } from "@/pages/Setup";
import { TEST_IDENTITY_ID, TEST_IDENTITY_DOC, TEST_SECRETS, TEST_RELAY_URL } from "../fixtures";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/storage", () => ({
  loadRelayUrl: vi.fn().mockResolvedValue(null),
  saveRelayUrl: vi.fn().mockResolvedValue(undefined),
  loadIdentity: vi.fn().mockResolvedValue(null),
  createIdentity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/crypto", () => ({
  cryptoRuntime: vi.fn(() => ({
    generateIdentity: vi.fn().mockResolvedValue({
      document: { ...TEST_IDENTITY_DOC },
      secrets: TEST_SECRETS,
    }),
    signIdentityDocument: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ---------------------------------------------------------------------------
// Imports after mocking
// ---------------------------------------------------------------------------

import * as storage from "@/lib/storage";
import * as cryptoLib from "@/lib/crypto";

function renderSetup() {
  return render(
    <MemoryRouter>
      <Setup />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Setup page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.loadRelayUrl).mockResolvedValue(null);
    vi.mocked(storage.loadIdentity).mockResolvedValue(null);
    vi.mocked(storage.saveRelayUrl).mockResolvedValue(undefined);
    vi.mocked(storage.createIdentity).mockResolvedValue(undefined);
  });

  it("renders the relay URL form", () => {
    renderSetup();
    expect(screen.getByText(/Relay URL/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/http:\/\/127\.0\.0\.1/)).toBeInTheDocument();
  });

  it("saves a valid relay URL", async () => {
    const user = userEvent.setup();
    renderSetup();
    const input = screen.getByPlaceholderText(/http:\/\/127\.0\.0\.1/);
    await user.clear(input);
    await user.type(input, TEST_RELAY_URL);
    await user.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => expect(storage.saveRelayUrl).toHaveBeenCalledWith(TEST_RELAY_URL));
  });

  it("rejects a non-http relay URL", async () => {
    const user = userEvent.setup();
    renderSetup();
    const input = screen.getByPlaceholderText(/http:\/\/127\.0\.0\.1/);
    await user.clear(input);
    await user.type(input, "ftp://bad.host");
    await user.click(screen.getByRole("button", { name: /Save/i }));
    await screen.findByText(/must use http/i);
    expect(storage.saveRelayUrl).not.toHaveBeenCalled();
  });

  it("creates a new identity with matching passphrase", async () => {
    const user = userEvent.setup();
    renderSetup();

    const [passphraseInput, confirmInput] = screen.getAllByPlaceholderText(/passphrase/i);
    await user.type(passphraseInput, "s3cret!");
    await user.type(confirmInput, "s3cret!");
    await user.click(screen.getByRole("button", { name: /Create new identity/i }));

    await waitFor(() => expect(storage.createIdentity).toHaveBeenCalled());
    const statusEl = await screen.findByRole("status");
    expect(statusEl.textContent).toMatch(/created local identity/i);
  });

  it("rejects mismatched passphrases without calling createIdentity", async () => {
    const user = userEvent.setup();
    renderSetup();

    const [passphraseInput, confirmInput] = screen.getAllByPlaceholderText(/passphrase/i);
    await user.type(passphraseInput, "abc");
    await user.type(confirmInput, "xyz");
    await user.click(screen.getByRole("button", { name: /Create new identity/i }));

    const statusEl = await screen.findByRole("status");
    expect(statusEl.textContent).toMatch(/does not match/i);
    expect(storage.createIdentity).not.toHaveBeenCalled();
  });

  it("shows existing identity when one is already stored", async () => {
    vi.mocked(storage.loadIdentity).mockResolvedValue({
      identity_id: TEST_IDENTITY_ID,
      aliases: [],
      supported_suites: [],
      prekey_secret_count: 0,
      document: TEST_IDENTITY_DOC,
    });
    renderSetup();
    await screen.findByText(/existing local identity/i);
    expect(screen.getByRole("button", { name: /Open Identity/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/passphrase/i)).not.toBeInTheDocument();
  });

  it("pre-populates relay URL input from storage", async () => {
    vi.mocked(storage.loadRelayUrl).mockResolvedValue(TEST_RELAY_URL);
    renderSetup();
    const input = await screen.findByPlaceholderText(/http:\/\/127\.0\.0\.1/);
    expect((input as HTMLInputElement).value).toBe(TEST_RELAY_URL);
  });

  it("signs the identity document during creation", async () => {
    const user = userEvent.setup();
    const mockRuntime = {
      generateIdentity: vi.fn().mockResolvedValue({
        document: { ...TEST_IDENTITY_DOC },
        secrets: TEST_SECRETS,
      }),
      signIdentityDocument: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(cryptoLib.cryptoRuntime).mockReturnValue(mockRuntime as unknown as ReturnType<typeof cryptoLib.cryptoRuntime>);

    renderSetup();
    const [passphraseInput, confirmInput] = screen.getAllByPlaceholderText(/passphrase/i);
    await user.type(passphraseInput, "pass123");
    await user.type(confirmInput, "pass123");
    await user.click(screen.getByRole("button", { name: /Create new identity/i }));

    await waitFor(() => expect(mockRuntime.signIdentityDocument).toHaveBeenCalled());
  });
});

// ---------------------------------------------------------------------------
// Import identity tests
// ---------------------------------------------------------------------------

describe("Setup page — import identity", () => {
  const EXPORT_BLOB = JSON.stringify({
    version: "aegis-web-export-v1",
    document: TEST_IDENTITY_DOC,
    secrets: TEST_SECRETS,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.loadRelayUrl).mockResolvedValue(null);
    vi.mocked(storage.loadIdentity).mockResolvedValue(null);
    vi.mocked(storage.saveRelayUrl).mockResolvedValue(undefined);
    vi.mocked(storage.createIdentity).mockResolvedValue(undefined);
  });

  it("shows the import section when no identity exists", async () => {
    renderSetup();
    // heading and button both contain "Import identity" — match the heading specifically
    await screen.findByRole("heading", { name: /3\. Import identity/i });
    expect(screen.getByRole("button", { name: /Import identity/i })).toBeInTheDocument();
  });

  it("hides the import section when an identity already exists", async () => {
    vi.mocked(storage.loadIdentity).mockResolvedValue({
      identity_id: TEST_IDENTITY_ID,
      aliases: [],
      supported_suites: [],
      prekey_secret_count: 0,
      document: TEST_IDENTITY_DOC,
    });
    renderSetup();
    await screen.findByText(/existing local identity/i);
    expect(screen.queryByRole("heading", { name: /3\. Import identity/i })).not.toBeInTheDocument();
  });

  it("imports a valid export blob", async () => {
    const user = userEvent.setup();
    renderSetup();
    const textarea = screen.getByPlaceholderText(/aegis-web-export-v1/i);
    // fireEvent.change bypasses userEvent's keyboard parser (which chokes on JSON braces)
    fireEvent.change(textarea, { target: { value: EXPORT_BLOB } });
    const importPass = screen.getByPlaceholderText(/new passphrase/i);
    await user.type(importPass, "imported-pass");
    await user.click(screen.getByRole("button", { name: /Import identity/i }));
    await waitFor(() => expect(storage.createIdentity).toHaveBeenCalled());
  });

  it("rejects malformed JSON with a status message", async () => {
    const user = userEvent.setup();
    renderSetup();
    const textarea = screen.getByPlaceholderText(/aegis-web-export-v1/i);
    fireEvent.change(textarea, { target: { value: "not valid json" } });
    const importPass = screen.getByPlaceholderText(/new passphrase/i);
    await user.type(importPass, "pass");
    await user.click(screen.getByRole("button", { name: /Import identity/i }));
    await screen.findByText(/invalid JSON/i);
    expect(storage.createIdentity).not.toHaveBeenCalled();
  });

  it("rejects JSON missing secrets field", async () => {
    const user = userEvent.setup();
    renderSetup();
    const textarea = screen.getByPlaceholderText(/aegis-web-export-v1/i);
    fireEvent.change(textarea, { target: { value: JSON.stringify({ document: TEST_IDENTITY_DOC }) } });
    const importPass = screen.getByPlaceholderText(/new passphrase/i);
    await user.type(importPass, "pass");
    await user.click(screen.getByRole("button", { name: /Import identity/i }));
    await screen.findByText(/missing document or secrets/i);
    expect(storage.createIdentity).not.toHaveBeenCalled();
  });

  it("requires a passphrase before importing", async () => {
    renderSetup();
    const textarea = screen.getByPlaceholderText(/aegis-web-export-v1/i);
    fireEvent.change(textarea, { target: { value: EXPORT_BLOB } });
    await userEvent.setup().click(screen.getByRole("button", { name: /Import identity/i }));
    await screen.findByText(/enter a passphrase/i);
    expect(storage.createIdentity).not.toHaveBeenCalled();
  });

  it("blocks import when identity already exists", async () => {
    vi.mocked(storage.loadIdentity).mockResolvedValue({
      identity_id: TEST_IDENTITY_ID,
      aliases: [],
      supported_suites: [],
      prekey_secret_count: 0,
      document: TEST_IDENTITY_DOC,
    });
    renderSetup();
    await screen.findByText(/existing local identity/i);
    expect(screen.queryByRole("button", { name: /Import identity/i })).not.toBeInTheDocument();
  });
});
