import {
  UNITS, MAX_HOLDINGS, MAX_CENTS, calculate, createState, matchCurrent, parseMoney,
  parsePercent, readSeed, readState, removeHolding, setCurrentTotal, setTargetAmount,
  setTargetWeight, sum, totals,
} from "./model.mjs";

const $ = (id) => document.getElementById(id);
const key = "weightline.portfolio.v2";
const legacyKey = "weightline.portfolio.v1";
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
const formatGap = (change) => change > 0
  ? "+" + formatMoney(change)
  : change < 0 ? "−" + formatMoney(-change) : "—";
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
    const stored = readState(localStorage.getItem(key));
    if (stored) return { state: stored, migrated: false };
    const legacy = readState(localStorage.getItem(legacyKey));
    if (legacy) return { state: legacy, migrated: true };
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

function setGap(node, gap) {
  node.textContent = formatGap(gap);
  node.dataset.direction = gap > 0 ? "increase" : gap < 0 ? "decrease" : "none";
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
    share: chartMode === "current" ? row.currentShare : row.targetShare,
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
  const target = chartMode === "target";
  const amount = target ? view.target : view.current;
  $("show-current").setAttribute("aria-pressed", !target);
  $("show-target").setAttribute("aria-pressed", target);
  $("chart-label").textContent = target ? "Target mix" : "Current mix";
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
    const hasMix = target ? view.hasTargetMix : view.current > 0;
    value.textContent = hasMix ? formatWeight(target ? row.targetShare : row.currentShare) : "—";
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

function refreshTable() {
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
    const targetInput = node.querySelector('[data-key="target"]');
    const weightInput = node.querySelector('[data-key="weight"]');
    for (const [input, label] of [
      [priceInput, "Price"], [currentInput, "Holdings ($)"],
      [targetInput, "Target amount"], [weightInput, "Target percentage"],
    ]) input.setAttribute("aria-label", label + " for " + row.name);
    renderCell(priceInput, formatMoney(row.price));
    renderCell(currentInput, formatMoney(row.current));
    renderCell(targetInput, formatMoney(row.target));
    renderCell(weightInput, view.hasTargetMix ? formatWeight(row.targetShare) : "—");
    node.querySelector(".current-weight").textContent = view.current ? formatWeight(row.currentShare) : "—";
    setGap(node.querySelector(".gap"), row.gap);
  });

  const hasRows = view.rows.length > 0;
  $("empty").hidden = hasRows;
  $("totals").hidden = !hasRows;
  $("sum-current").textContent = formatMoney(view.current);
  $("sum-current-percent").textContent = view.current ? "100.00%" : "—";
  $("sum-target").textContent = formatMoney(sum(view.rows.map(({ target }) => target)));
  $("sum-target-percent").textContent = view.hasTargetMix ? "100.00%" : "—";
  setGap($("sum-gap"), view.target - view.current);
  $("match").disabled = !view.current;
  $("add").disabled = view.rows.length >= MAX_HOLDINGS;
}

