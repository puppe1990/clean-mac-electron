const fs = require("fs");

async function statSafe(targetPath) {
  try {
    return await fs.promises.stat(targetPath);
  } catch (_error) {
    return null;
  }
}

async function listDirSafe(targetPath) {
  try {
    return await fs.promises.readdir(targetPath, { withFileTypes: true });
  } catch (_error) {
    return null;
  }
}

module.exports = { statSafe, listDirSafe };
