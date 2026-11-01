import type { Database } from '@/db/database';

import { readClock as readDeviceClock, type ReadClock } from './clock';
import { parseTimestamp } from './timestamp';
import { trustedTime } from './trusted-time';

/** The trusted time now, in Unix milliseconds: what the countdowns count to. */
export function trustedNowMs(db: Database, readClock: ReadClock = readDeviceClock): number {
  return parseTimestamp(trustedTime(db, readClock()).time);
}
