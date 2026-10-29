// Time limit and deadline of a round (specification: Állapotgépek / Menetrend → körök, Kör / Határidő).
import type { Timestamp } from '@waypost/schema';

import { parseTimestamp, toTimestamp } from '@/time/timestamp';
import { MINUTE_MS } from '@/time/zone';

import type { Slot } from './schedule';

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

/**
 * The deadline of a round: scheduled_at + time_limit_min; without a time limit the time of the route's next round
 * of the same day (window start day), and for the day's last round scheduled_at + 60 minutes.
 * slots: the route's slots around the round (at least those of its day after it), any order.
 */
export function roundDeadline(round: DeadlineInput, slots: readonly Slot[]): Timestamp {
  const scheduled = parseTimestamp(round.scheduled_at);
  if (round.time_limit_min !== null) return toTimestamp(scheduled + round.time_limit_min * MINUTE_MS);
  let next: number | null = null;
  for (const slot of slots) {
    if (slot.route_id !== round.route_id || slot.start_day !== round.start_day) continue;
    const at = parseTimestamp(slot.scheduled_at);
    if (at > scheduled && (next === null || at < next)) next = at;
  }
  return toTimestamp(next ?? scheduled + LAST_ROUND_GRACE_MIN * MINUTE_MS);
}
