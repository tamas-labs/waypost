// A tag read or an incident recorded: the location, then the domain's decision and its entries under the chain lock. The
// scan does not wait for the GPS longer than currentLocation() allows (specification: Állapotgépek / Leolvasás 6), and a
// tag read is decided for the moment of the touch.
import { desc, eq } from 'drizzle-orm';

import type { LocationFix, PhotoFile } from '@/chain/payloads';
import { appendDecidedEntries, appendDecidedEntriesAfter } from '@/chain/writer';
import type { Database } from '@/db/database';
import { getKv } from '@/db/kv';
import { chainEntries, checkpoints } from '@/db/schema';
import {
  manualScan,
  nearestCheckpoint,
  reportIncident,
  resolveScan,
  type IncidentReport,
  type ManualEntry,
  type PointOutcome,
  type ScanContext,
  type ScanOutcome,
  type TagRead,
} from '@/domain/scan';
import type { FeedbackKind } from '@/feedback/feedback';
import { uuidv7 } from '@/id/uuidv7';
import { currentLocation } from '@/location/location';
import type { TagReading } from '@/nfc/tag';
import { readClock as readDeviceClock, type ClockReading, type ReadClock } from '@/time/clock';
import { parseTimestamp } from '@/time/timestamp';

import { loadGuardStateNow } from './state';

/** Null: the tag gave no valid UID, so there is nothing to look up or to record. */
export function tagReadOf(tag: TagReading): TagRead | null {
  return tag.uid === null ? null : { method: 'nfc', tag_uid: tag.uid, ndef_raw: tag.ndefRaw };
}

/** The context of a domain rule, read under the chain lock. */
function scanContext(db: Database, location: LocationFix | null, readClock: ReadClock): ScanContext {
  const { now, state } = loadGuardStateNow(db, readClock);
  if (state === null) throw new Error('The site is not pulled yet');
  return { state, now, location, newId: uuidv7 };
}

/**
 * What a read comes to, without its location and without writing anything: the outcome does not depend on the location,
 * so the feedback does not have to wait for the GPS. The recording decides again, under the chain lock.
 */
export function previewTagRead(db: Database, read: TagRead, readClock: ReadClock = readDeviceClock): ScanOutcome {
  return resolveScan(scanContext(db, null, readClock), read);
}

/** Whether the chain has an entry with a later clock than the reading: one waiting for the chain lock before it. */
function writtenSince(db: Database, reading: ClockReading): boolean {
  const deviceId = getKv(db, 'device.id');
  if (deviceId === null) return false;
  const last = db
    .select({ uptime_ms: chainEntries.uptime_ms, boot_id: chainEntries.boot_id })
    .from(chainEntries)
    .where(eq(chainEntries.device_id, deviceId))
    .orderBy(desc(chainEntries.seq))
    .limit(1)
    .get();
  return last !== undefined && (last.boot_id !== reading.boot_id || last.uptime_ms > reading.uptime_ms);
}

/**
 * Records a read for the moment of the touch: the entry's clock (so its time) and its round are those of the touch,
 * though it is written once the location has come (at most 5 s). Meanwhile the chain takes no other entry, so a
 * deadline passing does not move the scan out of its round, and a read touched after it is recorded after it. Only an
 * entry that was already waiting for the chain when the tag was touched comes before it; then the scan is of the
 * moment it is written, as the chain's clock never goes back (audit WP-APP-011).
 */
export async function recordTagRead(db: Database, read: TagRead, readClock: ReadClock = readDeviceClock): Promise<ScanOutcome> {
  const touched = readClock();
  let at = touched;
  const { decision } = await appendDecidedEntriesAfter(
    db,
    currentLocation(),
    (location) => {
      if (writtenSince(db, touched)) at = readClock();
      return resolveScan(
        scanContext(db, location, () => at),
        read,
      );
    },
    { readClock: () => at },
  );
  return decision;
}

/**
 * A manual entry recorded with its photos. The location is the one at the saving, or else the one the form has shown
 * (shownLocation), which is still from the guard's visit to the point. Throws a DomainError if the round has closed.
 */
export async function recordManualEntry(
  db: Database,
  entry: Omit<ManualEntry, 'media'>,
  photos: readonly PhotoFile[],
  shownLocation: LocationFix | null,
  readClock: ReadClock = readDeviceClock,
): Promise<PointOutcome> {
  const location = (await currentLocation()) ?? shownLocation;
  const { decision } = await appendDecidedEntries(db, () => manualScan(scanContext(db, location, readClock), { ...entry, media: photos }), {
    readClock,
    photos,
  });
  return decision;
}

/**
 * An incident recorded with its photos, the location as at a manual entry. Throws a DomainError if the shift has closed.
 */
export async function recordIncident(
  db: Database,
  report: Omit<IncidentReport, 'media'>,
  photos: readonly PhotoFile[],
  shownLocation: LocationFix | null,
  readClock: ReadClock = readDeviceClock,
): Promise<void> {
  const location = (await currentLocation()) ?? shownLocation;
  await appendDecidedEntries(db, () => ({ drafts: [reportIncident(scanContext(db, location, readClock), { ...report, media: photos })] }), {
    readClock,
    photos,
  });
}

/** What the incident form tells of the place and the time; null while the site is not pulled yet. */
export interface IncidentPlace {
  timezone: string;
  /** Trusted time, in Unix milliseconds. */
  at_ms: number;
  /** The point given, or else the nearest to the location; null without either. */
  point_name: string | null;
}

export function incidentPlace(
  db: Database,
  checkpointId: string | null,
  location: LocationFix | null,
  readClock: ReadClock = readDeviceClock,
): IncidentPlace | null {
  const { now, state } = loadGuardStateNow(db, readClock);
  if (state === null) return null;
  const id = checkpointId ?? nearestCheckpoint(state.checkpoints, location);
  const point = id === null ? undefined : db.select({ name: checkpoints.name }).from(checkpoints).where(eq(checkpoints.id, id)).get();
  return { timezone: state.timezone, at_ms: parseTimestamp(now), point_name: point?.name ?? null };
}

/** Which of the checkpoints is nearest to the location; null without a location or a trained one among them. */
export function nearestOf(
  db: Database,
  checkpointIds: readonly string[],
  location: LocationFix | null,
  readClock: ReadClock = readDeviceClock,
): string | null {
  const { state } = loadGuardStateNow(db, readClock);
  return nearestCheckpoint(state?.checkpoints.filter((checkpoint) => checkpointIds.includes(checkpoint.id)) ?? [], location);
}

/** How a scan feels at once. A wrong order counts, so it only warns (Q13); a scan out of round is recorded, but counts for no round. */
export function scanFeedback(outcome: ScanOutcome): FeedbackKind {
  if (outcome.kind === 'unknown_tag') return 'error';
  if (outcome.kind === 'already_scanned' || outcome.out_of_order || outcome.round_id === null) return 'warning';
  return 'success';
}
