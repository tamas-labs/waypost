// Push (specification, Szinkron protokoll / Push és média): the entries the server has not acknowledged, by seq, in
// batches of 200, until none is left. An acknowledged entry gets synced_at. The server rejects an entry only after a
// bug or tampering, and sending it again would not help: it is not sent again, the entries after it still go up (the
// server keeps them, as they wait for the hole), and one report goes to the server, outside the chain. A sync does not
// fail because of it: the configuration must keep coming.
//
// A batch the server refuses as a whole (422 validation_failed: an entry is not valid against its schema) is not
// stored there at all. The entries before the first invalid one go up in a batch of their own; the invalid one is
// kept and sent again at every sync, as a fix on the server (e.g. a schema version it should not have had) lets it
// through. The push step fails meanwhile, but the other steps of the sync still run (controller.ts). If the invalid
// entry is the first of the batch, the chain cannot go past it: the upload stops. That is reported once per entry
// (validation_failed diagnostic, to a server of @waypost/schema 0.9.0 or later), so the supervisor sees it in the
// report, and the sync indicator tells it (status.ts: upload_refused).
import type { ChainEntry, SyncPushRequest, SyncPushResponse } from '@waypost/schema';
import { and, asc, eq, gt, inArray, isNotNull, isNull, max } from 'drizzle-orm';

import { type ApiClient, schemaVersionAtLeast } from '@/api/client';
import { reportDiagnostic } from '@/api/endpoints';
import { ApiError, isApiError } from '@/api/errors';
import type { Database } from '@/db/database';
import { deleteKv, getKv, setKv } from '@/db/kv';
import { chainEntries } from '@/db/schema';
import { uuidv7 } from '@/id/uuidv7';
import { nowTimestamp } from '@/time/timestamp';

export const PUSH_BATCH_SIZE = 200;

/** The first @waypost/schema version whose server takes a validation_failed diagnostic. */
export const REFUSED_UPLOAD_DIAGNOSTIC_SINCE = '0.9.0';

export interface PushContext {
  db: Database;
  deviceId: string;
  /** Collects the photos the server asks for, for the media step. */
  mediaMissing: Set<string>;
}

/** Sends a batch: POST /sync/push, or on a revoked phone POST /sync/push-final. */
export type SendBatch = (entries: SyncPushRequest['entries']) => Promise<SyncPushResponse>;

function nextBatch(db: Database, deviceId: string, size: number = PUSH_BATCH_SIZE): ChainEntry[] {
  return db
    .select()
    .from(chainEntries)
    .where(
      and(
        eq(chainEntries.device_id, deviceId),
        isNull(chainEntries.synced_at),
        gt(chainEntries.seq, getKv(db, 'sync.rejected_through_seq') ?? 0),
      ),
    )
    .orderBy(asc(chainEntries.seq))
    .limit(size)
    .all()
    .map(({ synced_at: _synced_at, ...entry }) => entry as ChainEntry);
}

/**
 * Remembers what the response rejected: up to which seq, so it is not sent again, and for the first rejection of a
 * chain the report. What the server rejects after that is only the consequence of the first one.
 */
function recordRejected(tx: Database, deviceId: string, response: SyncPushResponse): void {
  const seqs = new Map(
    tx
      .select({ id: chainEntries.id, seq: chainEntries.seq })
      .from(chainEntries)
      .where(
        inArray(
          chainEntries.id,
          response.rejected.map((rejected) => rejected.id),
        ),
      )
      .all()
      .map((row) => [row.id, row.seq]),
  );
  const rejected = response.rejected.flatMap((entry) => {
    const seq = seqs.get(entry.id);
    return seq === undefined ? [] : [{ ...entry, seq }];
  });
  const first = rejected.reduce<(typeof rejected)[number] | null>(
    (lowest, entry) => (lowest === null || entry.seq < lowest.seq ? entry : lowest),
    null,
  );
  if (first === null) return;

  const through = getKv(tx, 'sync.rejected_through_seq');
  if (through === null) {
    setKv(tx, 'sync.pending_diagnostic', {
      id: uuidv7(),
      device_id: deviceId,
      code: first.code,
      entry_id: first.id,
      seq: first.seq,
      expected_seq: first.expected_seq,
      server_last_seq: response.last_seq,
      rejected_count: response.rejected.length,
      occurred_at: response.server_time,
    });
  }
  setKv(tx, 'sync.rejected_through_seq', Math.max(through ?? 0, ...rejected.map((entry) => entry.seq)));
}

function applyResponse(db: Database, deviceId: string, response: SyncPushResponse): void {
  db.transaction((tx) => {
    if (response.accepted.length > 0) {
      tx.update(chainEntries)
        .set({ synced_at: response.server_time })
        .where(and(inArray(chainEntries.id, response.accepted), isNull(chainEntries.synced_at)))
        .run();
    }
    if (response.rejected.length > 0) recordRejected(tx, deviceId, response);
  });
}

