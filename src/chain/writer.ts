// The chain writer: the only code that appends to chain_entries. One global lock serializes the writes, so the
// entries get seq 1, 2, 3 … in the order they were requested, each linked to the previous one by prev_hash. The
// entries of one request and their projections are written in one SQLite transaction: all of them or none.
import type { ChainEntry, ChainEntryOf, ChainEntryType } from '@waypost/schema';
import { desc, eq } from 'drizzle-orm';

import { schemaErrors } from '@/schema/validation';
import { getDeviceCredentials } from '@/device/credentials';
import type { Database } from '@/db/database';
import { getKv } from '@/db/kv';
import { chainEntries } from '@/db/schema';
import { uuidv7 } from '@/id/uuidv7';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { chainTimeReference, getTimeReference } from '@/time/trusted-time';

import { emitChainEntries } from './events';
import { GENESIS_HASH, signChainEntry } from './hmac';
import { recordPhotos, repeatedPhotoErrors } from './media';
import type { ChainEntryDraft, PhotoFile } from './payloads';
import { applyProjection } from './projection';

export interface ChainWriterOptions {
  readClock?: ReadClock;
  /** The HMAC key (device secret, base64); default: from the secure store. */
  readSecret?: () => Promise<string | null>;
  /** The photos the entries cite: their media rows are written in the same transaction (every one must be cited). */
  photos?: readonly PhotoFile[];
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
 * The errors of an entry, in every build (its schema, then a photo cited twice): the server refuses a push whose entry is not valid (422), and an
 * entry once written is never changed, so an invalid one would stop the upload of the chain behind it for good
 * (audit WP-APP-002). Refused here, only the action that would have written it fails. If the validator itself cannot
 * be built, the entry is written: that is not the entry's fault, and stopping every write would be worse.
 */
function entryErrors(entry: ChainEntry): string[] {
  let errors: string[];
  try {
    errors = schemaErrors('chain/entry', entry);
  } catch (error) {
    console.error('Validating a chain entry against its schema failed', error);
    errors = [];
  }
  // After the schema, which makes payload.media a list; one photo twice is refused by the server too.
  return errors.length > 0 ? errors : repeatedPhotoErrors(entry);
}

/** Appends the drafts in one transaction; the caller holds the chain lock. */
async function writeDrafts(db: Database, drafts: readonly ChainEntryDraft[], options: ChainWriterOptions): Promise<ChainEntry[]> {
  if (drafts.length === 0 && (options.photos ?? []).length === 0) return [];
  const readClock = options.readClock ?? readDeviceClock;
  const secret = await (options.readSecret ?? readDeviceSecret)();
  if (secret === null) throw new ChainWriteError('No device secret: the phone is not enrolled');

  const written = db.transaction((tx) => {
    const deviceId = getKv(tx, 'device.id');
    if (deviceId === null) throw new ChainWriteError('No device ID: the phone is not enrolled');
    // In the transaction: once the flag is set, the last upload has seen the last entry.
    if (getKv(tx, 'device.revoked') !== null) throw new ChainWriteError('The phone is revoked: its chain is closed');
    const last = tx
      .select({ seq: chainEntries.seq, hash: chainEntries.hash })
      .from(chainEntries)
      .where(eq(chainEntries.device_id, deviceId))
      .orderBy(desc(chainEntries.seq))
      .limit(1)
      .get();
    const reference = chainTimeReference(getTimeReference(tx));
    let seq = last?.seq ?? 0;
    let prevHash = last?.hash ?? GENESIS_HASH;
    const photos = new Map((options.photos ?? []).map((photo) => [photo.id, photo]));
    const recorded = new Set<string>();

    const entries = drafts.map((draft) => {
      const clock = readClock();
      seq += 1;
      const entry = signChainEntry(
        {
          id: uuidv7(),
          device_id: deviceId,
          seq,
          type: draft.type,
          payload: draft.payload,
          ...clock,
          gnss_time: draft.gnss_time,
          ...reference,
          prev_hash: prevHash,
        } as Omit<ChainEntry, 'hash'>,
        secret,
      ) as ChainEntry;
      const errors = entryErrors(entry);
      if (errors.length > 0) throw new ChainWriteError(`Invalid ${entry.type} entry: ${errors.join('; ')}`);
      tx.insert(chainEntries).values(entry).run();
      applyProjection(tx, entry);
      recordPhotos(tx, entry, photos, recorded);
      prevHash = entry.hash;
      return entry;
    });
    const uncited = [...photos.keys()].filter((id) => !recorded.has(id));
    if (uncited.length > 0) throw new ChainWriteError(`Photos not cited by any entry: ${uncited.join(', ')}`);
    return entries;
  });

  emitChainEntries(written);
  return written;
}

/**
 * Appends the drafts to the chain in one transaction, applying each to the projections; returns the signed entries.
 * Throws (and writes nothing) if the phone is not enrolled, an entry is invalid, a projection does not fit, or a
 * photo given is not cited (or a cited one not given).
 */
export function appendChainEntries(
  db: Database,
  drafts: readonly ChainEntryDraft[],
  options: ChainWriterOptions = {},
): Promise<ChainEntry[]> {
  return withChainLock(() => writeDrafts(db, drafts, options));
}

/** What a rule decided: the entries to write, and whatever else its caller needs (e.g. what the screen shows). */
export interface ChainDecision {
  drafts: readonly ChainEntryDraft[];
}

/**
 * Runs decide under the chain lock, then appends its drafts as appendChainEntries does. No other entry is written
 * between reading the state in decide and writing what was decided from it, so two rules cannot act on the same
 * round at once (e.g. a scan completing it while the scheduler closes it). decide reads synchronously.
 */
export function appendDecidedEntries<D extends ChainDecision>(
  db: Database,
  decide: () => D,
  options: ChainWriterOptions = {},
): Promise<{ decision: D; entries: ChainEntry[] }> {
  return withChainLock(async () => {
    const decision = decide();
    return { decision, entries: await writeDrafts(db, decision.drafts, options) };
  });
}

/**
 * appendDecidedEntries, with the lock taken at once and decide run when awaiting has settled (a scan's location): the
 * entries others write meanwhile wait, so a decision for the moment of the call still sees the state of that moment.
 * awaiting must settle by itself, and soon (it holds every writer up); a rejection is thrown, and nothing is written.
 */
export function appendDecidedEntriesAfter<R, D extends ChainDecision>(
  db: Database,
  awaiting: Promise<R>,
  decide: (value: R) => D,
  options: ChainWriterOptions = {},
): Promise<{ decision: D; entries: ChainEntry[] }> {
  return withChainLock(async () => {
    const decision = decide(await awaiting);
    return { decision, entries: await writeDrafts(db, decision.drafts, options) };
  });
}

/** Appends one entry; see appendChainEntries. */
export async function appendChainEntry<T extends ChainEntryType>(
  db: Database,
  draft: ChainEntryDraft<T>,
  options?: ChainWriterOptions,
): Promise<ChainEntryOf<T>> {
  const [entry] = await appendChainEntries(db, [draft as ChainEntryDraft], options);
  return entry as ChainEntryOf<T>;
}
