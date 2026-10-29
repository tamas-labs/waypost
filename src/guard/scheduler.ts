// The scheduler runner (specification: Állapotgépek / Kör, Megnyitás): the domain's scheduler step at start, when the
// app comes to the foreground, at every notification and every 30 s in the foreground, its output written to the
// chain. Each step reads the state under the chain lock, so steps at the same time cannot open a round twice.
import type { ChainEntry } from '@waypost/schema';
import { addNotificationReceivedListener, addNotificationResponseReceivedListener } from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import { appendDecidedEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { schedulerStep } from '@/domain/rounds';
import { uuidv7 } from '@/id/uuidv7';
import { requestSync } from '@/sync/runtime';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { trustedTime } from '@/time/trusted-time';

import { loadGuardState } from './state';

/** Every 30 seconds while the app is in the foreground. */
export const SCHEDULER_INTERVAL_MS = 30 * 1000;

export type SchedulerTrigger = 'start' | 'foreground' | 'interval' | 'notification' | 'shift_started';

/**
 * One scheduler step at the trusted time; returns the entries written. Nothing happens without an open shift (or
 * on a phone that is not a site phone). The automatic shift close is synced at once, as a closing guard's is.
 */
export async function runSchedulerStep(db: Database, readClock: ReadClock = readDeviceClock): Promise<ChainEntry[]> {
  const { entries } = await appendDecidedEntries(
    db,
    () => {
      const now = trustedTime(db, readClock()).time;
      const state = loadGuardState(db, now);
      return { drafts: state === null ? [] : schedulerStep(state, now, uuidv7) };
    },
    { readClock },
  );
  if (entries.some((entry) => entry.type === 'shift_closed')) void requestSync('shift_closed');
  return entries;
}

let database: Database | null = null;
let stopScheduler: (() => void) | null = null;

function run(db: Database, trigger: SchedulerTrigger): void {
  runSchedulerStep(db).catch((error: unknown) => {
    if (__DEV__) console.warn(`Scheduler step failed (${trigger})`, error);
  });
}

/** A step now, e.g. right after the login started a shift; skipped before startScheduler(). */
export function requestSchedulerStep(trigger: SchedulerTrigger): void {
  if (database !== null) run(database, trigger);
}

/** Starts the scheduler and its triggers; returns the function that stops them. A second call restarts them. */
export function startScheduler(db: Database): () => void {
  stopScheduler?.();
  database = db;

  let interval: ReturnType<typeof setInterval> | null = null;
  const startInterval = () => {
    interval ??= setInterval(() => run(db, 'interval'), SCHEDULER_INTERVAL_MS);
  };
  const stopInterval = () => {
    if (interval !== null) clearInterval(interval);
    interval = null;
  };

  let active = AppState.currentState === 'active';
  if (active) startInterval();
  const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active' && !active) {
      run(db, 'foreground');
      startInterval();
    } else if (state !== 'active') {
      stopInterval();
    }
    active = state === 'active';
  });

  // Every notification of the app is a round alarm (M3-24): arriving while the app runs, or tapped.
  const received = addNotificationReceivedListener(() => run(db, 'notification'));
  const response = addNotificationResponseReceivedListener(() => run(db, 'notification'));

  run(db, 'start');

  const stop = () => {
    stopInterval();
    appStateSubscription.remove();
    received.remove();
    response.remove();
    if (database === db) database = null;
    if (stopScheduler === stop) stopScheduler = null;
  };
  stopScheduler = stop;
  return stop;
}
