import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { deleteKv, setKv } from '@/db/kv';
import { createTestDatabase } from '@/db/testing';
import { scan } from '@/chain/payloads';
import { guardLogin } from '@/domain/shift';
import { C1, GUARD, idSequence, local, ROUTE_A, SCHEDULE_A } from '@/domain/testing';
import { runSchedulerStep } from '@/guard/scheduler';
import { loadGuardState } from '@/guard/state';
import { seedSite } from '@/guard/testing';
import { emitConfigurationPulled } from '@/sync/events';
import type { PullSummary } from '@/sync/pull';

import { alarmRequests, requestAlarmReschedule, rescheduleRoundAlarms, ROUND_ALARM_KIND, startRoundAlarms } from './round-alarms';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn(() => Promise.resolve({ status: 'skipped' })) }));
jest.mock('expo-notifications', () => ({
  ...jest.requireActual<object>('expo-notifications/build/NotificationChannelManager.types'),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));

const native = jest.mocked(Notifications);
/** The system's pending notifications. */
let pending: Map<string, Notifications.NotificationRequestInput>;
let db: Database;
let appStateListener: (state: AppStateStatus) => void;
let notificationReceived: () => void;
let notificationTapped: () => void;
const removed = jest.fn();

/** Lets every promise started by a trigger settle (setImmediate is not faked). */
const flush = () => new Promise((resolve) => setImmediate(resolve));
const roundAlarms = () => [...pending.values()].filter((request) => request.content.data?.kind === ROUND_ALARM_KIND);
const has = (identifier: string) => pending.has(identifier);
const reminderA = (time: string) => `reminder:${SCHEDULE_A}:${local(time)}`;

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('19:00')), doNotFake: ['setImmediate'] });
  ({ db } = await createTestDatabase());
  await seedSite(db);
  jest.clearAllMocks();
  pending = new Map();
  native.scheduleNotificationAsync.mockImplementation(async (request) => {
    pending.set(request.identifier!, request);
    return request.identifier!;
  });
  native.cancelScheduledNotificationAsync.mockImplementation(async (identifier) => {
    pending.delete(identifier);
  });
  native.getAllScheduledNotificationsAsync.mockImplementation(async () => [...pending.entries()].map(([identifier, request]) => ({ identifier, content: request.content, trigger: request.trigger }) as unknown as Notifications.NotificationRequest));
  native.addNotificationReceivedListener.mockImplementation((listener) => {
    notificationReceived = () => listener({} as Parameters<typeof listener>[0]);
    return { remove: removed };
  });
  native.addNotificationResponseReceivedListener.mockImplementation((listener) => {
    notificationTapped = () => listener({} as Parameters<typeof listener>[0]);
    return { remove: removed };
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as typeof appStateListener;
    return { remove: removed };
  });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function login() {
  const now = new Date().toISOString();
  await appendChainEntries(db, guardLogin(loadGuardState(db, now)!, GUARD, now, idSequence()).drafts);
}

describe('round alarm requests', () => {
  it('name the route, give the local time, ask for a login if needed, and fire by the device clock', () => {
    const alarm = { kind: 'reminder', route_id: ROUTE_A, schedule_id: SCHEDULE_A, scheduled_at: local('20:00'), fire_at: local('20:05'), login: true } as const;
    const [request] = alarmRequests([alarm], { timezone: 'Europe/Budapest', routeNames: new Map([[ROUTE_A, 'Kerítés']]), clockOffsetMs: -60_000 });
    const date = new Date(Date.parse(local('20:04')));
    expect(request).toEqual({
      identifier: `reminder:${SCHEDULE_A}:${local('20:00')}`,
      content: {
        title: 'Kerítés',
        body: '20:00 – a kör még nem indult el. Lépj be a PIN-kódoddal.',
        data: { kind: ROUND_ALARM_KIND, alarm: 'reminder', route_id: ROUTE_A, schedule_id: SCHEDULE_A, scheduled_at: local('20:00'), fingerprint: JSON.stringify(['Kerítés', '20:00 – a kör még nem indult el. Lépj be a PIN-kódoddal.', date.getTime()]) },
        sound: 'round_alarm.wav',
        vibrate: expect.any(Array),
        interruptionLevel: 'timeSensitive',
      },
      trigger: { type: 'date', date, channelId: 'rounds', delivery: 'alarmClock' },
    });
    const [round] = alarmRequests([{ ...alarm, kind: 'round', fire_at: alarm.scheduled_at, login: false }], { timezone: 'Europe/Budapest', routeNames: new Map(), clockOffsetMs: 0 });
    expect(round?.content).toMatchObject({ title: '', body: '20:00 – indul a kör.' });
  });
});

