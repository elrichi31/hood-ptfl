/**
 * NYSE calendar, from nyse.com/markets/hours-calendars.
 * ponytail: hardcoded through 2028 — append the next year's row when NYSE publishes it.
 */
const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03',
  '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05',
  '2027-09-06', '2027-11-25', '2027-12-24',
  '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04',
  '2028-11-23', '2028-12-25',
])
/** 1:00 PM ET early closes. */
const EARLY_CLOSES = new Set(['2026-11-27', '2026-12-24', '2027-11-26', '2028-07-03', '2028-11-24'])

export const OPEN_MIN = 9 * 60 + 30

/** ET date (YYYY-MM-DD), weekday (0=Sun) and fractional minutes since ET midnight. */
export function etClock(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    min: Number(get('hour')) * 60 + Number(get('minute')) + Number(get('second')) / 60,
  }
}

export const isTradingDay = (day: string, weekday: number) =>
  weekday >= 1 && weekday <= 5 && !HOLIDAYS.has(day)

/** Minutes since ET midnight of that day's close (16:00, or 13:00 on early-close days). */
export const closeMin = (day: string) => (EARLY_CLOSES.has(day) ? 13 * 60 : 16 * 60)
