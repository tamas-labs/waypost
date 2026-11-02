// The app's sync: one controller, its context (token and API client by the session), its steps, and the triggers of
// the specification (Szinkron protokoll / Mikor fut). startSync() is called once the database and the session are
// loaded; it follows the chain writer's events, and the shift close calls requestSync('shift_closed').
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import { createApiClient, type ApiClient } from '@/api/client';
import { apiBaseUrl } from '@/api/config';
import { push, pushFinal } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import { getDeviceCredentials, getSupervisorToken } from '@/device/credentials';
import { whileInForeground } from '@/device/foreground';
import { useSession } from '@/auth/session';
import { onChainEntries } from '@/chain/events';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { readClock } from '@/time/clock';
import { nowTimestamp } from '@/time/timestamp';
import { trustedTime } from '@/time/trusted-time';

import { cleanUpIfDue } from './cleanup';
import { createSyncController, type SyncController, type SyncOutcome, type SyncStep, type SyncTrigger } from './controller';
import { uploadPhotos } from './media';
import { onOutboxQueued, outboxRejections, resetOutboxBackoff, sendOutbox } from './outbox';
import { countPending } from './pending';
import { pullConfiguration } from './pull';
import { pushChainEntries, sendPendingDiagnostic, type SendBatch } from './push';
import { closeUpload, forgetDevice, isRevoked, markRevoked } from './revocation';
import { setSyncNowHandler, syncErrorKind, useSyncStatus } from './status';

/** Every 5 minutes while the app is in the foreground. */
export const FOREGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export interface SyncContext {
  db: Database;
  api: ApiClient;
  /** The device token on the site phone (a supervisor acting there too), the supervisor token on their own phone. */
  token: string;
  mode: 'site_phone' | 'supervisor_phone';
  /** The site phone's ID; null on a supervisor's own phone, which has no chain. */
  deviceId: string | null;
  /** The server has revoked this site phone: this sync is part of its last upload (revocation.ts). */
  revoked: boolean;
  /** The photos the push responses of this sync asked for. */
  mediaMissing: Set<string>;
}

/** The context of a sync; null while the phone is not enrolled or has no API address. */
export async function syncContext(db: Database): Promise<SyncContext | null> {
  const { mode } = useSession.getState();
  if (mode !== 'site_phone' && mode !== 'supervisor_phone') return null;
  const baseUrl = apiBaseUrl(db);
  if (baseUrl === null) return null;
  const token = mode === 'site_phone' ? ((await getDeviceCredentials())?.token ?? null) : await getSupervisorToken();
  if (token === null) return null;
  const deviceId = mode === 'site_phone' ? getKv(db, 'device.id') : null;
  if (mode === 'site_phone' && deviceId === null) return null;
  return { db, api: createApiClient({ baseUrl }), token, mode, deviceId, revoked: isRevoked(db), mediaMissing: new Set() };
}

/**
 * The steps in the controller's order. On a revoked phone they are its last upload: the batches go to push-final, the
 * photos as always, its outbox calls cannot go any more, and instead of a pull the upload closes.
 */
