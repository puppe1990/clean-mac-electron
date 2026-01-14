const state = {
  targets: [],
  files: [],
  filtered: [],
  selected: new Set(),
  currentScope: "-",
  disk: null,
  apps: []
};

const targetList = document.getElementById("target-list");
const fileTable = document.getElementById("file-table");
const summaryTotal = document.getElementById("summary-total");
const summarySize = document.getElementById("summary-size");
const summaryTotalSpace = document.getElementById("summary-total-space");
const summaryUsedSpace = document.getElementById("summary-used-space");
const summarySuspicious = document.getElementById("summary-suspicious");
const summaryScope = document.getElementById("summary-scope");
const statusText = document.getElementById("status-text");
const storageName = document.getElementById("storage-name");
const storageAvailable = document.getElementById("storage-available");
const appsSummary = document.getElementById("apps-summary");
const appsList = document.getElementById("apps-list");

const btnRefresh = document.getElementById("btn-refresh");
const btnSelectFolder = document.getElementById("btn-select-folder");
const btnClear = document.getElementById("btn-clear");
const btnDelete = document.getElementById("btn-delete");
const btnListApps = document.getElementById("btn-list-apps");

const filterSize = document.getElementById("filter-size");
const filterSuspicious = document.getElementById("filter-suspicious");
const filterSort = document.getElementById("filter-sort");
const filterExtension = document.getElementById("filter-extension");
const sortableHeaders = Array.from(document.querySelectorAll("th.sortable"));

