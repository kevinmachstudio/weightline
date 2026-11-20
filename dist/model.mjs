export const UNITS = 100_000_000_000_000;
export const MAX_CENTS = UNITS - 1;
export const MAX_HOLDINGS = 60;
const STARTER_NAMES = ["$A", "$B", "$C", "$D", "$E", "$F", "$G"];

export const sum = (values) => values.reduce((total, value) => total + value, 0);
const validAmount = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_CENTS;

export function parseMoney(value) {
  const match = String(value).trim().match(/^\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*([kKmM])?$/);
  if (!match) return null;
  const [dollars, fraction = ""] = match[1].replaceAll(",", "").split(".");
  const digits = { k: 5, m: 8 }[match[2]?.toLowerCase()] ?? 2;
  if (fraction.slice(digits).match(/[1-9]/)) return null;
  const cents = Number((dollars || "0") + fraction.slice(0, digits).padEnd(digits, "0"));
  return validAmount(cents) ? cents : null;
}

export function parsePercent(value) {
  const match = String(value).trim().match(/^(\d+(?:\.\d{1,2})?|\.\d{1,2})\s*%?$/);
  if (!match || Number(match[1]) > 100) return null;
  const [whole, fraction = ""] = match[1].split(".");
  const hundredths = Number((whole || "0") + fraction.padEnd(2, "0"));
  return hundredths * (UNITS / 10_000);
}

// Divide an integer total proportionally and give leftover units to the
// largest remainders. Every result, including dollar totals, sums exactly.
export function split(total, weights) {
  if (!weights.length) return [];
  const basis = weights.some(Boolean) ? weights : weights.map(() => 1);
  const denominator = BigInt(sum(basis));
  const whole = BigInt(total);
  const portions = basis.map((weight, index) => {
    const product = BigInt(weight) * whole;
    return { index, value: Number(product / denominator), remainder: product % denominator };
  });
  const leftover = total - sum(portions.map(({ value }) => value));
  const ranked = [...portions].sort((a, b) => a.remainder === b.remainder
    ? a.index - b.index
    : a.remainder > b.remainder ? -1 : 1);
  ranked.slice(0, leftover).forEach((portion) => portion.value++);
  return portions.map(({ value }) => value);
}

export function createState(startingAmounts = STARTER_NAMES.map(() => 0)) {
  const weights = split(UNITS, startingAmounts);
  return {
    version: 1,
    currentLabel: "Current reference",
    targetLabel: "Target reference",
    targetBudget: null,
    holdings: STARTER_NAMES.map((name, index) => ({
      id: "asset-" + index, name, current: startingAmounts[index], weight: weights[index],
    })),
  };
}

export function readSeed(hash) {
  if (!hash.startsWith("#start=")) return null;
  const amounts = hash.slice(7).split(",").map(parseMoney);
  if (amounts.length !== STARTER_NAMES.length || !amounts.every(validAmount) || sum(amounts) > MAX_CENTS) return null;
  return amounts;
}

export function readState(raw) {
  if (!raw) return null;
  const state = JSON.parse(raw);
  const validLabel = (value, length) => typeof value === "string" && value.trim().length > 0 && value.length <= length;
  if (state?.version !== 1 || !validLabel(state.currentLabel, 32) || !validLabel(state.targetLabel, 32)
      || !(state.targetBudget === null || validAmount(state.targetBudget))
      || !Array.isArray(state.holdings) || state.holdings.length > MAX_HOLDINGS) return null;
  const ids = new Set();
  for (const holding of state.holdings) {
    if (!holding || !validLabel(holding.id, 60) || ids.has(holding.id) || !validLabel(holding.name, 28)
        || !validAmount(holding.current) || !Number.isSafeInteger(holding.weight)
        || holding.weight < 0 || holding.weight > UNITS) return null;
    ids.add(holding.id);
  }
  if (sum(state.holdings.map(({ current }) => current)) > MAX_CENTS
      || sum(state.holdings.map(({ weight }) => weight)) !== (state.holdings.length ? UNITS : 0)) return null;
  return state;
}

export function totals(state) {
  const current = sum(state.holdings.map((holding) => holding.current));
  return { current, target: state.targetBudget ?? current };
}

export function calculate(state) {
  const { current, target } = totals(state);
  const targetValues = split(target, state.holdings.map((holding) => holding.weight));
  const rows = state.holdings.map((holding, index) => ({
    ...holding,
    currentShare: current ? holding.current / current : 0,
    targetShare: holding.weight / UNITS,
    target: targetValues[index],
    gap: targetValues[index] - holding.current,
  }));
  const drift = current > 0 && rows.length
    ? rows.reduce((distance, row) => distance + Math.abs(row.currentShare - row.targetShare), 0) / 2
    : null;
  return { current, target, rows, drift };
}

export function setCurrentTotal(state, amount) {
  const portions = split(amount, state.holdings.map((holding) => holding.current));
  state.holdings.forEach((holding, index) => { holding.current = portions[index]; });
}

export function matchCurrent(state) {
  const weights = split(UNITS, state.holdings.map((holding) => holding.current));
  state.holdings.forEach((holding, index) => { holding.weight = weights[index]; });
}

export function setTargetWeight(state, id, weight) {
  const holding = state.holdings.find((row) => row.id === id);
  const others = state.holdings.filter((row) => row.id !== id);
  const weights = split(UNITS - weight, others.map((row) => row.weight));
  holding.weight = weight;
  others.forEach((row, index) => { row.weight = weights[index]; });
}

export function setTargetAmount(state, id, amount) {
  const view = calculate(state);
  const others = view.rows.filter((row) => row.id !== id);
  const remainder = split(view.target - amount, others.map((row) => row.weight));
  const amounts = new Map(others.map((row, index) => [row.id, remainder[index]]));
  amounts.set(id, amount);
  const weights = split(UNITS, state.holdings.map((row) => amounts.get(row.id)));
  state.holdings.forEach((row, index) => { row.weight = weights[index]; });
}

export function removeHolding(state, id) {
  state.holdings = state.holdings.filter((holding) => holding.id !== id);
  const weights = split(UNITS, state.holdings.map((holding) => holding.weight));
  state.holdings.forEach((holding, index) => { holding.weight = weights[index]; });
}
