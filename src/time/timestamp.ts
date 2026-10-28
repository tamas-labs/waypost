import type { Timestamp } from '@waypost/schema';

/** Same pattern as common/timestamp.json of @waypost/schema: UTC, exactly three fractional digits, Z suffix. */
const TIMESTAMP = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/;

/** ISO 8601 UTC timestamp with milliseconds of a Unix millisecond time or a Date, e.g. 2026-10-27T21:03:44.120Z. */
export function toTimestamp(time: number | Date): Timestamp {
  const ms = typeof time === 'number' ? time : time.getTime();
  if (!Number.isSafeInteger(ms)) throw new Error(`Invalid time: ${String(time)}`);
  const iso = new Date(ms).toISOString();
  // Years outside 0000–9999 come out as ±YYYYYY, which is not a valid timestamp.
  if (!TIMESTAMP.test(iso)) throw new Error(`Time out of range: ${iso}`);
  return iso;
}

/** The device's wall clock as a timestamp. */
export function nowTimestamp(): Timestamp {
  return toTimestamp(Date.now());
}

export function isTimestamp(value: string): boolean {
  return TIMESTAMP.test(value) && toTimestamp(Date.parse(value)) === value;
}

/** Unix milliseconds of a timestamp; throws for anything else (also for local times and offsets). */
export function parseTimestamp(value: string): number {
  if (!isTimestamp(value)) throw new Error(`Invalid timestamp: ${value}`);
  return Date.parse(value);
}