const tableSort = {
  key: "size",
  direction: "desc"
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value < 10 && index > 0 ? 1 : 0)} ${units[index]}`;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function updateSummary(files) {
  const totalSize = files.reduce((sum, item) => sum + item.size, 0);
  summaryTotal.textContent = files.length;
  summarySize.textContent = formatBytes(totalSize);
  summaryTotalSpace.textContent = state.disk ? formatBytes(state.disk.total) : "-";
  summaryUsedSpace.textContent = state.disk ? formatBytes(state.disk.used) : "-";
  summarySuspicious.textContent = files.filter((item) => item.suspicious.length).length;
  summaryScope.textContent = state.currentScope;
  updateStorage();
}

function updateStatus(message) {
  statusText.textContent = message;
}

function updateStorage() {
  const diskName = state.disk?.name || "Macintosh HD";
  storageName.textContent = diskName;

  if (!state.disk) {
    storageAvailable.textContent = "-";
    return;
  }

  const freeLabel = formatBytes(state.disk.free);
  const totalLabel = formatBytes(state.disk.total);
  storageAvailable.textContent = `${freeLabel} disponiveis de ${totalLabel}`;
}

function renderApps() {
  appsList.innerHTML = "";
  if (!state.apps.length) {
    const empty = document.createElement("p");
    empty.className = "apps-empty";
    empty.textContent = "Nenhum app encontrado.";
    appsList.appendChild(empty);
    return;
  }

  state.apps.forEach((app) => {
    const item = document.createElement("div");
    item.className = "app-item";

    const name = document.createElement("strong");
    name.textContent = app.name;

    const path = document.createElement("span");
    path.textContent = app.path;

    item.append(name, path);
    appsList.appendChild(item);
  });
}

function renderTargets() {
  targetList.innerHTML = "";
  state.targets.forEach((target) => {
    const card = document.createElement("div");
    card.className = "target-card";

    const title = document.createElement("strong");
    title.textContent = target.label;

    const pathInfo = document.createElement("span");
    pathInfo.textContent = target.path;

    const summary = document.createElement("span");
    summary.textContent = `${target.summary.totalFiles} arquivos - ${formatBytes(target.summary.totalSize)}`;

    const action = document.createElement("button");
    action.className = "ghost";
    action.textContent = "Analisar";
    action.addEventListener("click", () => scanTarget(target.path, target.label));

    card.append(title, pathInfo, summary, action);
    targetList.appendChild(card);
  });
}

function renderTable() {
  fileTable.innerHTML = "";

  if (!state.filtered.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "Nenhum arquivo encontrado com os filtros atuais.";
    cell.style.color = "var(--text-muted)";
    row.appendChild(cell);
    fileTable.appendChild(row);
    return;
  }

  state.filtered.forEach((item) => {
    const row = document.createElement("tr");

    const selectCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selected.has(item.path);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selected.add(item.path);
      } else {
        state.selected.delete(item.path);
      }
    });
    selectCell.appendChild(checkbox);

    const nameCell = document.createElement("td");
    nameCell.textContent = item.name;

    const sizeCell = document.createElement("td");
    sizeCell.textContent = item.sizeLabel;

    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(item.modifiedAt);

    const originCell = document.createElement("td");
    originCell.textContent = item.origin;

    const alertCell = document.createElement("td");
    if (item.suspicious.length) {
      const pill = document.createElement("span");
      pill.className = "status-pill";
      pill.textContent = item.suspicious[0];
      alertCell.appendChild(pill);
    } else {
      alertCell.textContent = "-";
    }

    row.append(selectCell, nameCell, sizeCell, dateCell, originCell, alertCell);
    fileTable.appendChild(row);
  });
}

function applyFilters() {
  const minSizeMB = Number(filterSize.value);
  const suspiciousOnly = filterSuspicious.value === "only";
  const extensionQuery = filterExtension.value.trim().toLowerCase();

  let filtered = state.files.filter((item) => item.size / (1024 * 1024) >= minSizeMB);
  if (suspiciousOnly) {
    filtered = filtered.filter((item) => item.suspicious.length);
  }
  if (extensionQuery) {
    const normalized = extensionQuery
      .split(",")
      .map((entry) => entry.trim().replace(/^\\./, ""))
      .filter(Boolean);
    filtered = filtered.filter((item) => {
      const ext = item.name.includes(".") ? item.name.split(".").pop().toLowerCase() : "";
      return normalized.includes(ext);
    });
  }

  const sortKey = tableSort.key || filterSort.value;
  const direction = tableSort.direction === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    if (sortKey === "name") {
      return a.name.localeCompare(b.name) * direction;
    }
    if (sortKey === "date") {
      return (new Date(a.modifiedAt) - new Date(b.modifiedAt)) * direction;
    }
    if (sortKey === "origin") {
      return a.origin.localeCompare(b.origin) * direction;
    }
    return (a.size - b.size) * direction;
  });

  state.filtered = filtered;
  renderTable();
  updateSummary(filtered);
}

function updateSortHeader() {
  sortableHeaders.forEach((header) => {
    const isActive = header.dataset.sort === tableSort.key;
    header.classList.toggle("active", isActive);
    header.classList.toggle("desc", isActive && tableSort.direction === "desc");
  });
}

async function scanTarget(targetPath, label) {
  updateStatus("Analisando arquivos... isso pode levar alguns segundos.");
  btnDelete.disabled = true;
  btnClear.disabled = true;

  try {
    const result = await window.cleanerAPI.scanPath(targetPath);
    state.files = result.files;
    state.selected.clear();
    state.currentScope = label || targetPath;
    state.disk = result.disk || null;
    applyFilters();
    updateStatus(
      `Analise concluida. ${result.summary.totalFiles} arquivos encontrados em ${result.targetPath}.`
    );
  } catch (error) {
    updateStatus(`Falha na analise: ${error.message || error}`);
  } finally {
    btnDelete.disabled = false;
    btnClear.disabled = false;
  }
}

async function loadDefaults() {
  updateStatus("Carregando alvos recomendados...");
  const targets = await window.cleanerAPI.scanDefaults();
  state.targets = targets;
  renderTargets();
  updateStatus("Selecione um alvo para iniciar a analise.");
  summaryScope.textContent = "Aguardando";
  state.disk = null;
  updateSummary([]);
}

btnRefresh.addEventListener("click", () => loadDefaults());

btnSelectFolder.addEventListener("click", async () => {
  const selected = await window.cleanerAPI.openDirectoryDialog();
  if (selected) {
    scanTarget(selected, "Pasta customizada");
  }
});

btnClear.addEventListener("click", () => {
  state.selected.clear();
  renderTable();
});

btnDelete.addEventListener("click", async () => {
  const selectedItems = state.files.filter((item) => state.selected.has(item.path));
  if (!selectedItems.length) {
    updateStatus("Selecione ao menos um arquivo para mover para a Lixeira.");
    return;
  }

  const result = await window.cleanerAPI.deleteFiles(selectedItems);
  updateStatus(result.message || "Operacao concluida.");
  if (result.ok) {
    state.files = state.files.filter((item) => !state.selected.has(item.path));
    state.selected.clear();
    applyFilters();
  }
});

btnListApps.addEventListener("click", async () => {
  appsSummary.textContent = "Buscando apps instalados...";
  try {
    const apps = await window.cleanerAPI.listApps();
    state.apps = apps;
    renderApps();
    appsSummary.textContent = `${apps.length} apps encontrados no macOS.`;
  } catch (error) {
    appsSummary.textContent = `Falha ao listar apps: ${error.message || error}`;
  }
});

filterSize.addEventListener("change", applyFilters);
filterSuspicious.addEventListener("change", applyFilters);
filterSort.addEventListener("change", applyFilters);
filterExtension.addEventListener("input", applyFilters);

sortableHeaders.forEach((header) => {
  header.addEventListener("click", () => {
    const key = header.dataset.sort;
    if (tableSort.key === key) {
      tableSort.direction = tableSort.direction === "asc" ? "desc" : "asc";
    } else {
      tableSort.key = key;
      tableSort.direction = "desc";
    }
    filterSort.value = tableSort.key;
    updateSortHeader();
    applyFilters();
  });
});

loadDefaults();
updateSortHeader();
