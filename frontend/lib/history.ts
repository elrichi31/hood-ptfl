export type Hist = { at: string[]; symbols: Record<string, { price: (number | null)[] }> };

export const etDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** Minutes since midnight ET and weekday, for market-hours checks. */
function etClock(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { weekday: get("weekday"), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Regular market hours: Mon–Fri 9:30–16:00 ET. ponytail: no holiday calendar. */
export function isRegular(iso: string) {
  const { weekday, minutes } = etClock(iso);
  return weekday !== "Sat" && weekday !== "Sun" && minutes >= 570 && minutes <= 960;
}

/**
 * Index of the previous day's regular close — the last 9:30–16:00 snapshot on an earlier ET
 * calendar date than the newest one. Robinhood's documented baseline for securities ("previous
 * day's market closing (4 PM ET) prices"); its day rolls at midnight ET, same as its 1D chart.
 * Falls back to the last snapshot of an earlier date, or 0.
 */
export function prevCloseIndex(at: string[]) {
  if (!at.length) return 0;
  const today = etDay(at[at.length - 1]);
  let fallback = -1;
  for (let i = at.length - 1; i >= 0; i--) {
    if (etDay(at[i]) >= today) continue;
    if (isRegular(at[i])) return i;
    if (fallback < 0) fallback = i;
  }
  return Math.max(0, fallback);
}

/** Previous regular close price and the last 7 days of prices, per symbol, from the snapshot history. */
export function priceContext(h: Hist | undefined, symbol: string) {
  const s = h?.symbols[symbol];
  if (!h || !s || !h.at.length) return { prevClose: null, week: [] as number[] };
  const today = etDay(h.at[h.at.length - 1]);
  let prevClose: number | null = null;
  for (let i = h.at.length - 1; i >= 0; i--) {
    if (etDay(h.at[i]) < today && isRegular(h.at[i]) && s.price[i] != null) {
      prevClose = s.price[i];
      break;
    }
  }
  const since = new Date(h.at[h.at.length - 1]).getTime() - 7 * 864e5;
  const week = s.price.filter((p, i): p is number => p != null && new Date(h.at[i]).getTime() >= since);
  // ponytail: stride-sample to ~60 points; plenty for a 96px sparkline.
  const step = Math.ceil(week.length / 60) || 1;
  return { prevClose, week: week.filter((_, i) => i % step === 0 || i === week.length - 1) };
}

/** Last known price of `symbol` at or before `msAgo` before the newest snapshot (null if history is shorter). */
export function priceAgo(h: Hist | undefined, symbol: string, msAgo: number) {
  const s = h?.symbols[symbol];
  if (!h || !s || !h.at.length) return null;
  const target = new Date(h.at[h.at.length - 1]).getTime() - msAgo;
  if (new Date(h.at[0]).getTime() > target) return null;
  for (let i = h.at.length - 1; i >= 0; i--) {
    if (new Date(h.at[i]).getTime() <= target && s.price[i] != null) return s.price[i];
  }
  return null;
}

export type FullHist = Hist & {
  total: number[];
  cash: number[];
  symbols: Record<string, { type?: string; qty: (number | null)[]; price: (number | null)[] }>;
};

/** Gain of the step into snapshot i: Δ total − (Δ cash + Σ Δqty × price). */
function stepPnl(h: FullHist, i: number) {
  let flow = h.cash[i] - h.cash[i - 1];
  for (const s of Object.values(h.symbols)) {
    const dq = (s.qty[i] ?? 0) - (s.qty[i - 1] ?? 0);
    if (dq) flow += dq * (s.price[i] ?? s.price[i - 1] ?? 0);
  }
  return h.total[i] - h.total[i - 1] - flow;
}

/**
 * P&L between snapshot indexes `from` and `to` (inclusive): Δ Robinhood total minus money moved
 * in/out (Δ cash + Σ Δqty × price). Same formula as the backend's daily_pnls, so the Today card,
 * the value chart and the Daily P&L chart all agree.
 */
export function flowAdjustedPnl(h: FullHist, from: number, to = h.at.length - 1) {
  let pnl = 0;
  for (let i = from + 1; i <= to; i++) pnl += stepPnl(h, i);
  return pnl;
}

/** Same P&L split by when it happened: regular hours vs after-hours/overnight/pre-market. */
export function splitPnl(h: FullHist, from: number, to = h.at.length - 1) {
  let regular = 0;
  let extended = 0;
  for (let i = from + 1; i <= to; i++) {
    if (isRegular(h.at[i])) regular += stepPnl(h, i);
    else extended += stepPnl(h, i);
  }
  return { regular, extended };
}

/** Crypto part of step i: qty held × price move (crypto trades 24/7, so it has its own baseline). */
function cryptoStep(h: FullHist, i: number) {
  let pnl = 0;
  for (const s of Object.values(h.symbols)) {
    if (s.type !== "crypto") continue;
    const q = s.qty[i - 1];
    const a = s.price[i - 1];
    const b = s.price[i];
    if (q != null && a != null && b != null) pnl += q * (b - a);
  }
  return pnl;
}

/**
 * Today's return the way Robinhood documents it (support article "Using charts"):
 * securities vs the previous session's 4 PM ET close, crypto vs 12 AM in the viewer's time
 * zone, deposits/withdrawals excluded. `tz` is the viewer's IANA zone.
 */
export function robinhoodToday(h: FullHist, tz: string) {
  const n = h.at.length;
  const secBase = prevCloseIndex(h.at);
  const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
  const today = localDay(h.at[n - 1]);
  let cryptoBase = 0;
  for (let i = n - 1; i >= 0; i--) {
    if (localDay(h.at[i]) < today) {
      cryptoBase = i;
      break;
    }
  }
  let securities = 0;
  let crypto = 0;
  for (let i = 1; i < n; i++) {
    const c = cryptoStep(h, i);
    if (i > secBase) securities += stepPnl(h, i) - c;
    if (i > cryptoBase) crypto += c;
  }
  const base = h.total[secBase];
  return { pnl: securities + crypto, securities, crypto, pct: base ? ((securities + crypto) / base) * 100 : null };
}

/**
 * Previous close for a position's "today" change: Robinhood's official close from the quote when
 * it's from an earlier ET date than now, else the snapshot-based one (crypto, or quote not rolled).
 */
export function prevCloseFor(
  h: Hist | undefined,
  p: { symbol: string; prevClose?: number; prevCloseDate?: string }
) {
  const today = h?.at.length ? etDay(h.at[h.at.length - 1]) : etDay(new Date().toISOString());
  if (p.prevClose && p.prevCloseDate && p.prevCloseDate < today) return p.prevClose;
  return priceContext(h, p.symbol).prevClose;
}
