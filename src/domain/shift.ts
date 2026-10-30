// The shift state machine (specification: Állapotgépek / Műszak). The automatic close is part of the scheduler step
// (rounds.ts), because it depends on the schedules.
import type { Timestamp } from '@waypost/schema';

import { shiftClosed, shiftStarted } from '@/chain/payloads';
import type { ChainEntryDraft } from '@/chain/writer';

import { parseTimestamp, toTimestamp } from '@/time/timestamp';
import { DAY_MS } from '@/time/zone';

import { autoCloseTime, closeRound, deadlineOf, expectedSlots, type ClosedStatus } from './rounds';
import type { ScheduleOfRoute } from './schedule';
import { DomainError, isOpen, type GuardState, type NewId, type RoundInfo, type ShiftInfo } from './state';

export interface GuardLogin {
  /** started: a new shift; continued: the same guard's open shift goes on; handover: another guard's shift closed first. */
  outcome: 'started' | 'continued' | 'handover';
  shift_id: string;
  /** Handover: the shift closed. */
  closed_shift?: ShiftInfo;
  drafts: ChainEntryDraft[];
}

/** The open rounds closed now by the usual rule (completed, incomplete or missed). */
function closeOpenRounds(state: GuardState, now: Timestamp): ChainEntryDraft[] {
  return state.rounds.filter(isOpen).map((round) => closeRound(state, round, now));
}

/**
 * A guard logged in with PIN: without an open shift a new one starts; the same guard continues the open shift;
 * another guard first closes it (its open rounds, then shift_closed handover) and starts a new one.
 */
export function guardLogin(state: GuardState, guardId: string, now: Timestamp, newId: NewId): GuardLogin {
  const open = state.shift;
  if (open !== null && open.guard_id === guardId) return { outcome: 'continued', shift_id: open.id, drafts: [] };
  const shiftId = newId();
  const start = shiftStarted({ shift_id: shiftId, guard_id: guardId, site_id: state.site_id });
  if (open === null) return { outcome: 'started', shift_id: shiftId, drafts: [start] };
  return {
    outcome: 'handover',
    shift_id: shiftId,
    closed_shift: open,
    drafts: [...closeOpenRounds(state, now), shiftClosed({ shift_id: open.id, closed_by: 'handover' }), start],
  };
}

/** The guard closes the shift (after the PIN and the summary); an open round closes with it. */
export function closeShiftByGuard(state: GuardState, now: Timestamp): ChainEntryDraft[] {
  if (state.shift === null) throw new DomainError('no_shift', 'There is no open shift');
  return [...closeOpenRounds(state, now), shiftClosed({ shift_id: state.shift.id, closed_by: 'guard' })];
}

export interface NextRound {
  scheduled_at: Timestamp;
  /** The first round of its schedule day (a night from 20:00 to 08:00 is one day): the shift starts with it. */
  starts_shift: boolean;
}

/** The next round time after now on the routes that have rounds (for the PIN screen); null if there is none within a day. */
export function nextRound(state: GuardState, now: Timestamp): NextRound | null {
  const nowMs = parseTimestamp(now);
  // The slots around the day ahead start a day earlier, so the earlier rounds of the next one's day are there too.
  const slots = expectedSlots(state, nowMs, nowMs + DAY_MS);
  const next = slots.find((slot) => {
    const at = parseTimestamp(slot.scheduled_at);
    return at > nowMs && at <= nowMs + DAY_MS;
  });
  if (next === undefined) return null;
  return { scheduled_at: next.scheduled_at, starts_shift: slots.find((slot) => slot.start_day === next.start_day) === next };
}

export interface ShiftDayRoute {
  route_id: string;
  /** Checkpoints of the route's current version. */
  checkpoints: number;
  /** Rounds of the route on the day. */
  rounds: number;
  /** The schedules the rounds come from. */
  schedules: ScheduleOfRoute[];
}

