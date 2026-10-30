// What the round's screen (G5) shows: the domain's state of the round with the names and the details of its scans from
// the database.
import type { Timestamp } from '@waypost/schema';
import { and, eq, isNotNull } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { checkpoints, scans } from '@/db/schema';
import { deadlineOfRound } from '@/domain/rounds';
import { isOpen, versionOf } from '@/domain/state';
import { coordinateOfE7, type Coordinate } from '@/location/coordinate';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { trustedTime } from '@/time/trusted-time';

import { routeNameAmongSeveral } from './alarm';
import { loadGuardState } from './state';

export interface RoundPoint {
  checkpoint_id: string;
  name: string;
  /** Its place in the route version, from 1. */
  position: number;
  /** Where the point was trained; null if it was not. */
  location: Coordinate | null;
  scan: { scanned_at: Timestamp; method: 'nfc' | 'qr' | 'manual'; manual: boolean; out_of_order: boolean; location: Coordinate | null; accuracy_m: number | null } | null;
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

  const details = new Map(db.select({ id: checkpoints.id, name: checkpoints.name, lat_e7: checkpoints.lat_e7, lng_e7: checkpoints.lng_e7 }).from(checkpoints).where(eq(checkpoints.site_id, state.site_id)).all().map((point) => [point.id, point]));
  const scanRows = db
    .select({ checkpoint_id: scans.checkpoint_id, scanned_at: scans.scanned_at, method: scans.method, flags: scans.flags, lat_e7: scans.lat_e7, lng_e7: scans.lng_e7, accuracy_dm: scans.accuracy_dm })
    .from(scans)
    .where(and(eq(scans.round_id, roundId), isNotNull(scans.checkpoint_id)))
    .all();
  const scanOf = new Map(scanRows.map((row) => [row.checkpoint_id, row]));

  const points = versionOf(state, round.route_version_id).checkpoint_ids.map((id, index): RoundPoint => {
    const row = scanOf.get(id);
    const checkpoint = details.get(id);
    return {
      checkpoint_id: id,
      name: checkpoint?.name ?? '',
      position: index + 1,
      location: coordinateOfE7(checkpoint?.lat_e7 ?? null, checkpoint?.lng_e7 ?? null),
      scan:
        row === undefined
          ? null
          : {
              scanned_at: row.scanned_at,
              method: row.method,
              manual: row.flags.includes('manual'),
              out_of_order: row.flags.includes('out_of_order'),
              location: coordinateOfE7(row.lat_e7, row.lng_e7),
              accuracy_m: row.accuracy_dm === null ? null : row.accuracy_dm / 10,
            },
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

export interface RoundMapPoint {
  checkpoint_id: string;
  name: string;
  /** Its place in the route version, so its number does not change during the round. */
  position: number;
  state: 'scanned' | 'manual' | 'pending';
  coordinate: Coordinate;
  /** A manual point's GPS accuracy radius in metres. */
  accuracy_m: number | null;
}

export interface RoundMap {
  /** A scanned point is where it was scanned, or else where it was trained, as a point left is. A point with neither is not on the map. */
  points: RoundMapPoint[];
  /** The positions of the scans in time order (DESIGN_HANDOFF 10: no continuous track in the first stage). */
  walked: Coordinate[];
  /** The time of the first and the last scan in `walked`; null without one. */
  walked_between: { from: Timestamp; to: Timestamp } | null;
}

/** The round's map (G6), from the points of `loadRoundScreenInfo`. */
export function roundMapOf(points: readonly RoundPoint[]): RoundMap {
  const mapPoints = points.flatMap((point): RoundMapPoint[] => {
    const coordinate = point.scan?.location ?? point.location;
    if (coordinate === null) return [];
    const state = point.scan === null ? 'pending' : point.scan.manual ? 'manual' : 'scanned';
    const accuracy_m = state === 'manual' ? (point.scan?.accuracy_m ?? null) : null;
    return [{ checkpoint_id: point.checkpoint_id, name: point.name, position: point.position, state, coordinate, accuracy_m }];
  });
  const located = points.flatMap((point) => (point.scan?.location == null ? [] : [{ at: point.scan.scanned_at, location: point.scan.location }]));
  const [first] = located;
  const last = located.at(-1);
  return {
    points: mapPoints,
    walked: located.map((scan) => scan.location),
    walked_between: first === undefined || last === undefined ? null : { from: first.at, to: last.at },
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
