const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { scanDirectory } = require("./services/scanner");
const { formatBytes } = require("./utils/format");

const isDev = process.argv.includes("--dev");

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#0f1417",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  if (isDev) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("scan:defaults", async () => {
  const home = os.homedir();
  const defaults = [
    { id: "downloads", label: "Downloads", path: path.join(home, "Downloads") },
    { id: "desktop", label: "Desktop", path: path.join(home, "Desktop") },
    { id: "documents", label: "Documents", path: path.join(home, "Documents") },
    { id: "caches", label: "Library/Caches", path: path.join(home, "Library", "Caches") }
  ];

  const results = await Promise.all(
    defaults.map(async (entry) => {
      const scan = await scanDirectory(entry.path, { depth: 4, maxEntries: 2000 });
      return { ...entry, summary: scan.summary };
    })
  );

  return results;
});

ipcMain.handle("scan:path", async (_event, target) => {
  if (!target || typeof target !== "string") {
    throw new Error("Invalid path.");
  }

  const scan = await scanDirectory(target, { depth: 5, maxEntries: 4000 });
  const disk = await getDiskUsage(target);
  return { ...scan, disk };
});

ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    buttonLabel: "Selecionar"
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("files:delete", async (_event, items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, message: "Nenhum arquivo selecionado." };
  }

  const { response } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancelar", "Mover para Lixeira"],
    defaultId: 1,
    cancelId: 0,
    title: "Confirmar exclusao",
    message: "Deseja mover os arquivos selecionados para a Lixeira?",
    detail: "A acao e reversivel enquanto os arquivos estiverem na Lixeira."
  });

  if (response !== 1) {
    return { ok: false, message: "Operacao cancelada." };
  }

  const failures = [];

  for (const item of items) {
    try {
      await shell.trashItem(item.path);
    } catch (error) {
      failures.push({ path: item.path, error: error.message || String(error) });
    }
  }

  if (failures.length) {
    return { ok: false, message: "Alguns arquivos nao puderam ser movidos.", failures };
  }

  const totalBytes = items.reduce((sum, item) => sum + (item.size || 0), 0);

  return {
    ok: true,
    message: `Arquivos movidos para a Lixeira. Espaco liberado: ${formatBytes(totalBytes)}.`
  };
});

async function getDiskUsage(targetPath) {
  try {
    const stats = await fs.promises.statfs(targetPath);
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    const used = total - free;
    return { total, used, free };
  } catch (_error) {
    return null;
  }
}
