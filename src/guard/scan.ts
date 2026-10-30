// A tag read recorded: the location, then the domain's decision and its entries under the chain lock. The scan does not
// wait for the GPS longer than currentLocation() allows (specification: Állapotgépek / Leolvasás 6).
import type { LocationFix, PhotoFile } from '@/chain/payloads';
import { appendDecidedEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { manualScan, nearestCheckpoint, resolveScan, type ManualEntry, type PointOutcome, type ScanContext, type ScanOutcome, type TagRead } from '@/domain/scan';
import type { FeedbackKind } from '@/feedback/feedback';
import { uuidv7 } from '@/id/uuidv7';
import { currentLocation } from '@/location/location';
import type { TagReading } from '@/nfc/tag';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { trustedTime } from '@/time/trusted-time';

import { loadGuardState } from './state';

/** Null: the tag gave no valid UID, so there is nothing to look up or to record. */
export function tagReadOf(tag: TagReading): TagRead | null {
  return tag.uid === null ? null : { method: 'nfc', tag_uid: tag.uid, ndef_raw: tag.ndefRaw };
}

/** The context of a domain rule, read under the chain lock. */
function scanContext(db: Database, location: LocationFix | null, readClock: ReadClock): ScanContext {
  const now = trustedTime(db, readClock()).time;
  const state = loadGuardState(db, now);
  if (state === null) throw new Error('The site is not pulled yet');
  return { state, now, location, newId: uuidv7 };
}

export async function recordTagRead(db: Database, read: TagRead, readClock: ReadClock = readDeviceClock): Promise<ScanOutcome> {
  const location = await currentLocation();
  const { decision } = await appendDecidedEntries(db, () => resolveScan(scanContext(db, location, readClock), read), { readClock });
  return decision;
}

/**
 * A manual entry recorded with its photos. The location is the one at the saving, or else the one the form has shown
 * (shownLocation), which is still from the guard's visit to the point. Throws a DomainError if the round has closed.
 */
export async function recordManualEntry(db: Database, entry: Omit<ManualEntry, 'media'>, photos: readonly PhotoFile[], shownLocation: LocationFix | null, readClock: ReadClock = readDeviceClock): Promise<PointOutcome> {
  const location = (await currentLocation()) ?? shownLocation;
  const { decision } = await appendDecidedEntries(db, () => manualScan(scanContext(db, location, readClock), { ...entry, media: photos }), { readClock, photos });
  return decision;
}

/** Which of the checkpoints is nearest to the location; null without a location or a trained one among them. */
export function nearestOf(db: Database, checkpointIds: readonly string[], location: LocationFix | null, readClock: ReadClock = readDeviceClock): string | null {
  const state = loadGuardState(db, trustedTime(db, readClock()).time);
  return nearestCheckpoint(state?.checkpoints.filter((checkpoint) => checkpointIds.includes(checkpoint.id)) ?? [], location);
}

/** How a scan feels at once. A wrong order counts, so it only warns (Q13); a scan out of round is recorded, but counts for no round. */
export function scanFeedback(outcome: ScanOutcome): FeedbackKind {
  if (outcome.kind === 'unknown_tag') return 'error';
  if (outcome.kind === 'already_scanned' || outcome.out_of_order || outcome.round_id === null) return 'warning';
  return 'success';
}
