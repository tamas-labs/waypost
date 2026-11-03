// Local cleanup (specification, Szinkron protokoll / Push és média; Adatmegőrzés): the acknowledged chain entries and the
// uploaded photos go after 7 days, what is not acknowledged or uploaded stays. The last entry of a chain always stays:
// the next one links to it. Photo files without a media row (the app stopped during a manual entry that was never
// saved) go after a day, so a form still open keeps its photos; those of a training draft stay as long as the draft.
import { and, inArray, lt, sql } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { chainEntries, media } from '@/db/schema';
import { draftPhotos } from '@/domain/training';
import { listPhotoFiles, photoFile } from '@/photo/files';
import { readClock as readDeviceClock, type ClockReading, type ReadClock } from '@/time/clock';
import { parseTimestamp, toTimestamp } from '@/time/timestamp';
import { trustedTime } from '@/time/trusted-time';

const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_MS = 7 * DAY_MS;
export const ORPHAN_PHOTO_AGE_MS = DAY_MS;
/** A site phone may run for weeks without a restart, and the sync comes every few minutes. */
export const CLEANUP_INTERVAL_MS = DAY_MS;

function deleteOldEntries(db: Database, before: string): void {
  db.delete(chainEntries)
    .where(
      and(
        lt(chainEntries.synced_at, before),
        sql`seq < (SELECT MAX(last.seq) FROM chain_entries AS last WHERE last.device_id = chain_entries.device_id)`,
      ),
    )
    .run();
}

function deleteOldPhotos(db: Database, before: string): void {
  const old = db.select({ id: media.id }).from(media).where(lt(media.uploaded_at, before)).all();
  for (const { id } of old) {
    try {
      const file = photoFile(id);
      if (file.exists) file.delete();
      db.delete(media)
        .where(inArray(media.id, [id]))
        .run();
    } catch (error) {
      // The row stays, so the next cleanup tries again.
      if (__DEV__) console.warn(`Deleting photo ${id} failed`, error);
    }
  }
}

function deleteOrphanPhotoFiles(db: Database, nowMs: number): void {
  const draft = getKv(db, 'training.draft');
  const known = new Set([
    ...db
      .select({ id: media.id })
      .from(media)
      .all()
      .map((row) => row.id),
    ...(draft === null ? [] : draftPhotos(draft).map((photo) => photo.id)),
  ]);
  for (const { id, modifiedAtMs } of listPhotoFiles()) {
    if (known.has(id) || modifiedAtMs === null || nowMs - modifiedAtMs < ORPHAN_PHOTO_AGE_MS) continue;
    try {
      photoFile(id).delete();
    } catch (error) {
      if (__DEV__) console.warn(`Deleting the photo file ${id} failed`, error);
    }
  }
}

/** One cleanup. now is the trusted time; the file times are by the device clock, like deviceNowMs. */
export function cleanUpLocalData(db: Database, now: string, deviceNowMs: number): void {
  const before = toTimestamp(parseTimestamp(now) - RETENTION_MS);
  deleteOldEntries(db, before);
  deleteOldPhotos(db, before);
  deleteOrphanPhotoFiles(db, deviceNowMs);
}

/** A cleanup if the last one was at least a day ago. */
export function cleanUpIfDue(db: Database, readClock: ReadClock = readDeviceClock): void {
  const clock: ClockReading = readClock();
  const now = trustedTime(db, clock).time;
  const last = getKv(db, 'sync.last_cleanup_at');
  if (last !== null && parseTimestamp(now) - parseTimestamp(last) < CLEANUP_INTERVAL_MS) return;
  cleanUpLocalData(db, now, parseTimestamp(clock.device_time));
  setKv(db, 'sync.last_cleanup_at', now);
}
