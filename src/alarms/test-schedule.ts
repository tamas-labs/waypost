// The M1-06 device test: notifications every 15 minutes for 3 hours (spec: Ütemezés / M1).

export const TEST_EVERY_MIN = 15;
export const TEST_HOURS = 3;

/** A notification scheduled closer than this to now could fire before the guard has locked the phone. */
const MIN_LEAD_MS = 60_000;

const MINUTE_MS = 60_000;

/**
 * The times of the test notifications: every whole quarter-hour (local :00, :15, :30, :45) in the given number of
 * hours after now, starting at least a minute ahead. On whole quarter-hours it is easy to check on the phone how
 * late a notification came.
 */
export function testAlarmTimes(now: Date, { everyMin = TEST_EVERY_MIN, hours = TEST_HOURS }: { everyMin?: 1 | 5 | 15; hours?: number } = {}): Date[] {
  const stepMs = everyMin * MINUTE_MS;
  const count = (hours * 60) / everyMin;
  // Every UTC offset is a multiple of 15 minutes, so a step dividing 15 minutes lines up with local time too,
  // also across a DST change.
  const first = Math.ceil((now.getTime() + MIN_LEAD_MS) / stepMs) * stepMs;
  return Array.from({ length: count }, (_, i) => new Date(first + i * stepMs));
}
