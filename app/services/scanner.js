const path = require("path");
const { statSafe, listDirSafe } = require("../utils/fs-safe");
const { formatBytes } = require("../utils/format");

const SUSPICIOUS_RULES = [
  {
    id: "old-large",
    label: "Arquivos antigos e grandes",
    match: (item) => item.size > 500 * 1024 * 1024 && item.ageDays > 365
  },
  {
    id: "installer",
    label: "Instaladores e imagens de disco",
    match: (item) => /\.(dmg|pkg|zip|rar)$/i.test(item.name)
  },
  {
    id: "cache",
    label: "Caches e logs",
    match: (item) => /\.(log|cache)$/i.test(item.name) || item.path.includes("/Library/Caches/")
  }
];

function analyzeEntry(stats, entryPath) {
  const name = path.basename(entryPath);
  const size = stats.size;
  const mtime = stats.mtime;
  const ageDays = Math.floor((Date.now() - mtime.getTime()) / (24 * 60 * 60 * 1000));
  const origin = path.dirname(entryPath);
  const suspicious = SUSPICIOUS_RULES.filter((rule) => rule.match({
    name,
    size,
    path: entryPath,
    ageDays
  })).map((rule) => rule.label);

  return {
    name,
    path: entryPath,
    size,
    sizeLabel: formatBytes(size),
    modifiedAt: mtime.toISOString(),
    ageDays,
    origin,
    suspicious
  };
}

async function scanDirectory(targetPath, options = {}) {
  const depth = options.depth ?? 4;
  const maxEntries = options.maxEntries ?? 3000;
  const collected = [];
  const skipped = [];

  async function walk(currentPath, level) {
    if (collected.length >= maxEntries) {
      return;
    }

    const stats = await statSafe(currentPath);
    if (!stats) {
      skipped.push({ path: currentPath, reason: "Sem permissao ou inexistente" });
      return;
    }

    if (stats.isFile()) {
      collected.push(analyzeEntry(stats, currentPath));
      return;
    }

    if (!stats.isDirectory()) {
      return;
    }

    if (level >= depth) {
      return;
    }

    const entries = await listDirSafe(currentPath);
    if (!entries) {
      skipped.push({ path: currentPath, reason: "Nao foi possivel listar" });
      return;
    }

    for (const entry of entries) {
      if (collected.length >= maxEntries) {
        return;
      }
      await walk(path.join(currentPath, entry.name), level + 1);
    }
  }

  await walk(targetPath, 0);

  const summary = {
    totalFiles: collected.length,
    totalSize: collected.reduce((sum, item) => sum + item.size, 0),
    suspiciousCount: collected.filter((item) => item.suspicious.length).length
  };

  return {
    targetPath,
    files: collected,
    summary,
    skipped
  };
}

module.exports = { scanDirectory };
