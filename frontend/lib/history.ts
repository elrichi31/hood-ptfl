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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Regular market hours: Mon–Fri 9:30–16:00 ET. ponytail: no holiday calendar. */
export function isRegular(iso: string) {
  const { weekday, minutes } = etClock(iso);
  return weekday !== "Sat" && weekday !== "Sun" && minutes >= 570 && minutes <= 960;
}

/**
 * Trading session a snapshot belongs to (ET date): from a session's 9:30 open until the next
 * session's open — so after-hours, overnight and weekends count toward the previous session.
 * Same rule as the backend's daily_pnls, so the Today card and the Daily P&L chart agree.
 */
export function sessionOf(iso: string) {
  const { weekday, minutes } = etClock(iso);
  let day = etDay(iso);
  let wd = WEEKDAYS.indexOf(weekday);
  if (wd >= 1 && wd <= 5 && minutes >= 570) return day;
  do {
    day = new Date(new Date(`${day}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10);
    wd = (wd + 6) % 7;
  } while (wd === 0 || wd === 6);
  return day;
}

/** Session of the newest snapshot. */
export const sessionDay = (at: string[]) => (at.length ? sessionOf(at[at.length - 1]) : "");

/** Index of the last snapshot of the previous session (the base for today's change), or 0. */
export function prevCloseIndex(at: string[]) {
  const day = sessionDay(at);
  for (let i = at.length - 1; i >= 0; i--) if (sessionOf(at[i]) < day) return i;
  return 0;
}

/** Last price before the latest session and the last 7 days of prices, per symbol, from the snapshot history. */
export function priceContext(h: Hist | undefined, symbol: string) {
  const s = h?.symbols[symbol];
  if (!h || !s || !h.at.length) return { prevClose: null, week: [] as number[] };
  const day = sessionDay(h.at);
  let prevClose: number | null = null;
  for (let i = h.at.length - 1; i >= 0; i--) {
    if (sessionOf(h.at[i]) < day && s.price[i] != null) {
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
  symbols: Record<string, { qty: (number | null)[]; price: (number | null)[] }>;
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
