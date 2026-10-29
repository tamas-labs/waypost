// The app's sync: one controller, its context (token and API client by the session), its steps, and the triggers of
// the specification (Szinkron protokoll / Mikor fut). startSync() is called once the database and the session are
// loaded; the chain writer calls notifyChainEntry(), the shift close requestSync('shift_closed').
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';

import { createApiClient, type ApiClient } from '@/api/client';
import { apiBaseUrl } from '@/api/config';
import { getDeviceCredentials, getSupervisorToken } from '@/auth/credentials';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { readClock } from '@/time/clock';
import { nowTimestamp } from '@/time/timestamp';
import { trustedTime } from '@/time/trusted-time';

import { createSyncController, type SyncController, type SyncOutcome, type SyncStep, type SyncTrigger } from './controller';
import { countPending } from './pending';
import { pullConfiguration } from './pull';
import { setSyncNowHandler, syncErrorKind, useSyncStatus } from './status';

/** Every 5 minutes while the app is in the foreground. */
export const FOREGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export interface SyncContext {
  db: Database;
  api: ApiClient;
  /** The device token on the site phone (a supervisor acting there too), the supervisor token on their own phone. */
  token: string;
  mode: 'site_phone' | 'supervisor_phone';
}

/** The context of a sync; null while the phone is not enrolled or has no API address. */
export async function syncContext(db: Database): Promise<SyncContext | null> {
  const { mode } = useSession.getState();
  if (mode !== 'site_phone' && mode !== 'supervisor_phone') return null;
  const baseUrl = apiBaseUrl(db);
  if (baseUrl === null) return null;
  const token = mode === 'site_phone' ? ((await getDeviceCredentials())?.token ?? null) : await getSupervisorToken();
  if (token === null) return null;
  return { db, api: createApiClient({ baseUrl }), token, mode };
}

/** The steps in the controller's order; push and media come in M4, the outbox in M5. */
export const syncSteps: Record<SyncStep, (context: SyncContext) => Promise<void>> = {
  push: async () => {},
  media: async () => {},
  outbox: async () => {},
  pull: async ({ db, api, token }) => {
    await pullConfiguration(db, api, token);
  },
};

let controller: SyncController | null = null;
let database: Database | null = null;
let stopSync: (() => void) | null = null;

/** Recounts what waits for upload (after a chain entry, a photo or an outbox call is written). */
export function refreshPendingCount(): void {
  if (database !== null) useSyncStatus.setState({ pendingCount: countPending(database).total });
}

/** A sync now (or right after the running one); skipped before startSync(). */
export function requestSync(trigger: SyncTrigger): Promise<SyncOutcome> {
  return controller?.sync(trigger) ?? Promise.resolve({ status: 'skipped' });
}

/** After a chain entry: a sync 2 s later, merged with the entries written meanwhile. */
export function notifyChainEntry(): void {
  refreshPendingCount();
  controller?.syncSoon('chain_entry');
}

function finished(db: Database, outcome: SyncOutcome): void {
  const pendingCount = countPending(db).total;
  if (outcome.status === 'ok') {
    const lastSuccessAt = trustedTime(db, readClock()).time;
    setKv(db, 'sync.last_success_at', lastSuccessAt);
    useSyncStatus.setState({ running: false, pendingCount, lastSuccessAt, lastError: null });
  } else if (outcome.status === 'failed') {
    const { step, error } = outcome;
    if (__DEV__) console.warn(`Sync failed at ${step ?? 'context'}`, error);
    const lastError = { kind: syncErrorKind(error), step, message: error instanceof Error ? error.message : String(error), at: nowTimestamp() };
    useSyncStatus.setState({ running: false, pendingCount, lastError });
  } else {
    useSyncStatus.setState({ running: false, pendingCount });
  }
}

function isOnline(state: NetInfoState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/** Starts the sync and its triggers; returns the function that stops them. A second call restarts them. */
export function startSync(db: Database): () => void {
  stopSync?.();
  database = db;
  const sync = createSyncController({
    context: () => syncContext(db),
    steps: syncSteps,
    onStart: () => useSyncStatus.setState({ running: true }),
    onFinish: (outcome) => finished(db, outcome),
  });
  controller = sync;
  setSyncNowHandler(() => sync.sync('manual'));
  useSyncStatus.setState({ running: false, pendingCount: countPending(db).total, lastSuccessAt: getKv(db, 'sync.last_success_at'), lastError: null });

  let interval: ReturnType<typeof setInterval> | null = null;
  const startInterval = () => {
    interval ??= setInterval(() => void sync.sync('interval'), FOREGROUND_SYNC_INTERVAL_MS);
  };
  const stopInterval = () => {
    if (interval !== null) clearInterval(interval);
    interval = null;
  };

  let active = AppState.currentState === 'active';
  if (active) startInterval();
  const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active' && !active) {
      void sync.sync('foreground');
      startInterval();
    } else if (state !== 'active') {
      stopInterval();
    }
    active = state === 'active';
  });

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const online = isOnline(state);
    const wasOnline = useSyncStatus.getState().online;
    useSyncStatus.setState({ online });
    if (online && wasOnline === false) void sync.sync('online');
  });

  // Enrollment, login and logout change the token: the new one starts with a sync (after enrollment the full pull).
  const unsubscribeSession = useSession.subscribe((state, previous) => {
    if (state.mode !== previous.mode) void sync.sync('session');
  });

  void sync.sync('start');

  const stop = () => {
    sync.dispose();
    stopInterval();
    appStateSubscription.remove();
    unsubscribeNetInfo();
    unsubscribeSession();
    if (controller === sync) controller = null;
    if (stopSync === stop) stopSync = null;
    setSyncNowHandler(() => Promise.resolve({ status: 'skipped' }));
  };
  stopSync = stop;
  return stop;
}
