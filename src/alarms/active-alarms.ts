// The alarms ringing on the alarm screen (G4): a round alarm arriving, tapped, or still in the notification list when
// the app comes to the foreground, while a guard is logged in. Without one the alarm does not wait: the phone is on the
// PIN screen (a supervisor stays where they are), and after the login the guard goes on to the round from the shift.
import { create } from 'zustand';
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  dismissNotificationAsync,
  getPresentedNotificationsAsync,
  type Notification,
} from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import type { AlarmSlot } from '@/domain/alarms';
import { loadAlarmScreenInfo } from '@/guard/alarm';

import { setForegroundTakeover } from './foreground';
import { alarmIdentifier, ROUND_ALARM_KIND, type RoundAlarmData } from './round-alarms';

interface ActiveAlarms {
  /** Oldest first: the screen shows the first one, and the next one after it. */
  alarms: readonly AlarmSlot[];
  /** "Hang némítása" was pressed; the reminder of the round rings again. */
  muted: boolean;
}

export const useActiveAlarms = create<ActiveAlarms>(() => ({ alarms: [], muted: false }));

const sameSlot = (a: AlarmSlot, b: AlarmSlot) => a.schedule_id === b.schedule_id && a.scheduled_at === b.scheduled_at;

function roundAlarmOf(notification: Notification): RoundAlarmData | null {
  const data = notification.request.content.data;
  return data?.kind === ROUND_ALARM_KIND ? (data as RoundAlarmData) : null;
}

const guardLoggedIn = () => useSession.getState().activeUser?.role === 'guard';

/** The alarm screen opens for it: a guard is logged in, and the round is still waiting to start. */
function ringsOnScreen(db: Database, slot: AlarmSlot): boolean {
  return guardLoggedIn() && loadAlarmScreenInfo(db, slot) !== null;
}

export function raiseAlarm(db: Database, data: RoundAlarmData): void {
  if (!ringsOnScreen(db, data)) return;
  const { route_id, schedule_id, scheduled_at } = data;
  useActiveAlarms.setState(({ alarms }) => ({ muted: false, alarms: alarms.some((alarm) => sameSlot(alarm, data)) ? alarms : [...alarms, { route_id, schedule_id, scheduled_at }] }));
}

export function muteAlarm(): void {
  useActiveAlarms.setState({ muted: true });
}

/** The screen is done with the alarm: the next one comes, with its sound; its notifications leave the list. */
export function clearAlarm(slot: AlarmSlot): void {
  useActiveAlarms.setState(({ alarms }) => ({ muted: false, alarms: alarms.filter((alarm) => !sameSlot(alarm, slot)) }));
  dismissAlarmNotifications(slot);
}

export function clearAllAlarms(): void {
  useActiveAlarms.setState({ muted: false, alarms: [] });
}

function dismissAlarmNotifications(slot: AlarmSlot): void {
  for (const kind of ['round', 'reminder'] as const) {
    dismissNotificationAsync(alarmIdentifier(kind, slot)).catch((error: unknown) => {
      if (__DEV__) console.warn('Dismissing an alarm notification failed', error);
    });
  }
}

/** The app comes to the foreground without a tap (iOS: "az app megnyitásakor"): what is in the list rings; what is over leaves it. */
async function raisePresentedAlarms(db: Database): Promise<void> {
  if (!guardLoggedIn()) return;
  for (const notification of await getPresentedNotificationsAsync()) {
    const data = roundAlarmOf(notification);
    if (data === null) continue;
    if (ringsOnScreen(db, data)) raiseAlarm(db, data);
    else dismissAlarmNotifications(data);
  }
}

/** Starts the triggers of the alarm screen; returns the function that stops them. */
export function startAlarmScreen(db: Database): () => void {
  const raise = (notification: Notification) => {
    const data = roundAlarmOf(notification);
    if (data !== null) raiseAlarm(db, data);
  };
  setForegroundTakeover((notification) => {
    const data = roundAlarmOf(notification);
    return data !== null && ringsOnScreen(db, data);
  });
  const received = addNotificationReceivedListener(raise);
  const response = addNotificationResponseReceivedListener(({ notification }) => raise(notification));
  let active = AppState.currentState === 'active';
  const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active' && !active) {
      raisePresentedAlarms(db).catch((error: unknown) => {
        if (__DEV__) console.warn('Checking the presented alarms failed', error);
      });
    }
    active = state === 'active';
  });

  return () => {
    setForegroundTakeover(() => false);
    received.remove();
    response.remove();
    appStateSubscription.remove();
  };
}
