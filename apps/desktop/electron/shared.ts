// Shared types between the Electron main process, the preload bridge,
// and the renderer (consumed via apps/desktop/src/window.d.ts).

export type IpcChannel =
  | "aegis:notify"
  | "aegis:set-badge"
  | "aegis:open-file"
  | "aegis:save-file"
  | "aegis:vault-available"
  | "aegis:vault-encrypt"
  | "aegis:vault-decrypt"
  | "aegis:updates-check"
  | "aegis:updates-install"
  | "aegis:updates-status";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string }
  | { state: "disabled"; reason: string };

export interface NotifyOptions {
  title: string;
  body?: string;
  silent?: boolean;
}

export interface OpenFileOptions {
  multi?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface OpenedFile {
  name: string;
  path: string;
  size: number;
  // Base64-encoded contents. Renderer decodes to bytes as needed.
  bytes: string;
}

export interface SaveFileOptions {
  defaultName?: string;
  // Base64-encoded bytes to write.
  bytes: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}
