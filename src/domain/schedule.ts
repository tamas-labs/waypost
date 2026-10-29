// Schedule → expected round times (specification: Állapotgépek / Menetrend → körök; the exact rules, DST included,
// are in waypost-schema docs/decisions.md and its schedule/test-vectors.json).
import type { LocalTime, Schedule, Timestamp } from '@waypost/schema';

import { toTimestamp } from '@/time/timestamp';
import { DAY_MS, MINUTE_MS, formatLocalDate, formatLocalTime, formatLocalWithOffset, localDateOf, parseLocalDate, parseLocalTime, resolveLocal } from '@/time/zone';

/** The fields of a schedule that decide its times. */
export type ScheduleRules = Pick<Schedule, 'weekdays' | 'mode' | 'interval_from' | 'interval_to' | 'interval_every_min'> & {
  start_times: readonly LocalTime[] | null;
};

/** One expected round of a schedule. */
export interface ExpectedRound {
  /** Local date (YYYY-MM-DD) the round's window starts on: the day the round belongs to. */
  start_day: string;
  /** The wall-clock time of the schedule the round comes from. */
  wall_time: LocalTime;
  /** The actual local time with its UTC offset. */
  local: string;
  utc: Timestamp;
}

/** Wall-clock minutes from the start day's midnight (may exceed a day) of one window, in order. */
export function windowMinutes(schedule: ScheduleRules): number[] {
  if (schedule.mode === 'list') {
    // A list is a sequence: an element not later than the previous one belongs to the next day.
    const times = (schedule.start_times ?? []).map(parseLocalTime);
    let dayOffset = 0;
    return times.map((minutes, i) => {
      if (i > 0 && minutes <= times[i - 1]!) dayOffset += 1440;
      return dayOffset + minutes;
    });
  }
  const { interval_from, interval_to, interval_every_min } = schedule;
  if (interval_from === null || interval_to === null || interval_every_min === null || interval_every_min < 1) throw new Error('Incomplete interval schedule');
  const from = parseLocalTime(interval_from);
  const to = parseLocalTime(interval_to) + (parseLocalTime(interval_to) <= from ? 1440 : 0);
  const minutes: number[] = [];
  for (let m = from; m <= to; m += interval_every_min) minutes.push(m);
  return minutes;
}

/** Bit of a date's weekday in the weekdays mask: Monday = 1 … Sunday = 64. */
const weekdayBit = (naiveDate: number) => 1 << ((new Date(naiveDate).getUTCDay() + 6) % 7);

/** Every round of the windows that start on fromDate … toDate (local dates of the site, inclusive), in time order. */
export function expandSchedule(schedule: ScheduleRules, timeZone: string, fromDate: string, toDate: string): ExpectedRound[] {
  const rounds: ExpectedRound[] = [];
  const minutesOfWindow = windowMinutes(schedule);
  for (let day = parseLocalDate(fromDate); day <= parseLocalDate(toDate); day += DAY_MS) {
    if ((schedule.weekdays & weekdayBit(day)) === 0) continue;
    const seen = new Set<number>();
    for (const minutes of minutesOfWindow) {
      const utc = resolveLocal(day + minutes * MINUTE_MS, timeZone);
      // Two wall-clock times moved onto the same instant (spring gap) are one round.
      if (seen.has(utc)) continue;
      seen.add(utc);
      rounds.push({ start_day: formatLocalDate(day), wall_time: formatLocalTime(minutes), local: formatLocalWithOffset(utc, timeZone), utc: toTimestamp(utc) });
    }
  }
  return rounds;
}

/** A round time of a route: what the scheduler opens and the alarms announce. */
export interface Slot {
  route_id: string;
  schedule_id: string;
  start_day: string;
  scheduled_at: Timestamp;
  /** The schedule's time limit; null = none. */
  time_limit_min: number | null;
}

export interface ScheduleOfRoute extends ScheduleRules {
  id: string;
  route_id: string;
  time_limit_min: number | null;
  active: boolean;
}

/**
 * The slots of the active schedules whose time is within fromMs … toMs (both included), in time order (ties by
 * route and schedule ID, so the order is stable). A window is shorter than a day, so starting the expansion a
 * day before fromMs's local date catches the windows that started the day before.
 */
export function slotsBetween(schedules: readonly ScheduleOfRoute[], timeZone: string, fromMs: number, toMs: number): Slot[] {
  if (toMs < fromMs) return [];
  const fromDate = formatLocalDate(parseLocalDate(localDateOf(fromMs, timeZone)) - DAY_MS);
  const toDate = localDateOf(toMs, timeZone);
  const slots: (Slot & { ms: number })[] = [];
  for (const schedule of schedules) {
    if (!schedule.active) continue;
    for (const round of expandSchedule(schedule, timeZone, fromDate, toDate)) {
      const ms = Date.parse(round.utc);
      if (ms < fromMs || ms > toMs) continue;
      slots.push({ route_id: schedule.route_id, schedule_id: schedule.id, start_day: round.start_day, scheduled_at: round.utc, time_limit_min: schedule.time_limit_min, ms });
    }
  }
  slots.sort((a, b) => a.ms - b.ms || a.route_id.localeCompare(b.route_id) || a.schedule_id.localeCompare(b.schedule_id));
  return slots.map(({ ms: _ms, ...slot }) => slot);
}