/**
 * The indexes of the entries of the batch that a validation_failed response names (its details are keyed by the
 * field path, e.g. "entries.3.payload.round_id"), in order; empty if the error is not one, or it names no entry.
 */
function invalidEntries(error: unknown): number[] {
  if (!isApiError(error, 'validation_failed') || error.details === null) return [];
  const indexes = Object.keys(error.details).flatMap((path) => {
    const match = /^entries\.(\d+)(?:\.|$)/.exec(path);
    return match?.[1] === undefined ? [] : [Number(match[1])];
  });
  return [...new Set(indexes)].sort((a, b) => a - b);
}

/**
 * The server refused the first entry of the batch: the report of it, once per entry, if the server takes one. A report
 * of rejected entries that still waits goes first; this one is made at a later sync then.
 */
function recordRefusedUpload(db: Database, deviceId: string, entry: ChainEntry, error: ApiError, named: number): void {
  if (getKv(db, 'sync.refused_entry') === entry.id || getKv(db, 'sync.pending_diagnostic') !== null) return;
  // An older server refuses the report (422): checked at every sync, as the server may be updated meanwhile.
  if (error.serverSchema === null || !schemaVersionAtLeast(error.serverSchema, REFUSED_UPLOAD_DIAGNOSTIC_SINCE)) return;
  const acknowledged = db
    .select({ seq: max(chainEntries.seq) })
    .from(chainEntries)
    .where(and(eq(chainEntries.device_id, deviceId), isNotNull(chainEntries.synced_at)))
    .get();
  db.transaction((tx) => {
    setKv(tx, 'sync.refused_entry', entry.id);
    setKv(tx, 'sync.pending_diagnostic', {
      id: uuidv7(),
      device_id: deviceId,
      code: 'validation_failed',
      entry_id: entry.id,
      seq: entry.seq,
      expected_seq: null,
      server_last_seq: acknowledged?.seq ?? 0,
      rejected_count: Math.min(PUSH_BATCH_SIZE, Math.max(1, named)),
      occurred_at: nowTimestamp(),
    });
  });
}

/**
 * The index of the first entry of the batch that a validation_failed response names (its details are keyed by the
 * field path, e.g. "entries.3.payload.round_id"); null if the error is not one, or it names no entry.
 */
export function firstInvalidEntry(error: unknown): number | null {
  return invalidEntries(error)[0] ?? null;
}

/** Sends the batches until nothing is left to send. A failed request (network, 5xx, a refused batch …) throws; the next sync goes on from there. */
export async function pushChainEntries({ db, deviceId, mediaMissing }: PushContext, send: SendBatch): Promise<void> {
  /** The refusal of a batch whose valid start is being sent now; thrown once that is acknowledged. */
  let refused: unknown = null;
  let size = PUSH_BATCH_SIZE;
  for (;;) {
    const batch = nextBatch(db, deviceId, size);
    const [first, ...rest] = batch;
    if (first === undefined) return;
    let response: SyncPushResponse;
    try {
      response = await send([first, ...rest]);
    } catch (error) {
      const invalid = refused === null ? firstInvalidEntry(error) : null;
      if (invalid === 0 && error instanceof ApiError) recordRefusedUpload(db, deviceId, first, error, invalidEntries(error).length);
      if (invalid === null || invalid === 0 || invalid >= batch.length) throw error;
      refused = error;
      size = invalid;
      continue;
    }
    applyResponse(db, deviceId, response);
    for (const id of response.media_missing) mediaMissing.add(id);
    if (refused !== null) throw refused;
    // Every answer moves the first entry forward. If it did not, the next sync tries again, not this loop.
    if (nextBatch(db, deviceId)[0]?.id === first.id) return;
  }
}

/**
 * Sends the report of the rejected entries, if one is waiting. Only a revocation stops the sync: the next sync sends
 * a report the network or the server did not take, and one the server refuses is dropped, as it would be refused again.
 */
export async function sendPendingDiagnostic(db: Database, api: ApiClient, token: string): Promise<void> {
  const diagnostic = getKv(db, 'sync.pending_diagnostic');
  if (diagnostic === null) return;
  try {
    await reportDiagnostic(api, token, diagnostic);
    deleteKv(db, 'sync.pending_diagnostic');
  } catch (error) {
    if (isApiError(error, 'device_revoked')) throw error;
    if (__DEV__) console.warn('Reporting the rejected chain entries failed', error);
    if (error instanceof ApiError && error.status < 500 && error.status !== 401 && error.status !== 429) {
      deleteKv(db, 'sync.pending_diagnostic');
    }
  }
}
