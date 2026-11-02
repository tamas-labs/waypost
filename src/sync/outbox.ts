// The outbox (specification, Szinkron protokoll / Outbox): a supervisor action changes the local database and queues
// its REST calls in the same transaction; the sync sends them one by one in FIFO order, after the push and the photos,
// before the pull. A call keeps its Idempotency-Key over its retries, and a create carries the id the app generated, so
// a repeated call is recognised by the server (M5-02). What the server answers decides:
// - 2xx: the call is done, the records of the response are stored;
// - 401: the call waits, the sync fails (the token is not accepted, or the phone is revoked);
// - 429, network error, 5xx: retried later with exponential backoff, the sync fails;
// - 409 with Retry-After: the same call is still running on the server, retried after that;
// - any other 4xx: the call is dropped, the supervisor is told, and the next pull is a full one, so the local state
//   becomes the server's again.
import type { SchemaTypes, SyncPullResponse, Timestamp } from '@waypost/schema';
import { eq, sql } from 'drizzle-orm';

import type { ApiClient } from '@/api/client';
import { actingUserId, useSession } from '@/auth/session';
import type { ConfigCall, ConfigResponseSchema } from '@/api/config-calls';
import { ApiError, InvalidResponseError } from '@/api/errors';
import type { Database } from '@/db/database';
import { deleteKv, getKv, setKv, type OutboxRejection } from '@/db/kv';
import { outbox } from '@/db/schema';
import { uuidv7 } from '@/id/uuidv7';
import { nowTimestamp, toTimestamp } from '@/time/timestamp';

import { storeServerRecords } from './pull';
import { useSyncStatus } from './status';

type Changes = SyncPullResponse['changes'];
type OutboxRow = typeof outbox.$inferSelect;

/** The first retry: 5 s; every further one doubles, up to 10 minutes (specification, Outbox). */
export const OUTBOX_BACKOFF_MIN_MS = 5_000;
export const OUTBOX_BACKOFF_MAX_MS = 10 * 60_000;
/** ±20%, so that phones that lost the network together do not retry together. */
const JITTER = 0.2;
/** The supervisor sees the latest ones; older ones are dropped. */
const MAX_REJECTIONS = 50;

/** The delay before the given attempt (1: the first retry), with jitter, between 5 s and 10 minutes. */
export function outboxBackoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(OUTBOX_BACKOFF_MAX_MS, OUTBOX_BACKOFF_MIN_MS * 2 ** Math.max(0, attempt - 1));
  const jittered = base * (1 - JITTER + 2 * JITTER * random());
  return Math.round(Math.min(OUTBOX_BACKOFF_MAX_MS, Math.max(OUTBOX_BACKOFF_MIN_MS, jittered)));
}

// --- Queueing ---

export interface SupervisorAction {
  /** Changes the local database, in the transaction that queues the calls. */
  apply?: (tx: Database) => void;
  /** Sent in this order. */
  calls: readonly ConfigCall[];
}

type QueuedListener = () => void;
const listeners = new Set<QueuedListener>();

/** Called after an action's calls have been queued (the sync counts them and starts soon). Returns the unsubscribe function. */
export function onOutboxQueued(listener: QueuedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Applies a supervisor action to the local database and queues its calls, in one transaction: either both happen or
 * neither. actingUserId: the supervisor on the site phone (X-Acting-User), null with a supervisor's own token.
 * Returns the outbox IDs of the calls.
 */
export function queueAction(
  db: Database,
  action: SupervisorAction,
  actingUserId: string | null,
  now: Timestamp = nowTimestamp(),
): string[] {
  const ids = db.transaction((tx) => {
    action.apply?.(tx);
    return action.calls.map((call) => {
      const id = uuidv7();
      tx.insert(outbox)
        .values({
          id,
          method: call.method,
          path: call.path,
          body: call.body ?? null,
          body_schema: call.bodySchema ?? null,
          response_schema: call.responseSchema,
          record_ids: call.recordIds,
          idempotency_key: uuidv7(),
          acting_user_id: actingUserId,
          created_at: now,
        })
        .run();
      return id;
    });
  });
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      console.error('An outbox listener failed', error);
    }
  }
  return ids;
}

/** Queues an action of the supervisor using the phone now, in their name (auth/session.ts, actingUserId). */
export function queueSupervisorAction(db: Database, action: SupervisorAction): string[] {
  return queueAction(db, action, actingUserId(useSession.getState()));
}

// --- Sending ---

/** The calls in the order they were queued: by rowid, which grows with every insert even if the clock steps back. */
function firstCall(db: Database): OutboxRow | undefined {
  return db
    .select()
    .from(outbox)
    .orderBy(sql`rowid`)
    .limit(1)
    .get();
}

/** Due, or the wall clock has stepped back so far that the wait would be longer than any backoff. */
function isDue(row: OutboxRow, nowMs: number): boolean {
  if (row.next_attempt_at === null) return true;
  const at = Date.parse(row.next_attempt_at);
  return Number.isNaN(at) || nowMs >= at || at - nowMs > OUTBOX_BACKOFF_MAX_MS;
}

