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

  win.maximize();

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
    { id: "caches", label: "Library/Caches", path: path.join(home, "Library", "Caches") },
    { id: "logs", label: "Library/Logs", path: path.join(home, "Library", "Logs") },
    {
      id: "app-support",
      label: "Library/Application Support",
      path: path.join(home, "Library", "Application Support")
    },
    {
      id: "ios-backups",
      label: "iOS Backups",
      path: path.join(home, "Library", "Application Support", "MobileSync", "Backup")
    },
    {
      id: "xcode-derived",
      label: "Xcode/DerivedData",
      path: path.join(home, "Library", "Developer", "Xcode", "DerivedData")
    },
    {
      id: "docker",
      label: "Docker/VMs",
      path: path.join(
        home,
        "Library",
        "Containers",
        "com.docker.docker",
        "Data",
        "vms"
      )
    },
    {
      id: "browser-caches",
      label: "Browser/Caches",
      path: path.join(home, "Library", "Caches")
    }
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

ipcMain.handle("apps:list", async () => {
  const apps = await listApplications();
  return apps;
});

ipcMain.handle("apps:uninstall", async (_event, appInfo) => {
  if (!appInfo || typeof appInfo.path !== "string") {
    return { ok: false, message: "App invalido." };
  }

  const { response } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancelar", "Mover para Lixeira"],
    defaultId: 1,
    cancelId: 0,
    title: "Confirmar desinstalacao",
    message: `Deseja mover "${appInfo.name || "este app"}" para a Lixeira?`,
    detail: "A acao e reversivel enquanto o app estiver na Lixeira."
  });

  if (response !== 1) {
    return { ok: false, message: "Operacao cancelada." };
  }

  try {
    await shell.trashItem(appInfo.path);
    return { ok: true, message: "App movido para a Lixeira." };
  } catch (error) {
    return { ok: false, message: error.message || "Falha ao remover o app." };
  }
});

async function getDiskUsage(targetPath) {
  try {
    const stats = await fs.promises.statfs(targetPath);
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    const used = total - free;
    const root = path.parse(targetPath).root;
    const name = root === "/" ? "Macintosh HD" : root;
    return { total, used, free, name };
  } catch (_error) {
    return null;
  }
}

async function listApplications() {
  const appDirs = ["/Applications", path.join(os.homedir(), "Applications")];
  const collected = [];

  await Promise.all(
    appDirs.map(async (dir) => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || !entry.name.endsWith(".app")) {
            continue;
          }
          const appPath = path.join(dir, entry.name);
          const name = entry.name.replace(/\.app$/i, "");
          const size = await getDirectorySize(appPath);
          collected.push({ name, path: appPath, size });
        }
      } catch (_error) {
        return;
      }
    })
  );

  collected.sort((a, b) => a.name.localeCompare(b.name));
  return collected;
}

async function getDirectorySize(targetPath) {
  let total = 0;
  const stack = [targetPath];

  while (stack.length) {
    const current = stack.pop();
    let stats;
    try {
      stats = await fs.promises.lstat(current);
    } catch (_error) {
      continue;
    }

    if (stats.isSymbolicLink()) {
      continue;
    }

    if (stats.isFile()) {
      total += stats.size;
      continue;
    }

    if (!stats.isDirectory()) {
      continue;
    }

    let entries;
    try {
      entries = await fs.promises.readdir(current);
    } catch (_error) {
      continue;
    }

    for (const entry of entries) {
      stack.push(path.join(current, entry));
    }
  }

  return total;
}