export const syncSteps: Record<SyncStep, (context: SyncContext) => Promise<void>> = {
  push: async ({ db, api, token, deviceId, revoked, mediaMissing }) => {
    if (deviceId === null) return;
    const send: SendBatch = (entries) =>
      revoked ? pushFinal(api, token, { device_id: deviceId, entries, done: false }) : push(api, token, { device_id: deviceId, entries });
    await pushChainEntries({ db, deviceId, mediaMissing }, send);
    await sendPendingDiagnostic(db, api, token);
  },
  media: async ({ db, api, token, deviceId, mediaMissing }) => {
    if (deviceId !== null) await uploadPhotos({ db, api, token, deviceId, mediaMissing });
  },
  outbox: async ({ db, api, token, revoked }) => {
    if (!revoked) await sendOutbox({ db, api, token });
  },
  pull: async ({ db, api, token, deviceId, revoked }) => {
    if (revoked && deviceId !== null) {
      await closeUpload(api, token, deviceId);
      await forgetDevice(db);
      return;
    }
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

/** Resolves when no sync runs (e.g. before the local data is deleted, so that a pull cannot write it back). */
export function whenSyncIdle(): Promise<void> {
  return controller?.idle() ?? Promise.resolve();
}

/** A sync now (or right after the running one); skipped before startSync(). */
export function requestSync(trigger: SyncTrigger): Promise<SyncOutcome> {
  return controller?.sync(trigger) ?? Promise.resolve({ status: 'skipped' });
}

function finished(db: Database, outcome: SyncOutcome): void {
  const pendingCount = countPending(db).total;
  if (outcome.status === 'ok') {
    const lastSuccessAt = trustedTime(db, readClock()).time;
    setKv(db, 'sync.last_success_at', lastSuccessAt);
    useSyncStatus.setState({ running: false, pendingCount, lastSuccessAt, lastError: null });
    try {
      cleanUpIfDue(db);
    } catch (error) {
      console.error('The local cleanup failed', error);
    }
  } else if (outcome.status === 'failed') {
    const { step, error } = outcome;
    if (__DEV__) console.warn(`Sync failed at ${step ?? 'context'}`, error);
    const lastError = {
      kind: syncErrorKind(error),
      step,
      message: error instanceof Error ? error.message : String(error),
      at: nowTimestamp(),
    };
    useSyncStatus.setState({ running: false, pendingCount, lastError });
  } else {
    useSyncStatus.setState({ running: false, pendingCount });
  }
}

/**
 * The server has revoked this site phone. At the first such answer the last upload starts. The same answer during the
 * upload means it is closed already (an earlier done: true whose response was lost): there is nothing more to send.
 */
function followRevocation(db: Database, outcome: SyncOutcome, sync: SyncController): void {
  if (outcome.status !== 'failed' || !isApiError(outcome.error, 'device_revoked') || useSession.getState().mode !== 'site_phone') return;
  if (isRevoked(db)) {
    forgetDevice(db).catch((error: unknown) => console.error('Forgetting the revoked device failed', error));
  } else {
    markRevoked(db);
    void sync.sync('revoked');
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
    onFinish: (outcome) => {
      finished(db, outcome);
      followRevocation(db, outcome, sync);
    },
  });
  controller = sync;
  // "Sync now" and the network coming back send the waiting supervisor actions at once, whatever their backoff.
  setSyncNowHandler(() => {
    resetOutboxBackoff(db);
    return sync.sync('manual');
  });
  useSyncStatus.setState({
    running: false,
    pendingCount: countPending(db).total,
    lastSuccessAt: getKv(db, 'sync.last_success_at'),
    lastError: null,
    replaced: false,
    rejectedCalls: outboxRejections(db),
  });

  const stopForeground = whileInForeground(
    () => void sync.sync('interval'),
    FOREGROUND_SYNC_INTERVAL_MS,
    () => void sync.sync('foreground'),
  );

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const online = isOnline(state);
    const wasOnline = useSyncStatus.getState().online;
    useSyncStatus.setState({ online });
    if (online && wasOnline === false) {
      resetOutboxBackoff(db);
      void sync.sync('online');
    }
  });

  // Enrollment, login and logout change the token: the new one starts with a sync (after enrollment the full pull).
  const unsubscribeSession = useSession.subscribe((state, previous) => {
    if (state.mode !== previous.mode) void sync.sync('session');
  });

  // After a chain entry: a sync 2 s later, merged with the entries written meanwhile.
  const unsubscribeChainEntries = onChainEntries(() => {
    refreshPendingCount();
    sync.syncSoon('chain_entry');
  });

  // After a supervisor action: like after a chain entry.
  const unsubscribeOutbox = onOutboxQueued(() => {
    refreshPendingCount();
    sync.syncSoon('outbox');
  });

  void sync.sync('start');

  const stop = () => {
    sync.dispose();
    stopForeground();
    unsubscribeNetInfo();
    unsubscribeSession();
    unsubscribeChainEntries();
    unsubscribeOutbox();
    if (controller === sync) controller = null;
    if (stopSync === stop) stopSync = null;
    setSyncNowHandler(() => Promise.resolve({ status: 'skipped' }));
  };
  stopSync = stop;
  return stop;
}
