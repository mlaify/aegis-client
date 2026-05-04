import { contextBridge, ipcRenderer } from "electron";
import {
  NotifyOptions,
  OpenFileOptions,
  OpenedFile,
  SaveFileOptions,
  UpdateStatus,
} from "./shared";

const aegis = {
  platform: {
    isElectron: true as const,
    os: process.platform,
    arch: process.arch,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  },
  notify: (opts: NotifyOptions): Promise<void> =>
    ipcRenderer.invoke("aegis:notify", opts),
  setBadge: (count: number): Promise<void> =>
    ipcRenderer.invoke("aegis:set-badge", count),
  openFile: (opts: OpenFileOptions = {}): Promise<OpenedFile[] | null> =>
    ipcRenderer.invoke("aegis:open-file", opts),
  saveFile: (opts: SaveFileOptions): Promise<string | null> =>
    ipcRenderer.invoke("aegis:save-file", opts),
  vault: {
    isAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke("aegis:vault-available"),
    encrypt: (plaintext: string): Promise<string> =>
      ipcRenderer.invoke("aegis:vault-encrypt", plaintext),
    decrypt: (ciphertextB64: string): Promise<string> =>
      ipcRenderer.invoke("aegis:vault-decrypt", ciphertextB64),
  },
  updates: {
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke("aegis:updates-check"),
    install: (): Promise<void> => ipcRenderer.invoke("aegis:updates-install"),
    onStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
      const handler = (_event: unknown, status: UpdateStatus): void => cb(status);
      ipcRenderer.on("aegis:updates-status", handler);
      return () => ipcRenderer.removeListener("aegis:updates-status", handler);
    },
  },
};

contextBridge.exposeInMainWorld("aegis", aegis);

export type AegisBridge = typeof aegis;
