// What the round's screen (G5) shows: the domain's state of the round with the names and the details of its scans from
// the database.
import type { Timestamp } from '@waypost/schema';
import { and, eq, isNotNull } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { checkpoints, scans } from '@/db/schema';
import { deadlineOfRound } from '@/domain/rounds';
import { isOpen, versionOf } from '@/domain/state';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { trustedTime } from '@/time/trusted-time';

import { routeNameAmongSeveral } from './alarm';
import { loadGuardState } from './state';

export interface RoundPoint {
  checkpoint_id: string;
  name: string;
  /** Its place in the route version, from 1. */
  position: number;
  scan: { scanned_at: Timestamp; method: 'nfc' | 'qr' | 'manual'; manual: boolean; out_of_order: boolean } | null;
}

export interface RoundScreenInfo {
  timezone: string;
  scheduled_at: Timestamp;
  deadline: Timestamp;
  /** Null with one route on the site. */
  route_name: string | null;
  fixed_order: boolean;
  /** Scanned ones in time order, then the ones left in position order. */
  points: RoundPoint[];
  scanned: number;
}

/** Null: the round is not open (any more), or it is not known. */
export function loadRoundScreenInfo(db: Database, roundId: string, readClock: ReadClock = readDeviceClock): RoundScreenInfo | null {
  const now = trustedTime(db, readClock()).time;
  const state = loadGuardState(db, now);
  const round = state?.rounds.find((r) => r.id === roundId);
  if (state === null || round === undefined || !isOpen(round)) return null;

  const names = new Map(db.select({ id: checkpoints.id, name: checkpoints.name }).from(checkpoints).where(eq(checkpoints.site_id, state.site_id)).all().map((point) => [point.id, point.name]));
  const scanRows = db
    .select({ checkpoint_id: scans.checkpoint_id, scanned_at: scans.scanned_at, method: scans.method, flags: scans.flags })
    .from(scans)
    .where(and(eq(scans.round_id, roundId), isNotNull(scans.checkpoint_id)))
    .all();
  const scanOf = new Map(scanRows.map((row) => [row.checkpoint_id, row]));

  const points = versionOf(state, round.route_version_id).checkpoint_ids.map((id, index): RoundPoint => {
    const row = scanOf.get(id);
    return {
      checkpoint_id: id,
      name: names.get(id) ?? '',
      position: index + 1,
      scan: row === undefined ? null : { scanned_at: row.scanned_at, method: row.method, manual: row.flags.includes('manual'), out_of_order: row.flags.includes('out_of_order') },
    };
  });
  const done = points.filter((point) => point.scan !== null).sort((a, b) => a.scan!.scanned_at.localeCompare(b.scan!.scanned_at));
  return {
    timezone: state.timezone,
    scheduled_at: round.scheduled_at,
    deadline: deadlineOfRound(state, round),
    route_name: routeNameAmongSeveral(db, state, round.route_id),
    fixed_order: state.routes.find((route) => route.id === round.route_id)?.order_mode === 'fixed',
    points: [...done, ...points.filter((point) => point.scan === null)],
    scanned: done.length,
  };
}

// The rounds whose screen the guard has seen in this login: the shift home goes on to a round's screen only the first
// time, so "back" can stay on the shift home.
const shownRounds = new Set<string>();

export const wasRoundShown = (roundId: string) => shownRounds.has(roundId);

export function markRoundShown(roundId: string): void {
  shownRounds.add(roundId);
}

export function forgetShownRounds(): void {
  shownRounds.clear();
}
