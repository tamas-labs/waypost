// A tag read recorded: the location, then the domain's decision and its entries under the chain lock. The scan does not
// wait for the GPS longer than currentLocation() allows (specification: Állapotgépek / Leolvasás 6).
import { appendDecidedEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { resolveScan, type ScanOutcome, type TagRead } from '@/domain/scan';
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

export async function recordTagRead(db: Database, read: TagRead, readClock: ReadClock = readDeviceClock): Promise<ScanOutcome> {
  const location = await currentLocation();
  const { decision } = await appendDecidedEntries(
    db,
    () => {
      const now = trustedTime(db, readClock()).time;
      const state = loadGuardState(db, now);
      if (state === null) throw new Error('The site is not pulled yet');
      return resolveScan({ state, now, location, newId: uuidv7 }, read);
    },
    { readClock },
  );
  return decision;
}

/** How a scan feels at once. A wrong order counts, so it only warns (Q13); a scan out of round is recorded, but counts for no round. */
export function scanFeedback(outcome: ScanOutcome): FeedbackKind {
  if (outcome.kind === 'unknown_tag') return 'error';
  if (outcome.kind === 'already_scanned' || outcome.out_of_order || outcome.round_id === null) return 'warning';
  return 'success';
}
