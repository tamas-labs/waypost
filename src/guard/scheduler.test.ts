import { addNotificationReceivedListener, addNotificationResponseReceivedListener } from 'expo-notifications';
import { asc } from 'drizzle-orm';
import { AppState, type AppStateStatus } from 'react-native';

import { deleteDeviceCredentials } from '@/auth/credentials';
import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { deleteKv, setKv } from '@/db/kv';
import { rounds, shifts } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { guardLogin } from '@/domain/shift';
import { GUARD, idSequence, local } from '@/domain/testing';
import { requestSync } from '@/sync/runtime';

import { requestSchedulerStep, runSchedulerStep, SCHEDULER_INTERVAL_MS, startScheduler } from './scheduler';
import { loadGuardState } from './state';
import { seedSite } from './testing';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn(() => Promise.resolve({ status: 'skipped' })) }));
jest.mock('expo-notifications', () => ({ addNotificationReceivedListener: jest.fn(), addNotificationResponseReceivedListener: jest.fn() }));

let db: Database;
let appStateListener: (state: AppStateStatus) => void;
let notificationReceived: () => void;
let notificationTapped: () => void;
const removeAppState = jest.fn();
const removeReceived = jest.fn();
const removeResponse = jest.fn();

/** The rounds' times (local, Budapest) and statuses. */
const roundStatuses = () =>
  db
    .select({ scheduled_at: rounds.scheduled_at, status: rounds.status })
    .from(rounds)
    .orderBy(asc(rounds.scheduled_at))
    .all()
    .map((round) => [round.scheduled_at, round.status]);

/** The device clock at a local time; settles the steps a trigger started. */
const at = (time: string, date?: string) => jest.setSystemTime(Date.parse(local(time, date)));
const settle = () => jest.advanceTimersByTimeAsync(0);

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('19:55')) });
  ({ db } = await createTestDatabase());
  await seedSite(db);
  jest.mocked(requestSync).mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as typeof appStateListener;
    return { remove: removeAppState };
  });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.mocked(addNotificationReceivedListener).mockImplementation((listener) => {
    notificationReceived = () => listener({} as Parameters<typeof listener>[0]);
    return { remove: removeReceived };
  });
  jest.mocked(addNotificationResponseReceivedListener).mockImplementation((listener) => {
    notificationTapped = () => listener({} as Parameters<typeof listener>[0]);
    return { remove: removeResponse };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** GUARD logs in now. */
async function login() {
  const state = loadGuardState(db, new Date().toISOString())!;
  await appendChainEntries(db, guardLogin(state, GUARD, new Date().toISOString(), idSequence()).drafts);
}

describe('scheduler step', () => {
  it('opens the rounds due since the shift start, the missed one closed at once, and nothing at the next step', async () => {
    await login();
    at('21:10');
    const entries = await runSchedulerStep(db);
    expect(entries.map((entry) => entry.type)).toEqual(['round_opened', 'round_closed', 'round_opened', 'round_opened']);
    expect(roundStatuses()).toEqual([
      [local('20:00'), 'missed'],
      [local('20:30'), 'open'],
      [local('21:00'), 'open'],
    ]);
    await expect(runSchedulerStep(db)).resolves.toEqual([]);
  });

  it('does not open a round twice from steps at the same time', async () => {
    await login();
    at('20:01');
    const written = await Promise.all([runSchedulerStep(db), runSchedulerStep(db), runSchedulerStep(db)]);
    expect(written.map((entries) => entries.length)).toEqual([1, 0, 0]);
    expect(roundStatuses()).toEqual([[local('20:00'), 'open']]);
  });

  it('does nothing without an open shift or on a phone that is not enrolled', async () => {
    at('21:10');
    await expect(runSchedulerStep(db)).resolves.toEqual([]);
    await login();
    deleteKv(db, 'device.id');
    await expect(runSchedulerStep(db)).resolves.toEqual([]);
  });

  it('closes the shift automatically and syncs it at once', async () => {
    await login();
    at('00:30', '2026-11-04');
    const entries = await runSchedulerStep(db);
    expect(entries.at(-1)).toMatchObject({ type: 'shift_closed', payload: { closed_by: 'auto' } });
    expect(db.select({ closed_by: shifts.closed_by }).from(shifts).all()).toEqual([{ closed_by: 'auto' }]);
    expect(requestSync).toHaveBeenCalledWith('shift_closed');
    jest.mocked(requestSync).mockClear();
    at('00:40', '2026-11-04');
    await expect(runSchedulerStep(db)).resolves.toEqual([]);
    expect(requestSync).not.toHaveBeenCalled();
  });

  it('uses the trusted time, not a wrong wall clock', async () => {
    await login();
    at('20:01');
    // The wall clock is a day behind.
    const readClock = () => ({ device_time: local('20:01', '2026-11-02'), uptime_ms: 5_000_000, boot_id: 'android-boot:12' });
    setKv(db, 'sync.time_ref', { server_time: local('20:00'), uptime_ms: 4_940_000, boot_id: 'android-boot:12' });
    await runSchedulerStep(db, readClock);
    expect(roundStatuses()).toEqual([[local('20:00'), 'open']]);
  });
});

describe('scheduler runner', () => {
  it('steps at start and every 30 s in the foreground', async () => {
    await login();
    jest.setSystemTime(Date.parse(local('20:00')) - 10_000);
    const stop = startScheduler(db);
    await settle();
    expect(roundStatuses()).toEqual([]);
    await jest.advanceTimersByTimeAsync(SCHEDULER_INTERVAL_MS);
    expect(roundStatuses()).toEqual([[local('20:00'), 'open']]);
    stop();
  });

  it('stops the interval in the background and steps again in the foreground', async () => {
    await login();
    const stop = startScheduler(db);
    await settle();
    appStateListener('background');
    await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(roundStatuses()).toEqual([]);
    appStateListener('active');
    await settle();
    expect(roundStatuses()).toEqual([[local('20:00'), 'open']]);
    stop();
  });

  it('steps at every notification, arriving or tapped, and on request', async () => {
    await login();
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    const stop = startScheduler(db);
    await settle();
    at('20:00');
    notificationReceived();
    await settle();
    expect(roundStatuses()).toEqual([[local('20:00'), 'open']]);
    at('20:30');
    notificationTapped();
    await settle();
    expect(roundStatuses()).toEqual([
      [local('20:00'), 'missed'],
      [local('20:30'), 'open'],
    ]);
    at('21:00');
    requestSchedulerStep('shift_started');
    await settle();
    expect(roundStatuses()).toHaveLength(3);
    stop();
  });

  it('stops every trigger, and a request after the stop does nothing', async () => {
    await login();
    const stop = startScheduler(db);
    await settle();
    stop();
    expect(removeAppState).toHaveBeenCalled();
    expect(removeReceived).toHaveBeenCalled();
    expect(removeResponse).toHaveBeenCalled();
    at('20:00');
    requestSchedulerStep('shift_started');
    await jest.advanceTimersByTimeAsync(SCHEDULER_INTERVAL_MS);
    expect(roundStatuses()).toEqual([]);
  });

  it('logs a failed step in development and keeps running', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await login();
    const stop = startScheduler(db);
    await settle();
    await deleteDeviceCredentials();
    at('20:00');
    notificationReceived();
    await settle();
    expect(warn).toHaveBeenCalledWith('Scheduler step failed (notification)', expect.any(Error));
    stop();
  });
});
