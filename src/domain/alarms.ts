// The round alarms (specification: Mobilapp / Ébresztés): which local notifications the phone should have now. The
// rounds of the next 36 hours, two alarms each – at the time, and a reminder 5 minutes later unless the round has
// started –, at most 48. The plan is recomputed and the whole list replaced at every change (src/alarms).
import type { Timestamp } from '@waypost/schema';

import { parseTimestamp, toTimestamp } from '@/time/timestamp';
import { MINUTE_MS } from '@/time/zone';

import { autoCloseTime, deadlineOf, expectedSlots, type ClosedStatus } from './rounds';
import { shiftHome } from './shift';
import type { GuardState } from './state';

export const ALARM_HORIZON_MS = 36 * 60 * MINUTE_MS;
/** Under iOS's limit of 64 pending notifications. */
export const MAX_ALARMS = 48;
export const REMINDER_AFTER_MS = 5 * MINUTE_MS;

export interface PlannedAlarm {
  /** round: at the round's time; reminder: 5 minutes later, if the round has not started. */
  kind: 'round' | 'reminder';
  route_id: string;
  schedule_id: string;
  scheduled_at: Timestamp;
  fire_at: Timestamp;
  /** Nobody's shift covers the round as things stand: the alarm asks for a PIN login. */
  login: boolean;
}

/**
 * The alarms to be pending at now: of the rounds scheduled in the next 36 hours (a round still unstarted from the
 * last 5 minutes keeps its reminder), on routes that have rounds, in time order, the first 48. A round already
 * started or closed on the phone has no reminder.
 */
export function alarmPlan(state: GuardState, now: Timestamp): PlannedAlarm[] {
  const nowMs = parseTimestamp(now);
  const horizonMs = nowMs + ALARM_HORIZON_MS;
  const shiftStartedMs = state.shift === null ? null : parseTimestamp(state.shift.started_at);
  const slots = expectedSlots(state, Math.min(nowMs, shiftStartedMs ?? nowMs), horizonMs);
  const autoCloseMs = shiftStartedMs === null ? null : autoCloseTime(state, slots, shiftStartedMs);
  const statuses = new Map(state.rounds.map((round) => [`${round.schedule_id}|${round.scheduled_at}`, round.status]));

  const alarms: PlannedAlarm[] = [];
  for (const slot of slots) {
    const at = parseTimestamp(slot.scheduled_at);
    if (at <= nowMs - REMINDER_AFTER_MS || at > horizonMs) continue;
    const status = statuses.get(`${slot.schedule_id}|${slot.scheduled_at}`);
    const login = shiftStartedMs === null || (autoCloseMs !== null && at >= autoCloseMs);
    const alarm = { route_id: slot.route_id, schedule_id: slot.schedule_id, scheduled_at: slot.scheduled_at, login };
    if (at > nowMs) alarms.push({ ...alarm, kind: 'round', fire_at: slot.scheduled_at });
    const reminderMs = at + REMINDER_AFTER_MS;
    if (reminderMs > nowMs && (status === undefined || status === 'open')) alarms.push({ ...alarm, kind: 'reminder', fire_at: toTimestamp(reminderMs) });
  }
  return alarms.sort((a, b) => parseTimestamp(a.fire_at) - parseTimestamp(b.fire_at)).slice(0, MAX_ALARMS);
}

/** The round time an alarm belongs to. */
export type AlarmSlot = Pick<PlannedAlarm, 'route_id' | 'schedule_id' | 'scheduled_at'>;

/** What the alarm screen (G4) tells about the round. */
export interface RoundAlarmInfo {
  /** Null: the scheduler has not opened it yet. */
  round_id: string | null;
  checkpoints: number;
  time_limit_min: number | null;
  /** The round of the route before this one, if it has closed. */
  previous: { scheduled_at: Timestamp; status: ClosedStatus } | null;
}

/**
 * The round of an alarm, if the alarm still has something to say: there is an open shift, the round has not started or
 * closed, its deadline is not over, and it is still on the schedule (or already open). Null otherwise, e.g. for an old
 * notification tapped late.
 */
export function roundAlarmInfo(state: GuardState, slot: AlarmSlot, now: Timestamp): RoundAlarmInfo | null {
  if (state.shift === null) return null;
  const round = state.rounds.find((r) => r.schedule_id === slot.schedule_id && r.scheduled_at === slot.scheduled_at);
  if (round !== undefined && round.status !== 'open') return null;

  const nowMs = parseTimestamp(now);
  const atMs = parseTimestamp(slot.scheduled_at);
  const slots = expectedSlots(state, Math.min(atMs, parseTimestamp(state.shift.started_at)), Math.max(atMs, nowMs));
  const timing = round ?? slots.find((s) => s.schedule_id === slot.schedule_id && s.scheduled_at === slot.scheduled_at);
  if (timing === undefined || deadlineOf(state, timing, slots) <= nowMs) return null;

  const versionId = round?.route_version_id ?? state.routes.find((route) => route.id === slot.route_id)?.current_version_id;
  const previous = shiftHome(state, now)
    ?.rounds.filter((r) => r.route_id === slot.route_id && r.scheduled_at < slot.scheduled_at)
    .at(-1);
  return {
    round_id: round?.id ?? null,
    checkpoints: state.versions.find((version) => version.id === versionId)?.checkpoint_ids.length ?? 0,
    time_limit_min: timing.time_limit_min,
    previous: previous !== undefined && (previous.state === 'completed' || previous.state === 'incomplete' || previous.state === 'missed') ? { scheduled_at: previous.scheduled_at, status: previous.state } : null,
  };
}
