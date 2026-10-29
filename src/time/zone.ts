// Wall-clock time in a site's IANA time zone, through Intl (ICU in Hermes and Node). "Naive" milliseconds encode a
// local date and time as if it were UTC, so arithmetic on local dates and times is plain integer arithmetic.
// The rules of nonexistent and repeated local times are Q5 (waypost-schema docs/decisions.md, "DST").

export const MINUTE_MS = 60_000;
export const DAY_MS = 1440 * MINUTE_MS;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let format = formatters.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatters.set(timeZone, format);
  }
  return format;
}

/** The wall-clock time (naive ms) of a UTC instant in the time zone. */
export function naiveOf(utcMs: number, timeZone: string): number {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const { type, value } of formatter(timeZone).formatToParts(new Date(utcMs))) parts[type] = Number(value);
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = parts;
  // Some ICU versions write midnight as 24 even with h23.
  return Date.UTC(year, month - 1, day, hour % 24, minute, second) + (utcMs % 1000 + 1000) % 1000;
}

/**
 * The UTC instant of a wall-clock time (naive ms, whole minutes): if it occurs twice (autumn), the first occurrence;
 * if it does not exist (spring gap), the first valid instant after the gap, i.e. the moment of the change.
 */
export function resolveLocal(naive: number, timeZone: string): number {
  const offsets = [...new Set([-DAY_MS, 0, DAY_MS].map((d) => naiveOf(naive + d, timeZone) - (naive + d)))];
  const matches = offsets.map((offset) => naive - offset).filter((utc) => naiveOf(utc, timeZone) === naive);
  if (matches.length > 0) return Math.min(...matches);
  // Nonexistent: binary search (minute precision) for the first instant whose wall-clock time is after it.
  let lo = naive - Math.max(...offsets);
  let hi = naive - Math.min(...offsets);
  while (hi - lo > MINUTE_MS) {
    const mid = lo + Math.floor((hi - lo) / 2 / MINUTE_MS) * MINUTE_MS;
    if (naiveOf(mid, timeZone) > naive) hi = mid;
    else lo = mid;
  }
  return hi;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Naive ms of a local date (YYYY-MM-DD) at midnight. */
export function parseLocalDate(date: string): number {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(date);
  if (match === null) throw new Error(`Invalid local date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** YYYY-MM-DD of naive ms. */
export function formatLocalDate(naive: number): string {
  return new Date(naive).toISOString().slice(0, 10);
}

/** The local date (YYYY-MM-DD) of a UTC instant in the time zone. */
export function localDateOf(utcMs: number, timeZone: string): string {
  return formatLocalDate(naiveOf(utcMs, timeZone));
}

/** Minutes after midnight of a local time HH:MM. */
export function parseLocalTime(time: string): number {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(time);
  if (match === null) throw new Error(`Invalid local time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** HH:MM of minutes after a midnight (may be over a day). */
export function formatLocalTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

/** The local time (HH:MM) of a UTC instant in the time zone. */
export function localTimeOf(utcMs: number, timeZone: string): string {
  return formatLocalTime(Math.floor((naiveOf(utcMs, timeZone) % DAY_MS) / MINUTE_MS));
}

/** The local time with its UTC offset, e.g. 2026-03-29T03:00:00+02:00. */
export function formatLocalWithOffset(utcMs: number, timeZone: string): string {
  const naive = naiveOf(utcMs, timeZone);
  const offsetMin = Math.round((naive - utcMs) / MINUTE_MS);
  const abs = Math.abs(offsetMin);
  return `${new Date(naive).toISOString().slice(0, 19)}${offsetMin < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