function refresh() {
  view = calculate(state);
  $("current-label").textContent = state.currentLabel;
  $("target-label").textContent = state.targetLabel;
  $("current-total").textContent = formatMoney(view.current);
  $("target-total").textContent = formatMoney(view.target);
  $("current-detail").textContent = view.rows.length + (view.rows.length === 1 ? " holding" : " holdings");
  $("target-detail").textContent = state.targetBudget === null ? "Follows current total" : "Fixed target budget";
  $("drift-total").textContent = view.drift === null ? "—" : percent.format(view.drift);
  $("drift-detail").textContent = view.drift === null ? "Enter holdings amounts to compare" : "Share of portfolio to reallocate";
  refreshTable();
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

function updateCell(input) {
  const { key: field } = input.dataset;
  const id = input.closest("tr").dataset.id;
  const row = state.holdings.find((holding) => holding.id === id);
  const raw = input.value;
  if (raw === input.dataset.display) return;
  const amount = field === "weight" ? parsePercent(raw) : parseMoney(raw);
  if (amount === null) {
    reportInputError(input, field === "weight" ? "Enter a target between 0% and 100%, with up to two decimal places." : moneyError);
    return;
  }

  const values = totals(state);
  if (field === "price") row.price = amount;
  if (field === "current") {
    if (values.current - row.current + amount > MAX_CENTS) {
      reportInputError(input, "The current portfolio total exceeds " + formatMoney(MAX_CENTS) + ".");
      return;
    }
    row.current = amount;
  }
  if (field === "weight") {
    if (state.holdings.length === 1 && amount !== UNITS) {
      reportInputError(input, "A single holding represents 100% of the target.");
      return;
    }
    setTargetWeight(state, id, amount);
  }
  if (field === "target") {
    if (amount > values.target) {
      reportInputError(input, "Increase the target reference total before assigning this amount.");
      return;
    }
    if (state.holdings.length === 1 && amount !== values.target) {
      reportInputError(input, "A single holding represents the entire target budget.");
      return;
    }
    if (values.target > 0) setTargetAmount(state, id, amount);
  }
  save();
}

$("rows").addEventListener("change", (event) => {
  if (event.target.matches("input")) updateCell(event.target);
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
    const isCurrent = mode === "current";
    $("editor-title").textContent = isCurrent ? "Edit current reference" : "Edit target reference";
    field("Reference name", "name", isCurrent ? state.currentLabel : state.targetLabel, { limit: 32 });
    const amount = field("Portfolio total", "amount", formatMoney(view[mode]), { money: true });
    if (isCurrent) {
      amount.disabled = !view.rows.length;
      fieldInfo("Changing the total scales the holdings amounts in proportion to their current values.");
    } else {
      const preference = document.createElement("label");
      preference.className = "check-label";
      const follow = document.createElement("input");
      follow.type = "checkbox";
      follow.name = "follow";
      follow.checked = state.targetBudget === null;
      amount.disabled = follow.checked;
      follow.addEventListener("change", () => { amount.disabled = follow.checked; });
      preference.append(follow, "Use the current portfolio total");
      editorFields.append(preference);
      fieldInfo("Changing the target budget updates target dollar amounts using your saved target percentages.");
    }
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
  if (mode === "current") {
    state.currentLabel = name;
    if (amount !== null && amount !== view.current) setCurrentTotal(state, amount);
  } else if (mode === "target") {
    state.targetLabel = name;
    state.targetBudget = data.has("follow") ? null : amount;
  } else {
    const existing = state.holdings.find((row) => row.id === id);
    const price = parseMoney(data.get("price"));
    if (price === null) return formError(moneyError);
    if (view.current - (existing?.current ?? 0) + amount > MAX_CENTS) {
      return formError("The current portfolio total exceeds " + formatMoney(MAX_CENTS) + ".");
    }
    if (existing) {
      existing.name = name;
      existing.price = price;
      existing.current = amount;
    } else {
      if (state.holdings.length >= MAX_HOLDINGS) return formError("The portfolio can hold up to " + MAX_HOLDINGS + " entries.");
      state.holdings.push({ id: crypto.randomUUID(), name, price, current: amount, weight: state.holdings.length ? 0 : UNITS });
    }
  }
  editor.close();
  save();
});

$("remove").addEventListener("click", (event) => {
  if (!draft?.confirmRemove) {
    draft.confirmRemove = true;
    event.currentTarget.textContent = "Confirm removal";
    return;
  }
  removeHolding(state, draft.id);
  editor.close();
  save();
  $("add").focus();
  notify("Holding removed.");
});

$("add").addEventListener("click", () => openEditor("add"));
$("edit-current").addEventListener("click", () => openEditor("current"));
$("edit-target").addEventListener("click", () => openEditor("target"));
$("close").addEventListener("click", () => editor.close());
$("cancel").addEventListener("click", () => editor.close());
$("rows").addEventListener("click", (event) => {
  if (event.target.closest(".holding-name")) openEditor("holding", event.target.closest("tr").dataset.id);
});
$("match").addEventListener("click", () => {
  matchCurrent(state);
  save();
  notify("Target percentages now match the current mix.");
});
for (const mode of ["current", "target"]) {
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
