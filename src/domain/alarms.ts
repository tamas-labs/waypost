// The round alarms (specification: Mobilapp / Ébresztés): which local notifications the phone should have now. The
// rounds of the next 36 hours, each with an alarm at its time, and the next few with a reminder 5 minutes later unless
// the round has started; at most 48 on iOS, 192 on Android. The plan is recomputed and the whole list replaced at
// every change (src/alarms). The reminders of the later rounds come with a later reschedule: the budget goes to
// the rounds themselves, so that a dense schedule still rings for hours with the app closed (audit WP-APP-003).
import type { Timestamp } from '@waypost/schema';

import { parseTimestamp, toTimestamp } from '@/time/timestamp';
import { MINUTE_MS } from '@/time/zone';

import { indexSlots } from './deadline';
import { autoCloseTime, deadlineOf, expectedSlots } from './rounds';
import { shiftHome } from './shift-view';
import { isClosedStatus, roundKey, type ClosedStatus, type GuardState } from './state';

export const ALARM_HORIZON_MS = 36 * 60 * MINUTE_MS;
/** Under iOS's limit of 64 pending notifications. */
export const MAX_ALARMS_IOS = 48;
/** Android has no such limit, but some makers cap an app's pending alarms at 500. */
export const MAX_ALARMS_ANDROID = 192;
export const REMINDER_AFTER_MS = 5 * MINUTE_MS;
/** How many of the coming rounds get a reminder. */
export const REMINDER_ROUNDS = 4;

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
 * The alarms to be pending at now: of the rounds scheduled in the next 36 hours, on routes that have rounds, in time
 * order, the first maxAlarms. Every round has its alarm; the first REMINDER_ROUNDS rounds that have not started (a
 * round still unstarted from the last 5 minutes among them) have their reminder too. A round already started or
 * closed on the phone has no reminder.
 */
export function alarmPlan(state: GuardState, now: Timestamp, maxAlarms: number = MAX_ALARMS_IOS): PlannedAlarm[] {
  const nowMs = parseTimestamp(now);
  const horizonMs = nowMs + ALARM_HORIZON_MS;
  const shiftStartedMs = state.shift === null ? null : parseTimestamp(state.shift.started_at);
  const slots = expectedSlots(state, Math.min(nowMs, shiftStartedMs ?? nowMs), horizonMs);
  const autoCloseMs = shiftStartedMs === null ? null : autoCloseTime(state, slots, shiftStartedMs);
  const statuses = new Map(state.rounds.map((round) => [roundKey(round), round.status]));

  const alarms: PlannedAlarm[] = [];
  let reminders = 0;
  for (const slot of [...slots].sort((a, b) => parseTimestamp(a.scheduled_at) - parseTimestamp(b.scheduled_at))) {
    const at = parseTimestamp(slot.scheduled_at);
    if (at <= nowMs - REMINDER_AFTER_MS || at > horizonMs) continue;
    const status = statuses.get(roundKey(slot));
    const login = shiftStartedMs === null || (autoCloseMs !== null && at >= autoCloseMs);
    const alarm = { route_id: slot.route_id, schedule_id: slot.schedule_id, scheduled_at: slot.scheduled_at, login };
    if (at > nowMs) alarms.push({ ...alarm, kind: 'round', fire_at: slot.scheduled_at });
    const reminderMs = at + REMINDER_AFTER_MS;
    if (reminderMs > nowMs && reminders < REMINDER_ROUNDS && (status === undefined || status === 'open')) {
      reminders += 1;
      alarms.push({ ...alarm, kind: 'reminder', fire_at: toTimestamp(reminderMs) });
    }
  }
  return alarms.sort((a, b) => parseTimestamp(a.fire_at) - parseTimestamp(b.fire_at)).slice(0, maxAlarms);
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
  if (timing === undefined || deadlineOf(state, timing, indexSlots(slots)) <= nowMs) return null;

  const versionId = round?.route_version_id ?? state.routes.find((route) => route.id === slot.route_id)?.current_version_id;
  const previous = shiftHome(state, now)
    ?.rounds.filter((r) => r.route_id === slot.route_id && r.scheduled_at < slot.scheduled_at)
    .at(-1);
  return {
    round_id: round?.id ?? null,
    checkpoints: state.versions.find((version) => version.id === versionId)?.checkpoint_ids.length ?? 0,
    time_limit_min: timing.time_limit_min,
    previous:
      previous !== undefined && isClosedStatus(previous.state) ? { scheduled_at: previous.scheduled_at, status: previous.state } : null,
  };
}