describe('rescheduling the round alarms', () => {
  it('schedules the plan of the next 36 hours', async () => {
    await rescheduleRoundAlarms(db);
    expect(roundAlarms()).toHaveLength(24);
    expect(pending.get(`round:${SCHEDULE_A}:${local('20:00')}`)?.content).toMatchObject({ title: 'Útvonal 61', body: '20:00 – indul a kör. Lépj be a PIN-kódoddal.' });
  });

  it('touches only what changed, e.g. the texts of the rounds a shift now covers', async () => {
    await rescheduleRoundAlarms(db);
    native.scheduleNotificationAsync.mockClear();
    await rescheduleRoundAlarms(db);
    expect(native.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(native.cancelScheduledNotificationAsync).not.toHaveBeenCalled();

    await login();
    await rescheduleRoundAlarms(db);
    // Tonight's 6 rounds need no login any more; the next night's still do.
    expect(native.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(12);
    expect(native.scheduleNotificationAsync).toHaveBeenCalledTimes(12);
    expect(pending.get(`round:${SCHEDULE_A}:${local('20:00')}`)?.content.body).toBe('20:00 – indul a kör.');
    expect(roundAlarms()).toHaveLength(24);
  });

  it('fires by the device clock when it differs from the trusted time', async () => {
    // The last sync said 19:10 at uptime 4 400 000: the trusted time now is 19:20, the device clock 19:00.
    setKv(db, 'sync.time_ref', { server_time: local('19:10'), uptime_ms: 4_400_000, boot_id: 'android-boot:12' });
    await rescheduleRoundAlarms(db);
    const trigger = pending.get(`round:${SCHEDULE_A}:${local('20:00')}`)?.trigger as { date: Date };
    expect(trigger.date).toEqual(new Date(Date.parse(local('19:40'))));
  });

  it('leaves other notifications alone, and removes every round alarm from a phone that is not enrolled', async () => {
    pending.set('test', { content: { title: 'Próba', data: { kind: 'm1-06-test' } }, trigger: null });
    await rescheduleRoundAlarms(db);
    deleteKv(db, 'device.id');
    await rescheduleRoundAlarms(db);
    expect([...pending.keys()]).toEqual(['test']);
  });
});

describe('round alarm triggers', () => {
  it('reschedule at start, after a pull, at every notification and in the foreground', async () => {
    const stop = startRoundAlarms(db);
    await flush();
    expect(roundAlarms()).toHaveLength(24);
    expect(native.setNotificationHandler).toHaveBeenCalled();

    const reschedules = () => native.getAllScheduledNotificationsAsync.mock.calls.length;
    const before = reschedules();
    emitConfigurationPulled({} as PullSummary);
    await flush();
    notificationReceived();
    await flush();
    notificationTapped();
    await flush();
    appStateListener('background');
    appStateListener('active');
    await flush();
    expect(reschedules()).toBe(before + 4);

    stop();
    expect(removed).toHaveBeenCalledTimes(3);
    emitConfigurationPulled({} as PullSummary);
    await flush();
    expect(reschedules()).toBe(before + 4);
  });

  it('merge the requests made while a rescheduling runs into one more', async () => {
    const stop = startRoundAlarms(db);
    await flush();
    const before = native.getAllScheduledNotificationsAsync.mock.calls.length;
    await Promise.all([requestAlarmReschedule(), requestAlarmReschedule(), requestAlarmReschedule()]);
    await flush();
    expect(native.getAllScheduledNotificationsAsync.mock.calls.length).toBe(before + 2);
    stop();
  });

  it('follow the chain: the shift start, and the round start cancelling its reminder', async () => {
    const stop = startRoundAlarms(db);
    await flush();
    await login();
    await flush();
    expect(pending.get(`round:${SCHEDULE_A}:${local('20:00')}`)?.content.body).toBe('20:00 – indul a kör.');

    jest.setSystemTime(Date.parse(local('20:01')));
    await runSchedulerStep(db);
    await flush();
    expect(has(reminderA('20:00'))).toBe(true);

    const round = loadGuardState(db, local('20:01'))!.rounds[0]!;
    await appendChainEntries(db, [scan({ scan_id: idSequence(2000)(), round_id: round.id, checkpoint_id: C1, method: 'nfc', tag_uid: '04A1B2C3D4E501', location: null })]);
    await flush();
    expect(has(reminderA('20:00'))).toBe(false);
    expect(has(reminderA('21:00'))).toBe(true);
    stop();
  });
});
