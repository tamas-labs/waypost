// The shift state machine (specification: Állapotgépek / Műszak). The automatic close is part of the scheduler step
// (rounds.ts), because it depends on the schedules.
import type { Timestamp } from '@waypost/schema';

import { shiftClosed, shiftStarted } from '@/chain/payloads';
import type { ChainEntryDraft } from '@/chain/writer';

import { parseTimestamp } from '@/time/timestamp';
import { DAY_MS } from '@/time/zone';

import { closeRound, expectedSlots } from './rounds';
import type { ScheduleOfRoute } from './schedule';
import { DomainError, isOpen, type GuardState, type NewId, type ShiftInfo } from './state';

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