/** The rounds of one schedule day (a night from 20:00 to 08:00 is one day), for the shift start screen. */
export interface ShiftDay {
  start_day: string;
  first_at: Timestamp;
  last_at: Timestamp;
  routes: ShiftDayRoute[];
}

/**
 * The schedule day of the shift: the one whose rounds span now (first round ≤ now ≤ last round), otherwise the next
 * one with a round after now; null if there is none within a day.
 */
export function shiftDay(state: GuardState, now: Timestamp): ShiftDay | null {
  const nowMs = parseTimestamp(now);
  const slots = expectedSlots(state, nowMs - DAY_MS, nowMs + DAY_MS);
  const days = new Map<string, typeof slots>();
  for (const slot of slots) days.set(slot.start_day, [...(days.get(slot.start_day) ?? []), slot]);
  const spans = [...days.values()].map((day) => ({ day, first: parseTimestamp(day[0]!.scheduled_at), last: parseTimestamp(day[day.length - 1]!.scheduled_at) }));
  const span = spans.find(({ first, last }) => first <= nowMs && nowMs <= last) ?? spans.find(({ first }) => first > nowMs && first <= nowMs + DAY_MS);
  if (span === undefined) return null;

  const routes: ShiftDayRoute[] = [];
  for (const slot of span.day) {
    let route = routes.find((r) => r.route_id === slot.route_id);
    if (route === undefined) {
      const versionId = state.routes.find((r) => r.id === slot.route_id)?.current_version_id;
      const version = state.versions.find((v) => v.id === versionId);
      route = { route_id: slot.route_id, checkpoints: version?.checkpoint_ids.length ?? 0, rounds: 0, schedules: [] };
      routes.push(route);
    }
    route.rounds += 1;
    if (!route.schedules.some((schedule) => schedule.id === slot.schedule_id)) {
      const schedule = state.schedules.find((s) => s.id === slot.schedule_id);
      if (schedule !== undefined) route.schedules.push(schedule);
    }
  }
  return { start_day: span.day[0]!.start_day, first_at: span.day[0]!.scheduled_at, last_at: span.day[span.day.length - 1]!.scheduled_at, routes };
}

/** A round of the shift on the shift home: closed, running, the next one of its route, or a later one. */
export type ShiftRoundState = 'completed' | 'incomplete' | 'missed' | 'running' | 'next' | 'future';

export interface ShiftRound {
  route_id: string;
  schedule_id: string;
  scheduled_at: Timestamp;
  state: ShiftRoundState;
  /** False: it was over before the shift started, so it never opened (the server's report counts it as missed too). */
  opened: boolean;
  /** Checkpoints of the round's route version that are scanned, of all of them. */
  scanned: number;
  total: number;
  missing_checkpoint_ids: readonly string[];
  /** Completed rounds: from the first scan to the last. */
  duration_ms: number | null;
}

/** What the shift home (G3) shows of the open shift. */
export interface ShiftHome {
  /** The rounds of the shift, in time order. */
  rounds: ShiftRound[];
  /** The time of the first round not opened yet (a moment after its time it may still be waiting for the scheduler). */
  next_at: Timestamp | null;
  /** The earliest open round, with its deadline. */
  running: { round_id: string; scheduled_at: Timestamp; deadline: Timestamp } | null;
  auto_close_at: Timestamp | null;
}

function shiftRoundOf(state: GuardState, round: RoundInfo): ShiftRound {
  const checkpointIds = state.versions.find((version) => version.id === round.route_version_id)?.checkpoint_ids ?? [];
  const scanned = new Set(round.scans.map((scan) => scan.checkpoint_id));
  const missing = checkpointIds.filter((id) => !scanned.has(id));
  const [first, last] = [round.scans[0], round.scans[round.scans.length - 1]];
  return {
    route_id: round.route_id,
    schedule_id: round.schedule_id,
    scheduled_at: round.scheduled_at,
    state: isOpen(round) ? 'running' : (round.status as ClosedStatus),
    opened: true,
    scanned: checkpointIds.length - missing.length,
    total: checkpointIds.length,
    missing_checkpoint_ids: missing,
    duration_ms: round.status === 'completed' && first !== undefined && last !== undefined ? parseTimestamp(last.scanned_at) - parseTimestamp(first.scanned_at) : null,
  };
}

