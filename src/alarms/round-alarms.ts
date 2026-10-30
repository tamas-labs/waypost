// The round alarms on the phone (specification: Mobilapp / Ébresztés): the plan of src/domain/alarms.ts as local
// notifications on the rounds channel. Every change replaces the whole list; only what differs is cancelled or
// scheduled, so an alarm due right now is not lost between a cancel-all and the new schedule.
import type { ChainEntry } from '@waypost/schema';
import { inArray } from 'drizzle-orm';
import {
  SchedulableTriggerInputTypes,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  scheduleNotificationAsync,
  type NotificationRequestInput,
} from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import { onChainEntries } from '@/chain/events';
import type { Database } from '@/db/database';
import { routes } from '@/db/schema';
import { alarmPlan, type AlarmSlot, type PlannedAlarm } from '@/domain/alarms';
import { loadGuardState } from '@/guard/state';
import { t } from '@/i18n';
import { onConfigurationPulled } from '@/sync/events';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { parseTimestamp } from '@/time/timestamp';
import { trustedTime } from '@/time/trusted-time';
import { localTimeOf } from '@/time/zone';

import { ROUNDS_CHANNEL_ID, ROUND_ALARM_SOUND, ROUND_ALARM_VIBRATION, ensureRoundsChannel } from './channel';
import { showAlarmsInForeground } from './foreground';

/** Marks the round alarms in their data; other notifications (the M1 test alarms) are left alone. */
export const ROUND_ALARM_KIND = 'round_alarm';

/** The data of a round alarm: what the alarm screen (M3-32) opens, and the fingerprint of the request. */
export interface RoundAlarmData extends Record<string, unknown> {
  kind: typeof ROUND_ALARM_KIND;
  alarm: PlannedAlarm['kind'];
  route_id: string;
  schedule_id: string;
  scheduled_at: string;
  /** Title, body and trigger time: a pending alarm with the same identifier and fingerprint is kept as it is. */
  fingerprint: string;
}

/** The identifier of an alarm's notification. */
export const alarmIdentifier = (kind: PlannedAlarm['kind'], slot: AlarmSlot) => `${kind}:${slot.schedule_id}:${slot.scheduled_at}`;

export type RoundAlarmRequest = NotificationRequestInput & { identifier: string; content: { data: RoundAlarmData } };

export interface AlarmContext {
  timezone: string;
  routeNames: ReadonlyMap<string, string>;
  /** Device clock minus trusted time: the system fires notifications by the device clock. */
  clockOffsetMs: number;
}

/** The notification requests of the plan. Android: alarmClock delivery, iOS: time-sensitive (see decisions, M1-06). */
export function alarmRequests(plan: readonly PlannedAlarm[], context: AlarmContext): RoundAlarmRequest[] {
  return plan.map((alarm) => {
    const time = localTimeOf(parseTimestamp(alarm.scheduled_at), context.timezone);
    const title = context.routeNames.get(alarm.route_id) ?? '';
    const body = t(`alarm.notification.${alarm.kind}${alarm.login ? 'Login' : ''}`, { time });
    const date = new Date(parseTimestamp(alarm.fire_at) + context.clockOffsetMs);
    return {
      identifier: alarmIdentifier(alarm.kind, alarm),
      content: {
        title,
        body,
        data: { kind: ROUND_ALARM_KIND, alarm: alarm.kind, route_id: alarm.route_id, schedule_id: alarm.schedule_id, scheduled_at: alarm.scheduled_at, fingerprint: JSON.stringify([title, body, date.getTime()]) },
        sound: ROUND_ALARM_SOUND,
        vibrate: ROUND_ALARM_VIBRATION,
        interruptionLevel: 'timeSensitive',
      },
      trigger: { type: SchedulableTriggerInputTypes.DATE, date, channelId: ROUNDS_CHANNEL_ID, delivery: 'alarmClock' },
    };
  });
}

