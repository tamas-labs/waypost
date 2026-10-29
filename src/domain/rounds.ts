// The round state machine and the scheduler step (specification: Állapotgépek / Kör). A round opens at its time if
// there is an open shift (round_opened, open); its first scan of a checkpoint makes it in_progress (the projection
// does that, src/chain/projection.ts); it is completed at once when every checkpoint of its route version is
// scanned (scan.ts), and at its deadline incomplete (some scans) or missed (none).
import type { Timestamp } from '@waypost/schema';

import type { ChainEntryDraft } from '@/chain/writer';
import { roundClosed, roundOpened, shiftClosed } from '@/chain/payloads';
import { parseTimestamp, toTimestamp } from '@/time/timestamp';
import { DAY_MS, localDateOf } from '@/time/zone';

import { roundDeadline } from './deadline';
import { slotsBetween, type Slot } from './schedule';
import { isOpen, versionOf, type GuardState, type NewId, type RoundInfo } from './state';

export type ClosedStatus = 'completed' | 'incomplete' | 'missed';

/** How a round closes now: completed if every checkpoint is scanned (manual too), else incomplete or missed. */
export function closingStatus(round: Pick<RoundInfo, 'scans'>, checkpointIds: readonly string[]): ClosedStatus {
  const scanned = new Set(round.scans.map((scan) => scan.checkpoint_id));
  if (checkpointIds.every((id) => scanned.has(id))) return 'completed';
  return scanned.size > 0 ? 'incomplete' : 'missed';
}

/** round_closed of an open round by the rule above. */
export function closeRound(state: GuardState, round: RoundInfo, finishedAt: Timestamp): ChainEntryDraft<'round_closed'> {
  return roundClosed({ round_id: round.id, status: closingStatus(round, versionOf(state, round.route_version_id).checkpoint_ids), finished_at: finishedAt });
}

/** The slots around a period, wide enough for the deadlines of its rounds (a window and a time limit are within a day). */
export function slotsAround(state: GuardState, fromMs: number, toMs: number): Slot[] {
  return slotsBetween(state.schedules, state.timezone, fromMs - DAY_MS, toMs + 2 * DAY_MS);
}

/** The deadline of a round, given the slots around it. */
export function deadlineOf(state: GuardState, round: Pick<RoundInfo, 'route_id' | 'schedule_id' | 'scheduled_at' | 'time_limit_min'>, slots: readonly Slot[]): number {
  const slot = slots.find((s) => s.schedule_id === round.schedule_id && s.scheduled_at === round.scheduled_at);
  // A round whose schedule has changed since: the day is its local date.
  const startDay = slot?.start_day ?? localDateOf(parseTimestamp(round.scheduled_at), state.timezone);
  return parseTimestamp(roundDeadline({ route_id: round.route_id, start_day: startDay, scheduled_at: round.scheduled_at, time_limit_min: round.time_limit_min }, slots));
}

/**
 * When the shift closes automatically (Q10): 60 minutes after the latest deadline among the rounds of its day, on
 * every route. Its day is the window start day of the first round still running or ahead at the shift's start.
 * Null if there is no such round.
 */
export function autoCloseTime(state: GuardState, slots: readonly Slot[], shiftStartedMs: number): number | null {
  const withDeadline = slots.map((slot) => ({ slot, deadline: deadlineOf(state, slot, slots) }));
  const first = withDeadline.find(({ deadline }) => deadline > shiftStartedMs);
  if (first === undefined) return null;
  const lastDeadline = Math.max(...withDeadline.filter(({ slot }) => slot.start_day === first.slot.start_day).map(({ deadline }) => deadline));
  return lastDeadline + 60 * 60_000;
}

interface Event {
  at: number;
  /** At the same instant: closes before opens, the shift last. */
  rank: 0 | 1 | 2;
  draft: ChainEntryDraft;
}

/**
 * The scheduler step, run at start, in the foreground, at every alarm and every 30 s in the foreground. With an
 * open shift it opens the rounds whose time has come – a time missed (e.g. the app did not run) with its original
 * scheduled_at, and closed at once if its deadline has passed too –, closes the rounds at their deadline, closes the
 * open round of a route when its next time comes (one open round per route), and closes the shift automatically.
 * A time slot whose deadline was over when the shift started is not opened. Output: the entries, in time order.
 */
export function schedulerStep(state: GuardState, now: Timestamp, newId: NewId): ChainEntryDraft[] {
  const shift = state.shift;
  if (shift === null) return [];
  const nowMs = parseTimestamp(now);
  const shiftStartedMs = parseTimestamp(shift.started_at);
  const openRounds = state.rounds.filter(isOpen);
  const earliest = Math.min(shiftStartedMs, ...openRounds.map((round) => parseTimestamp(round.scheduled_at)));
  const routes = new Map(state.routes.map((route) => [route.id, route]));
  // Rounds of an inactive route, or of one without a trained version, are not expected.
  const slots = slotsAround(state, earliest, nowMs).filter((slot) => {
    const route = routes.get(slot.route_id);
    return route !== undefined && route.active && route.current_version_id !== null;
  });
  const autoCloseMs = autoCloseTime(state, slots, shiftStartedMs);
  const endMs = autoCloseMs !== null && autoCloseMs <= nowMs ? autoCloseMs : nowMs;

  const events: Event[] = [];
  const close = (round: RoundInfo, at: number) => events.push({ at, rank: 0, draft: closeRound(state, round, toTimestamp(at)) });

  // The open round of each route, with its deadline.
  const current = new Map<string, { round: RoundInfo; deadline: number }>();
  for (const round of openRounds) {
    const previous = current.get(round.route_id);
    // Never more than one; if the data says otherwise, the earlier one closes now.
    if (previous !== undefined) close(previous.round, Math.min(previous.deadline, endMs));
    current.set(round.route_id, { round, deadline: deadlineOf(state, round, slots) });
  }

  const known = new Set(state.rounds.map((round) => `${round.schedule_id}|${round.scheduled_at}`));
  for (const slot of slots) {
    const at = parseTimestamp(slot.scheduled_at);
    if (at > endMs || (autoCloseMs !== null && at >= autoCloseMs)) break;
    const versionId = routes.get(slot.route_id)?.current_version_id;
    if (versionId == null || known.has(`${slot.schedule_id}|${slot.scheduled_at}`)) continue;
    const deadline = deadlineOf(state, slot, slots);
    if (deadline <= shiftStartedMs) continue;

    const open = current.get(slot.route_id);
    if (open !== undefined) close(open.round, Math.min(open.deadline, at));
    const round: RoundInfo = {
      id: newId(),
      shift_id: shift.id,
      route_id: slot.route_id,
      route_version_id: versionId,
      schedule_id: slot.schedule_id,
      scheduled_at: slot.scheduled_at,
      time_limit_min: slot.time_limit_min,
      status: 'open',
      scans: [],
    };
    events.push({ at, rank: 1, draft: roundOpened({ round_id: round.id, shift_id: shift.id, route_version_id: round.route_version_id, schedule_id: round.schedule_id, scheduled_at: round.scheduled_at, time_limit_min: round.time_limit_min }) });
    current.set(slot.route_id, { round, deadline });
  }

  for (const { round, deadline } of current.values()) {
    if (deadline <= endMs) close(round, deadline);
    else if (endMs === autoCloseMs) close(round, autoCloseMs);
  }
  if (endMs === autoCloseMs) events.push({ at: autoCloseMs, rank: 2, draft: shiftClosed({ shift_id: shift.id, closed_by: 'auto' }) });

  return events.sort((a, b) => a.at - b.at || a.rank - b.rank).map((event) => event.draft);
}