/**
 * The rounds of the open shift. Its day is the window start day of the first round still running or ahead at its start
 * (the one the automatic close counts from). They are the slots of that day from the schedules with a round still
 * ahead (an earlier window of another schedule, e.g. the day's rounds on a night shift, is not the shift's), and the
 * other days' slots the scheduler still opens before that close. A slot with a round has the round's state, even if an
 * earlier shift of the night closed it. One without a round is missed if its deadline was over when the shift started
 * (the scheduler never opens it), otherwise it is ahead. Rounds of the shift whose schedule has changed since are kept.
 * Null without an open shift.
 */
export function shiftHome(state: GuardState, now: Timestamp): ShiftHome | null {
  const shift = state.shift;
  if (shift === null) return null;
  const startedMs = parseTimestamp(shift.started_at);
  const slots = expectedSlots(state, startedMs, parseTimestamp(now));
  const autoCloseMs = autoCloseTime(state, slots, startedMs);
  const ahead = slots.filter((slot) => deadlineOf(state, slot, slots) > startedMs);
  const first = ahead[0];
  const schedulesAhead = new Set(ahead.filter((slot) => slot.start_day === first?.start_day).map((slot) => slot.schedule_id));
  const ofShift = slots.filter((slot) => {
    if (first === undefined) return false;
    if (slot.start_day === first.start_day) return schedulesAhead.has(slot.schedule_id);
    const at = parseTimestamp(slot.scheduled_at);
    return autoCloseMs !== null && at > parseTimestamp(first.scheduled_at) && at < autoCloseMs;
  });

  const key = (round: Pick<RoundInfo, 'schedule_id' | 'scheduled_at'>) => `${round.schedule_id}|${round.scheduled_at}`;
  const roundsBySlot = new Map(state.rounds.map((round) => [key(round), round]));
  const slotKeys = new Set(ofShift.map(key));
  const routesWithNext = new Set<string>();
  let nextAt: Timestamp | null = null;

  const rounds = ofShift.map((slot): ShiftRound => {
    const round = roundsBySlot.get(key(slot));
    if (round !== undefined) return shiftRoundOf(state, round);
    const versionId = state.routes.find((route) => route.id === slot.route_id)?.current_version_id;
    const checkpointIds = state.versions.find((version) => version.id === versionId)?.checkpoint_ids ?? [];
    const notOpened = { route_id: slot.route_id, schedule_id: slot.schedule_id, scheduled_at: slot.scheduled_at, opened: false, scanned: 0, total: checkpointIds.length, missing_checkpoint_ids: checkpointIds, duration_ms: null };
    if (deadlineOf(state, slot, slots) <= startedMs) return { ...notOpened, state: 'missed' };
    nextAt ??= slot.scheduled_at;
    if (routesWithNext.has(slot.route_id)) return { ...notOpened, state: 'future' };
    routesWithNext.add(slot.route_id);
    return { ...notOpened, state: 'next' };
  });
  for (const round of state.rounds) {
    if (round.shift_id === shift.id && !slotKeys.has(key(round))) rounds.push(shiftRoundOf(state, round));
  }
  rounds.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at) || a.route_id.localeCompare(b.route_id));

  const open = state.rounds.find(isOpen);
  return {
    rounds,
    next_at: nextAt,
    running: open === undefined ? null : { round_id: open.id, scheduled_at: open.scheduled_at, deadline: toTimestamp(deadlineOf(state, open, slots)) },
    auto_close_at: autoCloseMs === null ? null : toTimestamp(autoCloseMs),
  };
}
