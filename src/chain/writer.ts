// The chain writer: the only code that appends to chain_entries. One global lock serializes the writes, so the
// entries get seq 1, 2, 3 … in the order they were requested, each linked to the previous one by prev_hash. The
// entries of one request and their projections are written in one SQLite transaction: all of them or none.
import type { ChainEntry, ChainEntryOf, ChainEntryType, ChainPayloadMap, Timestamp } from '@waypost/schema';
import { desc, eq } from 'drizzle-orm';

import { schemaErrors } from '@/api/validation';
import { getDeviceCredentials } from '@/auth/credentials';
import type { Database } from '@/db/database';
import { getKv } from '@/db/kv';
import { chainEntries } from '@/db/schema';
import { uuidv7 } from '@/id/uuidv7';
import { notifyChainEntry } from '@/sync/runtime';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { chainTimeReference, getTimeReference } from '@/time/trusted-time';

import { GENESIS_HASH, signChainEntry } from './hmac';
import { applyProjection } from './projection';

/** What the domain decides about an entry; the writer adds the identity, the position and the clocks. */
export type ChainEntryDraft<T extends ChainEntryType = ChainEntryType> = {
  [K in T]: {
    type: K;
    payload: ChainPayloadMap[K];
    /** GNSS time of the location fix in the payload (Android, GPS provider); null otherwise. */
    gnss_time: Timestamp | null;
  };
}[T];

export interface ChainWriterOptions {
  readClock?: ReadClock;
  /** The HMAC key (device secret, base64); default: from the secure store. */
  readSecret?: () => Promise<string | null>;
}

export class ChainWriteError extends Error {
  override name = 'ChainWriteError';
}

let lock: Promise<unknown> = Promise.resolve();

/** Runs the tasks one at a time, in call order, whether the previous one succeeded or not. */
function withChainLock<R>(task: () => Promise<R>): Promise<R> {
  const run = lock.then(task, task);
  lock = run.catch(() => undefined);
  return run;
}

async function readDeviceSecret(): Promise<string | null> {
  return (await getDeviceCredentials())?.secret ?? null;
}

/**
 * Appends the drafts to the chain in one transaction, applying each to the projections; returns the signed entries.
 * Throws (and writes nothing) if the phone is not enrolled, an entry is invalid or a projection does not fit.
 */
export function appendChainEntries(db: Database, drafts: readonly ChainEntryDraft[], options: ChainWriterOptions = {}): Promise<ChainEntry[]> {
  const readClock = options.readClock ?? readDeviceClock;
  return withChainLock(async () => {
    if (drafts.length === 0) return [];
    const secret = await (options.readSecret ?? readDeviceSecret)();
    if (secret === null) throw new ChainWriteError('No device secret: the phone is not enrolled');

    const written = db.transaction((tx) => {
      const deviceId = getKv(tx, 'device.id');
      if (deviceId === null) throw new ChainWriteError('No device ID: the phone is not enrolled');
      const last = tx.select({ seq: chainEntries.seq, hash: chainEntries.hash }).from(chainEntries).where(eq(chainEntries.device_id, deviceId)).orderBy(desc(chainEntries.seq)).limit(1).get();
      const reference = chainTimeReference(getTimeReference(tx));
      let seq = last?.seq ?? 0;
      let prevHash = last?.hash ?? GENESIS_HASH;

      return drafts.map((draft) => {
        const clock = readClock();
        seq += 1;
        const entry = signChainEntry(
          { id: uuidv7(), device_id: deviceId, seq, type: draft.type, payload: draft.payload, ...clock, gnss_time: draft.gnss_time, ...reference, prev_hash: prevHash } as Omit<ChainEntry, 'hash'>,
          secret,
        ) as ChainEntry;
        if (__DEV__) {
          const errors = schemaErrors('chain/entry', entry);
          if (errors.length > 0) throw new ChainWriteError(`Invalid ${entry.type} entry: ${errors.join('; ')}`);
        }
        tx.insert(chainEntries).values(entry).run();
        applyProjection(tx, entry);
        prevHash = entry.hash;
        return entry;
      });
    });

    notifyChainEntry();
    return written;
  });
}

/** Appends one entry; see appendChainEntries. */
export async function appendChainEntry<T extends ChainEntryType>(db: Database, draft: ChainEntryDraft<T>, options?: ChainWriterOptions): Promise<ChainEntryOf<T>> {
  const [entry] = await appendChainEntries(db, [draft as ChainEntryDraft], options);
  return entry as ChainEntryOf<T>;
}
