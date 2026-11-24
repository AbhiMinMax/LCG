// Logical days: a day starts at `dayStartHour` (config, default 4) in the
// browser's local time zone, so an event at 01:30 belongs to the previous day.

export const DEFAULT_DAY_START_HOUR = 4;

export function normalizeDayStartHour(h) {
  const n = Number(h);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : DEFAULT_DAY_START_HOUR;
}

// Local calendar date (at local midnight) of the logical day containing `ts`.
export function logicalDate(ts, dayStartHour = DEFAULT_DAY_START_HOUR) {
  const d = new Date(ts);
  d.setHours(d.getHours() - normalizeDayStartHour(dayStartHour));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 'YYYY-MM-DD' key of the logical day containing `ts`.
export function logicalDayKey(ts, dayStartHour = DEFAULT_DAY_START_HOUR) {
  const d = logicalDate(ts, dayStartHour);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Whole logical days from `a` to `b` (calendar arithmetic, safe across DST).
export function logicalDaysBetween(a, b, dayStartHour = DEFAULT_DAY_START_HOUR) {
  const da = logicalDate(a, dayStartHour);
  const db = logicalDate(b, dayStartHour);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

// "added same day" / "added 1 day later" / "added N days later"
export function formatAddedLater(eventTs, writtenAt, dayStartHour = DEFAULT_DAY_START_HOUR) {
  const n = Math.max(0, logicalDaysBetween(eventTs, writtenAt, dayStartHour));
  if (n === 0) return 'added same day';
  if (n === 1) return 'added 1 day later';
  return `added ${n} days later`;
}

// Short date of an event's logical day with weekday, e.g. "Sun, Nov 8"
// (order follows the locale).
export function formatLogicalShortDate(ts, dayStartHour = DEFAULT_DAY_START_HOUR) {
  return logicalDate(ts, dayStartHour).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Full event time with weekday, e.g. "Tue, 24 Nov 2026, 10:55 pm"
// (order and wording follow the browser's locale).
export function formatFullTimestamp(ts) {
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// "Today · Tue, 24 Nov 2026, 10:55 pm", "3 days ago · Sat, …".
// Relative part only within the last week (calendar days); older events
// show the full timestamp alone.
export function formatEventTimestamp(ts, now = new Date()) {
  const date = new Date(ts);
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((todayOnly - dateOnly) / 86400000);
  const full = formatFullTimestamp(date);
  if (diffDays === 0) return `Today · ${full}`;
  if (diffDays === 1) return `Yesterday · ${full}`;
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago · ${full}`;
  return full;
}
