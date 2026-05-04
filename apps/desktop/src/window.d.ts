// Ambient type for the Electron preload bridge exposed at `window.aegis`.
//
// Renderer code (apps/web) can opt into native features by checking
// `window.aegis?.platform.isElectron` and falling back to web APIs when
// undefined. Add a triple-slash reference from the web app to pick this up
// at type-check time, or rely on the runtime guard.

import type {
  NotifyOptions,
  OpenFileOptions,
  OpenedFile,
  SaveFileOptions,
  UpdateStatus,
} from "../electron/shared";

interface AegisDesktopBridge {
  platform: {
    readonly isElectron: true;
    readonly os: NodeJS.Platform;
    readonly arch: string;
    readonly versions: {
      readonly electron: string;
      readonly chrome: string;
      readonly node: string;
    };
  };
  notify(opts: NotifyOptions): Promise<void>;
  setBadge(count: number): Promise<void>;
  openFile(opts?: OpenFileOptions): Promise<OpenedFile[] | null>;
  saveFile(opts: SaveFileOptions): Promise<string | null>;
  vault: {
    isAvailable(): Promise<boolean>;
    encrypt(plaintext: string): Promise<string>;
    decrypt(ciphertextB64: string): Promise<string>;
  };
  updates: {
    check(): Promise<UpdateStatus>;
    install(): Promise<void>;
    onStatus(cb: (s: UpdateStatus) => void): () => void;
  };
}

declare global {
  interface Window {
    aegis?: AegisDesktopBridge;
  }
}

export {};
