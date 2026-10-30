// What the result of a scan (G7–G9) shows beyond its params: the point, the scan as it was written and its round.
import type { Timestamp } from '@waypost/schema';
import { eq } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { checkpoints, scans } from '@/db/schema';
import { isOpen } from '@/domain/state';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { trustedTime } from '@/time/trusted-time';

import { roundDetailsOf, type RoundPoint, type RoundScreenInfo } from './round';
import { loadGuardState } from './state';

export interface ScanResultInfo {
  timezone: string;
  point: { name: string; instruction: string | null } | null;
  scan: { scanned_at: Timestamp; method: 'nfc' | 'qr' | 'manual' } | null;
  round: RoundScreenInfo | null;
  /** The round still takes a manual entry. */
  round_open: boolean;
  /** The round's next point by position: after a wrong order, the one that should have been scanned. */
  next_point: RoundPoint | null;
}

/** Null while the site is not pulled. */
export function loadScanResultInfo(db: Database, ids: { round_id?: string; checkpoint_id?: string; scan_id?: string }, readClock: ReadClock = readDeviceClock): ScanResultInfo | null {
  const now = trustedTime(db, readClock()).time;
  const state = loadGuardState(db, now);
  if (state === null) return null;
  const { round_id, checkpoint_id, scan_id } = ids;
  const round = round_id === undefined ? null : roundDetailsOf(db, state, round_id);
  return {
    timezone: state.timezone,
    point: checkpoint_id === undefined ? null : (db.select({ name: checkpoints.name, instruction: checkpoints.instruction }).from(checkpoints).where(eq(checkpoints.id, checkpoint_id)).get() ?? null),
    scan: scan_id === undefined ? null : (db.select({ scanned_at: scans.scanned_at, method: scans.method }).from(scans).where(eq(scans.id, scan_id)).get() ?? null),
    round,
    round_open: state.rounds.some((r) => r.id === round_id && isOpen(r)),
    next_point: round?.points.find((point) => point.scan === null) ?? null,
  };
}
