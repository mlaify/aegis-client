import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  safeStorage,
  shell,
} from "electron";
import { autoUpdater } from "electron-updater";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  NotifyOptions,
  OpenFileOptions,
  OpenedFile,
  SaveFileOptions,
  UpdateStatus,
} from "./shared";

const isDev = process.env.AEGIS_DESKTOP_DEV === "1" || !app.isPackaged;
const rendererUrl = process.env.AEGIS_DESKTOP_RENDERER_URL ?? "http://localhost:5173";
const rendererIndex = path.join(__dirname, "..", "dist-renderer", "index.html");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let lastUpdateStatus: UpdateStatus = { state: "idle" };

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 880,
    minHeight: 600,
    title: "Aegis",
    backgroundColor: "#0b0d12",
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => undefined);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    const allowed = isDev ? new URL(rendererUrl).origin : "file://";
    if (!url.startsWith(allowed) && target.origin !== allowed) {
      event.preventDefault();
      shell.openExternal(url).catch(() => undefined);
    }
  });

  if (isDev) {
    void win.loadURL(rendererUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(rendererIndex);
  }

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

function showOrCreateWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  // No bundled icon yet — fall back to an empty native image so the tray
  // is created on platforms that require one. The OS shows a default
  // placeholder; we'll ship a real icon in build/ before first release.
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Aegis");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Aegis", click: () => showOrCreateWindow() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => showOrCreateWindow());
}

function broadcastUpdateStatus(status: UpdateStatus): void {
  lastUpdateStatus = status;
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("aegis:updates-status", status);
  }
}

function registerIpc(): void {
  ipcMain.handle(
    "aegis:notify",
    (_event, opts: NotifyOptions): void => {
      if (!Notification.isSupported()) return;
      const n = new Notification({
        title: opts.title,
        body: opts.body,
        silent: opts.silent ?? false,
      });
      n.on("click", () => showOrCreateWindow());
      n.show();
    },
  );

  ipcMain.handle("aegis:set-badge", (_event, count: number): void => {
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
      app.setBadgeCount(0);
      return;
    }
    app.setBadgeCount(Math.floor(count));
  });

  ipcMain.handle(
    "aegis:open-file",
    async (
      _event,
      opts: OpenFileOptions = {},
    ): Promise<OpenedFile[] | null> => {
      const win = mainWindow ?? BrowserWindow.getFocusedWindow() ?? undefined;
      const properties: ("openFile" | "multiSelections")[] = ["openFile"];
      if (opts.multi) properties.push("multiSelections");
      const result = win
        ? await dialog.showOpenDialog(win, { properties, filters: opts.filters })
        : await dialog.showOpenDialog({ properties, filters: opts.filters });
      if (result.canceled || result.filePaths.length === 0) return null;
      const files: OpenedFile[] = [];
      for (const p of result.filePaths) {
        const bytes = await fs.readFile(p);
        const stat = await fs.stat(p);
        files.push({
          name: path.basename(p),
          path: p,
          size: stat.size,
          bytes: bytes.toString("base64"),
        });
      }
      return files;
    },
  );

  ipcMain.handle(
    "aegis:save-file",
    async (_event, opts: SaveFileOptions): Promise<string | null> => {
      const win = mainWindow ?? BrowserWindow.getFocusedWindow() ?? undefined;
      const result = win
        ? await dialog.showSaveDialog(win, {
            defaultPath: opts.defaultName,
            filters: opts.filters,
          })
        : await dialog.showSaveDialog({
            defaultPath: opts.defaultName,
            filters: opts.filters,
          });
      if (result.canceled || !result.filePath) return null;
      await fs.writeFile(result.filePath, Buffer.from(opts.bytes, "base64"));
      return result.filePath;
    },
  );

  ipcMain.handle("aegis:vault-available", (): boolean => {
    return safeStorage.isEncryptionAvailable();
  });

  ipcMain.handle("aegis:vault-encrypt", (_event, plaintext: string): string => {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("OS keychain unavailable on this platform");
    }
    return safeStorage.encryptString(plaintext).toString("base64");
  });

  ipcMain.handle(
    "aegis:vault-decrypt",
    (_event, ciphertextB64: string): string => {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("OS keychain unavailable on this platform");
      }
      return safeStorage.decryptString(Buffer.from(ciphertextB64, "base64"));
    },
  );

  ipcMain.handle("aegis:updates-check", async (): Promise<UpdateStatus> => {
    if (isDev || !app.isPackaged) {
      return { state: "disabled", reason: "dev build" };
    }
    try {
      await autoUpdater.checkForUpdates();
      return lastUpdateStatus;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { state: "error", message };
    }
  });

  ipcMain.handle("aegis:updates-install", (): void => {
    if (lastUpdateStatus.state !== "downloaded") return;
    autoUpdater.quitAndInstall();
  });
}

function registerAutoUpdater(): void {
  if (isDev || !app.isPackaged) {
    broadcastUpdateStatus({ state: "disabled", reason: "dev build" });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () =>
    broadcastUpdateStatus({ state: "checking" }),
  );
  autoUpdater.on("update-available", (info) =>
    broadcastUpdateStatus({ state: "available", version: info.version }),
  );
  autoUpdater.on("update-not-available", (info) =>
    broadcastUpdateStatus({ state: "not-available", version: info.version }),
  );
  autoUpdater.on("download-progress", (p) =>
    broadcastUpdateStatus({ state: "downloading", percent: p.percent }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    broadcastUpdateStatus({ state: "downloaded", version: info.version }),
  );
  autoUpdater.on("error", (err) =>
    broadcastUpdateStatus({ state: "error", message: err.message }),
  );
  autoUpdater
    .checkForUpdates()
    .catch((err) =>
      broadcastUpdateStatus({ state: "error", message: String(err) }),
    );
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showOrCreateWindow());
  app.whenReady().then(() => {
    registerIpc();
    mainWindow = createMainWindow();
    createTray();
    registerAutoUpdater();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      } else {
        showOrCreateWindow();
      }
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
