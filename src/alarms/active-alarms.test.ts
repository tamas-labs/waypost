import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import { useSession } from '@/auth/session';
import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { createTestDatabase } from '@/db/testing';
import { guardLogin } from '@/domain/shift';
import { GUARD, idSequence, local, ROUTE_A, ROUTE_B, SCHEDULE_A, SCHEDULE_B } from '@/domain/testing';
import { loadGuardState } from '@/guard/state';
import { seedSite } from '@/guard/testing';
import { nowTimestamp } from '@/time/timestamp';

import { clearAlarm, muteAlarm, raiseAlarm, startAlarmScreen, useActiveAlarms } from './active-alarms';
import { showAlarmsInForeground } from './foreground';
import { ROUND_ALARM_KIND, type RoundAlarmData } from './round-alarms';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));
jest.mock('expo-notifications', () => ({
  ...jest.requireActual<object>('expo-notifications/build/NotificationChannelManager.types'),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  getPresentedNotificationsAsync: jest.fn(() => Promise.resolve([])),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));

const native = jest.mocked(Notifications);
const newId = idSequence();
const SLOT = { route_id: ROUTE_A, schedule_id: SCHEDULE_A, scheduled_at: local('20:00') };
const DATA: RoundAlarmData = { ...SLOT, kind: ROUND_ALARM_KIND, alarm: 'round', fingerprint: 'f' };

const notificationOf = (data: Record<string, unknown>) => ({ request: { identifier: 'n', content: { data } } }) as unknown as Notifications.Notification;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const alarms = () => useActiveAlarms.getState().alarms;

let db: Database;
let received: (notification: Notifications.Notification) => void;
let tapped: (response: Notifications.NotificationResponse) => void;
let appState: (state: AppStateStatus) => void;
let stop: () => void;

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('19:55')), doNotFake: ['setImmediate'] });
  jest.clearAllMocks();
  useActiveAlarms.setState({ alarms: [], muted: false });
  ({ db } = await createTestDatabase());
  await seedSite(db);
  useSession.setState({ mode: 'site_phone', activeUser: { id: GUARD, role: 'guard' }, shiftStart: null });
  await appendChainEntries(db, guardLogin(loadGuardState(db, nowTimestamp())!, GUARD, nowTimestamp(), newId).drafts);
  jest.setSystemTime(Date.parse(local('20:00')));

  native.addNotificationReceivedListener.mockImplementation((listener) => {
    received = listener;
    return { remove: jest.fn() };
  });
  native.addNotificationResponseReceivedListener.mockImplementation((listener) => {
    tapped = listener;
    return { remove: jest.fn() };
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appState = listener;
    return { remove: jest.fn() };
  });
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
  stop = startAlarmScreen(db);
});

afterEach(() => {
  stop();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('raising', () => {
  it('holds one alarm per round, the oldest first', () => {
    jest.setSystemTime(Date.parse(local('21:00')));
    const b = { ...DATA, route_id: ROUTE_B, schedule_id: SCHEDULE_B, scheduled_at: local('20:30') };
    const a = { ...DATA, scheduled_at: local('21:00') };
    raiseAlarm(db, a);
    raiseAlarm(db, b);
    raiseAlarm(db, { ...a, alarm: 'reminder' });
    expect(alarms().map((alarm) => alarm.route_id)).toEqual([ROUTE_A, ROUTE_B]);
  });

  it('does not hold an alarm without a logged-in guard', () => {
    useSession.setState({ activeUser: null });
    raiseAlarm(db, DATA);
    expect(alarms()).toEqual([]);
    useSession.setState({ activeUser: { id: 'supervisor', role: 'supervisor' } });
    raiseAlarm(db, DATA);
    expect(alarms()).toEqual([]);
  });

  it('does not hold an alarm whose round is over', () => {
    jest.setSystemTime(Date.parse(local('20:20')));
    raiseAlarm(db, DATA);
    expect(alarms()).toEqual([]);
  });

  it('rings again with the round\'s reminder after muting; clearing ends it and its notifications', () => {
    raiseAlarm(db, DATA);
    muteAlarm();
    expect(useActiveAlarms.getState().muted).toBe(true);
    raiseAlarm(db, { ...DATA, alarm: 'reminder' });
    expect(useActiveAlarms.getState().muted).toBe(false);

    clearAlarm(SLOT);
    expect(alarms()).toEqual([]);
    expect(native.dismissNotificationAsync.mock.calls.map(([id]) => id)).toEqual([`round:${SCHEDULE_A}:${local('20:00')}`, `reminder:${SCHEDULE_A}:${local('20:00')}`]);
  });
});

describe('triggers', () => {
  it('raises a round alarm that arrives or is tapped; other notifications do nothing', () => {
    received(notificationOf({ kind: 'test' }));
    tapped({ notification: notificationOf({}) } as Notifications.NotificationResponse);
    expect(alarms()).toEqual([]);
    received(notificationOf(DATA));
    expect(alarms()).toEqual([SLOT]);
    useActiveAlarms.setState({ alarms: [] });
    tapped({ notification: notificationOf(DATA) } as Notifications.NotificationResponse);
    expect(alarms()).toEqual([SLOT]);
  });

  it('coming to the foreground raises the alarms in the notification list, and clears those that are over', async () => {
    const old = { ...DATA, scheduled_at: local('19:00') };
    native.getPresentedNotificationsAsync.mockResolvedValue([notificationOf({ kind: 'test' }), notificationOf(DATA), notificationOf(old)]);
    appState('active');
    await flush();
    expect(alarms()).toEqual([SLOT]);
    expect(native.dismissNotificationAsync.mock.calls.map(([id]) => id)).toEqual([`round:${SCHEDULE_A}:${local('19:00')}`, `reminder:${SCHEDULE_A}:${local('19:00')}`]);
  });

  it('leaves the list alone without a logged-in guard: the alarm still asks for a login', async () => {
    useSession.setState({ activeUser: null });
    native.getPresentedNotificationsAsync.mockResolvedValue([notificationOf(DATA)]);
    appState('active');
    await flush();
    expect(native.getPresentedNotificationsAsync).not.toHaveBeenCalled();
    expect(alarms()).toEqual([]);
  });
});

describe('in the foreground', () => {
  const behaviour = async (data: Record<string, unknown>) => {
    showAlarmsInForeground();
    const { handleNotification } = native.setNotificationHandler.mock.lastCall![0]!;
    return handleNotification(notificationOf(data));
  };

  it('is silent for an alarm that rings on the screen, so it does not sound twice', async () => {
    expect(await behaviour(DATA)).toMatchObject({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false });
  });

  it('shows and sounds an alarm that asks for a login, and any other notification', async () => {
    expect(await behaviour({ kind: 'test' })).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
    useSession.setState({ activeUser: null });
    expect(await behaviour(DATA)).toMatchObject({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true });
  });
});
