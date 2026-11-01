// Time limit and deadline of a round (specification: Állapotgépek / Menetrend → körök, Kör / Határidő).
import type { Timestamp } from '@waypost/schema';

import { parseTimestamp, toTimestamp } from '@/time/timestamp';
import { MINUTE_MS } from '@/time/zone';

import type { Slot } from './schedule';
import { roundKey } from './state';

/** Deadline of the last round of a day without a time limit. */
export const LAST_ROUND_GRACE_MIN = 60;

/**
 * Default time limit of a new schedule from the current route version's walk_duration_s:
 * ceil(walk × 1.5 / 300) × 5 = ceil(walk / 200) × 5 (in integers), within 5 … 1440; unmeasured: 20.
 */
export function defaultTimeLimit(walkDurationS: number | null): number {
  if (walkDurationS === null) return 20;
  return Math.min(1440, Math.max(5, Math.ceil(walkDurationS / 200) * 5));
}

/** What the deadline of a round depends on. */
export interface DeadlineInput {
  route_id: string;
  start_day: string;
  scheduled_at: Timestamp;
  time_limit_min: number | null;
}

/** The slots as the deadlines look them up, built once: a search per round would make the rules quadratic in the slots. */
export interface SlotIndex {
  /** By roundKey. */
  slots: ReadonlyMap<string, Slot>;
  /** The times of a route's day (window start day), in order, by dayKey. */
  dayTimes: ReadonlyMap<string, readonly number[]>;
}

const dayKey = (slot: Pick<Slot, 'route_id' | 'start_day'>) => `${slot.route_id}|${slot.start_day}`;

export function indexSlots(slots: readonly Slot[]): SlotIndex {
  const dayTimes = new Map<string, number[]>();
  for (const slot of slots) {
    const times = dayTimes.get(dayKey(slot));
    if (times === undefined) dayTimes.set(dayKey(slot), [parseTimestamp(slot.scheduled_at)]);
    else times.push(parseTimestamp(slot.scheduled_at));
  }
  for (const times of dayTimes.values()) times.sort((a, b) => a - b);
  return { slots: new Map(slots.map((slot) => [roundKey(slot), slot])), dayTimes };
}

/** The first of the times (in order) after a time. */
function firstAfter(times: readonly number[], time: number): number | null {
  let [low, high] = [0, times.length];
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle]! > time) high = middle;
    else low = middle + 1;
  }
  return times[low] ?? null;
}

/**
 * The deadline of a round in milliseconds: scheduled_at + time_limit_min; without a time limit the time of the route's
 * next round of the same day (window start day), and for the day's last round scheduled_at + 60 minutes.
 * The index has the route's slots around the round (at least those of its day after it).
 */
export function deadlineMs(round: DeadlineInput, index: SlotIndex): number {
  const scheduled = parseTimestamp(round.scheduled_at);
  if (round.time_limit_min !== null) return scheduled + round.time_limit_min * MINUTE_MS;
  return firstAfter(index.dayTimes.get(dayKey(round)) ?? [], scheduled) ?? scheduled + LAST_ROUND_GRACE_MIN * MINUTE_MS;
}

/** deadlineMs of a round among slots in any order. */
export function roundDeadline(round: DeadlineInput, slots: readonly Slot[]): Timestamp {
  return toTimestamp(deadlineMs(round, indexSlots(slots)));
}
