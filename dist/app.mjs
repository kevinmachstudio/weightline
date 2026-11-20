import {
  MAX_HOLDINGS, MAX_CENTS, calculate, createState, overLimit, parseMoney,
  parseReturn, readSeed, readState, resizeHoldings,
} from "./model.mjs";

const $ = (id) => document.getElementById(id);
const key = "weightline.portfolio.v3";
const legacyKeys = ["weightline.portfolio.v2", "weightline.portfolio.v1"];
const moneyWhole = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});
const moneyCents = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const compact = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("en-US", {
  style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const signedPercent = new Intl.NumberFormat("en-US", {
  style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 2,
});
const palettes = [
  ["#7465ee", "#eeebff", "#4d3ab8"],
  ["#ed9974", "#fff0e9", "#8f431d"],
  ["#48ad9a", "#e4f6ef", "#11614f"],
  ["#d47daa", "#fbeaf4", "#8d3e69"],
  ["#5f98df", "#eaf3ff", "#275a99"],
  ["#8b7bef", "#eeebff", "#4e3fb6"],
  ["#35287b", "#eae5fc", "#453389"],
  ["#a19032", "#fbf4cd", "#685810"],
  ["#7582ac", "#eef0f8", "#444e76"],
];

const formatMoney = (cents) => (cents % 100 ? moneyCents : moneyWhole).format(cents / 100);
const formatWeight = (share) => {
  if (share > 0 && share < .00005) return "<0.01%";
  if (share < 1 && share > .99995) return ">99.99%";
  return percent.format(share);
};
const moneyError = "Enter a dollar amount from $0 to " + formatMoney(MAX_CENTS) + ".";
const returnError = "Enter a gain or loss of at least −100%, with up to two decimal places.";
const canvas = $("mix-canvas");
const editor = $("editor");
const editorFields = $("editor-fields");
const rowNodes = new Map();
let chartMode = "current";
let draft = null;
let toastTimeout;

function showSavedState(saved) {
  const status = $("save-status");
  status.textContent = saved ? "Saved in this browser" : "Browser storage unavailable";
  status.toggleAttribute("data-error", !saved);
}

function loadState() {
  try {
    for (const storageKey of [key, ...legacyKeys]) {
      const stored = readState(localStorage.getItem(storageKey));
      if (stored) return { state: stored, migrated: storageKey !== key };
    }
  } catch {
    showSavedState(false);
  }
  return null;
}

const stored = loadState();
let hasPortfolio = Boolean(stored);
let state = stored?.state ?? createState();
let view = calculate(state);

function persist() {
  hasPortfolio = true;
  try {
    localStorage.setItem(key, JSON.stringify(state));
    showSavedState(true);
  } catch {
    showSavedState(false);
  }
}

function applySetup() {
  if (!window.location.hash.startsWith("#start=")) return;
  const seed = readSeed(window.location.hash);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (seed && !hasPortfolio) {
    state = createState(seed);
    save();
  }
}

function notify(message) {
  const toast = $("toast");
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.hidden = false;
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 3400);
}

function draw() {
  const size = canvas.clientWidth;
  if (!size) return;
  const resolution = window.devicePixelRatio || 1;
  const pixels = Math.round(size * resolution);
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(pixels / size, 0, 0, pixels / size, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const center = size / 2;

  for (let index = 0; index < 48; index++) {
    const angle = index / 48 * 2 * Math.PI;
    const outer = size * .475;
    const inner = outer - (index % 4 === 0 ? 6 : 3);
    ctx.beginPath();
    ctx.moveTo(center + Math.cos(angle) * inner, center + Math.sin(angle) * inner);
    ctx.lineTo(center + Math.cos(angle) * outer, center + Math.sin(angle) * outer);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#dad9eb";
    ctx.stroke();
  }

  const radius = size * .361;
  ctx.lineWidth = size * .105;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = "#eeedf7";
  ctx.stroke();

  const segments = view.rows.map((row, index) => ({
    share: chartMode === "current" ? row.currentShare : row.futureShare,
    color: palettes[index % palettes.length][0],
  })).filter(({ share }) => share > 0);
  let angle = -Math.PI / 2;
  for (const { share, color } of segments) {
    const span = share * 2 * Math.PI;
    const gap = segments.length === 1 ? 0 : Math.min(.021, span * .15);
    ctx.beginPath();
    ctx.arc(center, center, radius, angle + gap, angle + span - gap);
    ctx.strokeStyle = color;
    ctx.stroke();
    angle += span;
  }
}

function refreshChart() {
  const future = chartMode === "future";
  const amount = view[chartMode];
  $("show-current").setAttribute("aria-pressed", !future);
  $("show-future").setAttribute("aria-pressed", future);
  $("chart-label").textContent = future ? "Future mix" : "Current mix";
  $("chart-value").textContent = amount >= 100_000_000 ? compact.format(amount / 100) : formatMoney(amount);
  const legend = $("legend");
  legend.replaceChildren();
  view.rows.forEach((row, index) => {
    const item = document.createElement("li");
    const dot = document.createElement("span");
    const name = document.createElement("span");
    const value = document.createElement("strong");
    dot.className = "dot";
    dot.style.backgroundColor = palettes[index % palettes.length][0];
    dot.setAttribute("aria-hidden", "true");
    name.className = "legend-name";
    name.textContent = row.name;
    value.textContent = amount ? formatWeight(future ? row.futureShare : row.currentShare) : "—";
    item.append(dot, name, value);
    legend.append(item);
  });
  if (!view.rows.length) {
    const item = document.createElement("li");
    item.className = "legend-empty";
    item.textContent = "No holdings yet";
    legend.append(item);
  }
  draw();
}

function renderCell(input, value) {
  input.dataset.display = value;
  if (input !== document.activeElement) input.value = value;
}

function refreshTable(preview) {
  const body = $("rows");
  for (const [id, node] of rowNodes) {
    if (state.holdings.some((row) => row.id === id)) continue;
    node.remove();
    rowNodes.delete(id);
  }
  view.rows.forEach((row, index) => {
    let node = rowNodes.get(row.id);
    if (!node) {
      node = $("row-template").content.firstElementChild.cloneNode(true);
      node.dataset.id = row.id;
      rowNodes.set(row.id, node);
      body.append(node);
    }
    const [, tint, ink] = palettes[index % palettes.length];
    const mark = node.querySelector(".asset-mark");
    mark.textContent = Array.from(row.name.replace(/^\$/, ""))[0]?.toUpperCase() || "$";
    mark.style.backgroundColor = tint;
    mark.style.color = ink;
    node.querySelector(".asset-name").textContent = row.name;
    node.querySelector(".holding-name").setAttribute("aria-label", "Edit " + row.name);
    const priceInput = node.querySelector('[data-key="price"]');
    const currentInput = node.querySelector('[data-key="current"]');
    const returnInput = node.querySelector('[data-key="returnBps"]');
    for (const [input, label] of [
      [priceInput, "Price"], [currentInput, "Holdings ($)"],
      [returnInput, "Gain or loss (%)"],
    ]) input.setAttribute("aria-label", label + " for " + row.name);
    renderCell(priceInput, formatMoney(row.price));
    const futurePrice = node.querySelector(".future-price");
    futurePrice.hidden = !row.price || !row.returnBps;
    futurePrice.textContent = "Future " + formatMoney(row.futurePrice);
    renderCell(currentInput, formatMoney(row.current));
    if (!preview || returnInput !== document.activeElement) renderCell(returnInput, signedPercent.format(row.returnBps / 10_000));
    returnInput.dataset.direction = row.returnBps > 0 ? "gain" : row.returnBps < 0 ? "loss" : "flat";
    node.querySelector(".current-weight").textContent = view.current ? formatWeight(row.currentShare) : "—";
    node.querySelector(".future-value").textContent = formatMoney(row.future);
    node.querySelector(".future-weight").textContent = view.future ? formatWeight(row.futureShare) : "—";
  });

  const hasRows = view.rows.length > 0;
  $("empty").hidden = hasRows;
  $("totals").hidden = !hasRows;
  $("sum-current").textContent = formatMoney(view.current);
  $("sum-current-percent").textContent = view.current ? "100.00%" : "—";
  $("sum-future").textContent = formatMoney(view.future);
  $("sum-future-percent").textContent = view.future ? "100.00%" : "—";
  $("add").disabled = view.rows.length >= MAX_HOLDINGS;
}

function refresh(portfolio = state) {
  view = calculate(portfolio);
  $("current-label").textContent = state.currentLabel;
  $("current-total").textContent = formatMoney(view.current);
  $("future-total").textContent = formatMoney(view.future);
  $("current-detail").textContent = view.rows.length + (view.rows.length === 1 ? " holding" : " holdings");
  refreshTable(portfolio !== state);
  refreshChart();
}

function save() {
  persist();
  refresh();
}

function reportInputError(input, message) {
  input.setAttribute("aria-invalid", "true");
  input.title = message;
  notify(message);
}

function portfolioError(holdings) {
  const limit = overLimit(holdings);
  if (limit === "price") return "A future price exceeds " + formatMoney(MAX_CENTS) + ".";
  return limit ? "The " + limit + " portfolio total exceeds " + formatMoney(MAX_CENTS) + "." : null;
}

function previewCell(input) {
  const { key: field } = input.dataset;
  const id = input.closest("tr").dataset.id;
  const isReturn = field === "returnBps";
  const value = isReturn ? parseReturn(input.value) : parseMoney(input.value);
  if (value === null) return { error: isReturn ? returnError : moneyError };
  const holdings = state.holdings.map((row) => row.id === id ? { ...row, [field]: value } : row);
  return { holdings, error: portfolioError(holdings) };
}

$("rows").addEventListener("input", (event) => {
  const input = event.target;
  if (!input.matches('[data-key="returnBps"]')) return;
  const { holdings, error } = previewCell(input);
  refresh(error ? state : { ...state, holdings });
});
$("rows").addEventListener("change", (event) => {
  const input = event.target;
  if (!input.matches("input") || input.value === input.dataset.display) return;
  const { holdings, error } = previewCell(input);
  if (error) {
    refresh();
    reportInputError(input, error);
    return;
  }
  state.holdings = holdings;
  save();
});
$("rows").addEventListener("focusin", (event) => {
  if (event.target.matches("input")) {
    event.target.removeAttribute("aria-invalid");
    event.target.removeAttribute("title");
    event.target.select();
  }
});
$("rows").addEventListener("focusout", (event) => {
  const input = event.target;
  if (input.matches("input")) input.value = input.dataset.display;
});
$("rows").addEventListener("keydown", (event) => {
  if (!event.target.matches("input")) return;
  if (event.key === "Enter") {
    event.preventDefault();
    event.target.blur();
  }
  if (event.key === "Escape") {
    event.target.value = event.target.dataset.display;
    refresh();
    event.target.blur();
  }
});

function field(label, name, value, options = {}) {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  const input = document.createElement("input");
  input.name = name;
  input.value = value;
  input.autocomplete = "off";
  input.required = true;
  if (options.limit) input.maxLength = options.limit;
  if (options.money) {
    input.inputMode = "decimal";
    input.spellcheck = false;
  }
  wrapper.append(input);
  editorFields.append(wrapper);
  return input;
}

function fieldInfo(text) {
  const note = document.createElement("p");
  note.className = "field-info";
  note.textContent = text;
  editorFields.append(note);
}

function openEditor(mode, id) {
  draft = { mode, id };
  editorFields.replaceChildren();
  $("form-error").hidden = true;
  $("remove").hidden = mode !== "holding";
  $("remove").textContent = "Remove holding";
  $("submit").textContent = mode === "add" ? "Add holding" : "Save changes";
  if (mode === "add" || mode === "holding") {
    const row = state.holdings.find((holding) => holding.id === id);
    $("editor-title").textContent = mode === "add" ? "Add holding" : "Edit holding";
    field("Holding name", "name", row?.name ?? "", { limit: 28 });
    field("Price", "price", formatMoney(row?.price ?? 0), { money: true });
    field("Holdings ($)", "amount", formatMoney(row?.current ?? 0), { money: true });
  } else {
    $("editor-title").textContent = "Edit current reference";
    field("Reference name", "name", state.currentLabel, { limit: 32 });
    const amount = field("Portfolio total", "amount", formatMoney(view.current), { money: true });
    amount.disabled = !view.rows.length;
    fieldInfo("Changing the total scales the holdings amounts in proportion to their current values.");
  }
  editor.showModal();
  const name = editorFields.querySelector('[name="name"]');
  name.focus();
  name.select();
}

function formError(message) {
  $("form-error").textContent = message;
  $("form-error").hidden = false;
}

$("editor-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = data.get("name")?.trim();
  const amount = data.has("amount") ? parseMoney(data.get("amount")) : null;
  if (!name) return formError("Enter a name.");
  if (data.has("amount") && amount === null) return formError(moneyError);

  const { mode, id } = draft;
  let holdings = state.holdings;
  if (mode === "current") {
    if (amount !== null && amount !== view.current) holdings = resizeHoldings(holdings, amount);
  } else {
    const price = parseMoney(data.get("price"));
    if (price === null) return formError(moneyError);
    if (mode === "holding") {
      holdings = holdings.map((row) => row.id === id ? { ...row, name, price, current: amount } : row);
    } else {
      if (holdings.length >= MAX_HOLDINGS) return formError("The portfolio can hold up to " + MAX_HOLDINGS + " entries.");
      holdings = [...holdings, { id: crypto.randomUUID(), name, price, current: amount, returnBps: 0 }];
    }
  }
  const error = portfolioError(holdings);
  if (error) return formError(error);
  if (mode === "current") state.currentLabel = name;
  state.holdings = holdings;
  editor.close();
  save();
});

$("remove").addEventListener("click", (event) => {
  if (!draft?.confirmRemove) {
    draft.confirmRemove = true;
    event.currentTarget.textContent = "Confirm removal";
    return;
  }
  state.holdings = state.holdings.filter((holding) => holding.id !== draft.id);
  editor.close();
  save();
  $("add").focus();
  notify("Holding removed.");
});

$("add").addEventListener("click", () => openEditor("add"));
$("edit-current").addEventListener("click", () => openEditor("current"));
$("close").addEventListener("click", () => editor.close());
$("cancel").addEventListener("click", () => editor.close());
$("rows").addEventListener("click", (event) => {
  if (event.target.closest(".holding-name")) openEditor("holding", event.target.closest("tr").dataset.id);
});
for (const mode of ["current", "future"]) {
  $("show-" + mode).addEventListener("click", () => {
    chartMode = mode;
    refreshChart();
  });
}

window.addEventListener("storage", (event) => {
  if (event.key !== key) return;
  try {
    const updated = readState(event.newValue);
    if (updated) {
      state = updated;
      hasPortfolio = true;
      refresh();
    }
  } catch {
    // Keep the open portfolio if another tab has written an invalid value.
  }
});
new ResizeObserver(draw).observe(canvas);
window.addEventListener("hashchange", applySetup);
if (stored?.migrated) persist();
refresh();
applySetup();