/** Makes the pending round alarms exactly the requests: cancels the ones not wanted or changed, schedules the new ones. */
export async function replaceRoundAlarms(requests: readonly RoundAlarmRequest[]): Promise<void> {
  const wanted = new Map(requests.map((request) => [request.identifier, request]));
  for (const { identifier, content } of await getAllScheduledNotificationsAsync()) {
    if (content.data?.kind !== ROUND_ALARM_KIND) continue;
    if (wanted.get(identifier)?.content.data.fingerprint === content.data.fingerprint) wanted.delete(identifier);
    else await cancelScheduledNotificationAsync(identifier);
  }
  for (const request of wanted.values()) await scheduleNotificationAsync(request);
}

/** Recomputes the plan at the trusted time and replaces the pending round alarms (none on a phone that is not enrolled). */
export async function rescheduleRoundAlarms(db: Database, readClock: ReadClock = readDeviceClock): Promise<void> {
  const clock = readClock();
  const now = trustedTime(db, clock).time;
  const state = loadGuardState(db, now);
  const plan = state === null ? [] : alarmPlan(state, now);
  const routeIds = [...new Set(plan.map((alarm) => alarm.route_id))];
  const routeNames = new Map(
    db
      .select({ id: routes.id, name: routes.name })
      .from(routes)
      .where(inArray(routes.id, routeIds))
      .all()
      .map((route) => [route.id, route.name]),
  );
  const context = { timezone: state?.timezone ?? 'UTC', routeNames, clockOffsetMs: parseTimestamp(clock.device_time) - parseTimestamp(now) };
  await replaceRoundAlarms(alarmRequests(plan, context));
}

/** What changes the plan: a shift starting or closing, a round starting (its first scan) or closing. */
function changesPlan(entry: ChainEntry): boolean {
  switch (entry.type) {
    case 'shift_started':
    case 'shift_closed':
    case 'round_closed':
      return true;
    case 'scan':
      return entry.payload.round_id !== null && entry.payload.checkpoint_id !== null;
    default:
      return false;
  }
}

let database: Database | null = null;
let running: Promise<void> | null = null;
let again = false;
let stopAlarms: (() => void) | null = null;

/**
 * A rescheduling now; one already running is followed by one more (requests meanwhile are merged into it). Resolves
 * when the list is current. Skipped before startRoundAlarms().
 */
export function requestAlarmReschedule(): Promise<void> {
  if (database === null) return Promise.resolve();
  if (running !== null) {
    again = true;
    return running;
  }
  const run = (async () => {
    do {
      again = false;
      const db = database;
      if (db === null) break;
      try {
        await rescheduleRoundAlarms(db);
      } catch (error) {
        if (__DEV__) console.warn('Rescheduling the round alarms failed', error);
      }
    } while (again);
    running = null;
  })();
  running = run;
  return run;
}

/**
 * Starts the round alarms: the rounds channel, alarms shown in the foreground too, and the reschedule triggers –
 * start, pull, shift start and close, round start and close, every notification, coming to the foreground.
 * Returns the function that stops them; a second call restarts them.
 */
export function startRoundAlarms(db: Database): () => void {
  stopAlarms?.();
  database = db;
  showAlarmsInForeground();

  const unsubscribePull = onConfigurationPulled(() => void requestAlarmReschedule());
  const unsubscribeChain = onChainEntries((entries) => {
    if (entries.some(changesPlan)) void requestAlarmReschedule();
  });
  const received = addNotificationReceivedListener(() => void requestAlarmReschedule());
  const response = addNotificationResponseReceivedListener(() => void requestAlarmReschedule());
  let active = AppState.currentState === 'active';
  const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active' && !active) void requestAlarmReschedule();
    active = state === 'active';
  });

  ensureRoundsChannel()
    .catch((error: unknown) => {
      if (__DEV__) console.warn('Creating the rounds channel failed', error);
    })
    .finally(() => void requestAlarmReschedule());

  const stop = () => {
    unsubscribePull();
    unsubscribeChain();
    received.remove();
    response.remove();
    appStateSubscription.remove();
    if (database === db) database = null;
    if (stopAlarms === stop) stopAlarms = null;
  };
  stopAlarms = stop;
  return stop;
}
