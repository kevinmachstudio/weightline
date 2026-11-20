export const MAX_CENTS = 99_999_999_999_999;
export const MAX_HOLDINGS = 60;
const STARTER_NAMES = ["$A", "$B", "$C", "$D", "$E", "$F", "$G"];
const BASIS_POINTS = 10_000n;

const sum = (values) => values.reduce((total, value) => total + value, 0);
const validAmount = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_CENTS;
const validReturn = (value) => Number.isSafeInteger(value) && value >= -10_000;

export function parseMoney(value) {
  const match = String(value).trim().match(/^\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*([kKmM])?$/);
  if (!match) return null;
  const [dollars, fraction = ""] = match[1].replaceAll(",", "").split(".");
  const digits = { k: 5, m: 8 }[match[2]?.toLowerCase()] ?? 2;
  if (fraction.slice(digits).match(/[1-9]/)) return null;
  const cents = Number((dollars || "0") + fraction.slice(0, digits).padEnd(digits, "0"));
  return validAmount(cents) ? cents : null;
}

export function parseReturn(value) {
  const text = value.trim().replace(/^−/, "-");
  if (!text) return 0;
  const match = text.match(/^([+-]?)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?|\.\d{1,2})\s*%?$/);
  if (!match) return null;
  const [whole, fraction = ""] = match[2].replaceAll(",", "").split(".");
  const basisPoints = Number(match[1] + (whole || "0") + fraction.padEnd(2, "0"));
  return validReturn(basisPoints) ? basisPoints || 0 : null;
}

// Divide an integer total proportionally and give leftover units to the
// largest remainders. Every result, including dollar totals, sums exactly.
function split(total, weights) {
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

export function createState(prices = STARTER_NAMES.map(() => 0)) {
  return {
    version: 3,
    currentLabel: "Current reference",
    holdings: STARTER_NAMES.map((name, index) => ({
      id: "asset-" + index, name, price: prices[index], current: 0, returnBps: 0,
    })),
  };
}

export function readSeed(hash) {
  if (!hash.startsWith("#start=")) return null;
  const prices = hash.slice(7).split(",").map(parseMoney);
  if (prices.length !== STARTER_NAMES.length || !prices.every(validAmount)) return null;
  return prices;
}

export function readState(raw) {
  if (!raw) return null;
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return null;
  }
  const validLabel = (value, length) => typeof value === "string" && value.trim().length > 0 && value.length <= length;
  if (![1, 2, 3].includes(state?.version) || !validLabel(state.currentLabel, 32)
      || !Array.isArray(state.holdings) || state.holdings.length > MAX_HOLDINGS) return null;
  const ids = new Set();
  const holdings = [];
  for (const row of state.holdings) {
    if (!row || !validLabel(row.id, 60) || ids.has(row.id) || !validLabel(row.name, 28)) return null;
    const price = state.version === 1 ? row.current : row.price;
    const current = state.version === 1 ? 0 : row.current;
    const returnBps = state.version === 3 ? row.returnBps : 0;
    if (!validAmount(price) || !validAmount(current) || !validReturn(returnBps)) return null;
    ids.add(row.id);
    holdings.push({ id: row.id, name: row.name, price, current, returnBps });
  }
  return overLimit(holdings) ? null : { version: 3, currentLabel: state.currentLabel, holdings };
}

function futureCents(amount, returnBps) {
  const scaled = BigInt(amount) * (BASIS_POINTS + BigInt(returnBps));
  return (scaled + BASIS_POINTS / 2n) / BASIS_POINTS;
}

export function overLimit(holdings) {
  if (sum(holdings.map(({ current }) => current)) > MAX_CENTS) return "current";
  const future = holdings.reduce((total, row) => total + futureCents(row.current, row.returnBps), 0n);
  if (future > BigInt(MAX_CENTS)) return "future";
  return holdings.some((row) => futureCents(row.price, row.returnBps) > BigInt(MAX_CENTS)) ? "price" : null;
}

export function calculate(state) {
  const current = sum(state.holdings.map((holding) => holding.current));
  const projected = state.holdings.map((row) => Number(futureCents(row.current, row.returnBps)));
  const future = sum(projected);
  const rows = state.holdings.map((holding, index) => ({
    ...holding,
    currentShare: current ? holding.current / current : 0,
    futurePrice: Number(futureCents(holding.price, holding.returnBps)),
    future: projected[index],
    futureShare: future ? projected[index] / future : 0,
  }));
  return { current, future, rows };
}

export function resizeHoldings(holdings, amount) {
  const portions = split(amount, holdings.map((holding) => holding.current));
  return holdings.map((holding, index) => ({ ...holding, current: portions[index] }));
}