/** The records of a configuration write's response, as the lists of a pull page. */
const RESPONSE_RECORDS: { [S in ConfigResponseSchema]: (data: SchemaTypes[S]) => Partial<Changes> } = {
  'api/site.response': (data) => ({ sites: [data.site] }),
  'api/user.response': (data) => ({ users: [data.user] }),
  'api/checkpoint.response': (data) => ({ checkpoints: [data.checkpoint] }),
  'api/route.response': (data) => ({ routes: [data.route] }),
  'api/route-version.response': (data) => ({
    routes: [data.route],
    route_versions: [data.route_version],
    route_version_checkpoints: data.route_version_checkpoints,
  }),
  'api/schedule.response': (data) => ({ schedules: [data.schedule] }),
  'api/report-subscription.response': (data) => ({ report_subscriptions: [data.report_subscription] }),
  // The local record is deleted by the action already.
  'api/deleted.response': () => ({}),
};

function responseRecords(schema: string, data: unknown): Partial<Changes> {
  if (!(schema in RESPONSE_RECORDS)) return {};
  const records = RESPONSE_RECORDS[schema as ConfigResponseSchema] as (data: unknown) => Partial<Changes>;
  return records(data);
}

function succeeded(db: Database, row: OutboxRow, data: unknown): void {
  db.transaction((tx) => {
    tx.delete(outbox).where(eq(outbox.id, row.id)).run();
    storeServerRecords(tx, responseRecords(row.response_schema, data));
  });
}

function retryLater(db: Database, row: OutboxRow, delayMs: number, error: unknown, nowMs: number): void {
  db.update(outbox)
    .set({
      attempts: row.attempts + 1,
      next_attempt_at: toTimestamp(nowMs + Math.min(delayMs, OUTBOX_BACKOFF_MAX_MS)),
      last_error: error instanceof Error ? error.message : String(error),
    })
    .where(eq(outbox.id, row.id))
    .run();
}

/** The server has refused the call: it is dropped, the supervisor is told, and the next pull brings the full state. */
function rejected(db: Database, row: OutboxRow, error: ApiError, nowMs: number): void {
  const rejection: OutboxRejection = {
    call_id: row.id,
    method: row.method,
    path: row.path,
    status: error.status,
    code: error.code,
    message: error.message,
    details: error.details,
    at: toTimestamp(nowMs),
  };
  const rejections = [...(getKv(db, 'outbox.rejected') ?? []), rejection].slice(-MAX_REJECTIONS);
  db.transaction((tx) => {
    tx.delete(outbox).where(eq(outbox.id, row.id)).run();
    setKv(tx, 'outbox.rejected', rejections);
    // An incremental pull would not bring a record the server did not change.
    deleteKv(tx, 'sync.cursor');
  });
  useSyncStatus.setState({ rejectedCalls: rejections });
}

export interface OutboxContext {
  db: Database;
  api: ApiClient;
  /** The device token on the site phone (with each call's X-Acting-User), the supervisor token on their own phone. */
  token: string;
}

export interface SendOutboxOptions {
  /** Device wall clock, Unix ms. */
  now?: () => number;
  random?: () => number;
}

/**
 * The outbox step of the sync: sends the calls in order until the queue is empty or the first one has to wait. Throws
 * what stopped it (except a call still running on the server), so the sync tells the error and the pull does not run.
 */
export async function sendOutbox(
  { db, api, token }: OutboxContext,
  { now = Date.now, random = Math.random }: SendOutboxOptions = {},
): Promise<void> {
  for (let row = firstCall(db); row !== undefined && isDue(row, now()); row = firstCall(db)) {
    let data: unknown;
    try {
      ({ data } = await api.request({
        method: row.method,
        path: row.path,
        body: row.body ?? undefined,
        bodySchema: row.body_schema ?? undefined,
        responseSchema: row.response_schema,
        token,
        idempotencyKey: row.idempotency_key,
        actingUserId: row.acting_user_id,
      }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
      if (error instanceof ApiError && error.status === 429) {
        retryLater(
          db,
          row,
          error.retryAfterS === null ? outboxBackoffMs(row.attempts + 1, random) : error.retryAfterS * 1000,
          error,
          now(),
        );
        throw error;
      }
      if (error instanceof ApiError && error.status === 409 && error.retryAfterS !== null) {
        retryLater(db, row, Math.max(error.retryAfterS * 1000, OUTBOX_BACKOFF_MIN_MS), error, now());
        return;
      }
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        rejected(db, row, error, now());
        continue;
      }
      if (error instanceof InvalidResponseError && error.status >= 200 && error.status < 300) {
        // Done on the server, but the response cannot be stored: the full pull brings the records.
        db.transaction((tx) => {
          tx.delete(outbox).where(eq(outbox.id, row!.id)).run();
          deleteKv(tx, 'sync.cursor');
        });
        throw error;
      }
      retryLater(db, row, outboxBackoffMs(row.attempts + 1, random), error, now());
      throw error;
    }
    succeeded(db, row, data);
  }
}

/** The next sync sends at once: the network is back, or the supervisor asked for a sync. */
export function resetOutboxBackoff(db: Database): void {
  db.update(outbox).set({ next_attempt_at: null }).run();
}

// --- What the supervisor is told ---

export function outboxRejections(db: Database): OutboxRejection[] {
  return getKv(db, 'outbox.rejected') ?? [];
}

/** The supervisor has seen the refused calls. */
export function dismissOutboxRejections(db: Database): void {
  deleteKv(db, 'outbox.rejected');
  useSyncStatus.setState({ rejectedCalls: [] });
}

/** Drops the calls and the refusals: they cannot be sent any more (revoked phone, supervisor logout). */
export function clearOutbox(tx: Database): void {
  tx.delete(outbox).run();
  deleteKv(tx, 'outbox.rejected');
}
