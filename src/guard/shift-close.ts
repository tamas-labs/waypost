// Closing the shift by the guard (specification: Állapotgépek / Műszak 3): the summary, then the guard's own PIN writes the
// open rounds' closing and shift_closed, and logs the guard out.
import type { Timestamp } from '@waypost/schema';
import { and, count, eq } from 'drizzle-orm';

import { pinConfirm, type PinLoginResult } from '@/auth/pin';
import { useSession } from '@/auth/session';
import { appendDecidedEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { incidents, rounds, routes, scans } from '@/db/schema';
import { closeShiftByGuard, shiftSummary, type ShiftRound, type ShiftSummary } from '@/domain/shift';
import { requestSync } from '@/sync/runtime';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { trustedTime } from '@/time/trusted-time';

import { userName } from './login';
import { loadGuardState } from './state';

type Named<R extends ShiftRound> = R & { route_name: string };

export interface ShiftCloseInfo {
  timezone: string;
  guard_name: string;
  started_at: Timestamp;
  /** Trusted time. */
  now: Timestamp;
  rounds: Named<ShiftRound>[];
  counts: ShiftSummary['counts'];
  open_rounds: Named<ShiftSummary['open_rounds'][number]>[];
  /** All the incidents of the shift, the damaged-tag ones of manual entries too. */
  incidents: number;
  /** Manual entries in the rounds of the shift. */
  manual_points: number;
}

/** Null without an open shift (it may have closed automatically), or while the site is not pulled yet. */
export function loadShiftCloseInfo(db: Database, readClock: ReadClock = readDeviceClock): ShiftCloseInfo | null {
  const now = trustedTime(db, readClock()).time;
  const state = loadGuardState(db, now);
  const shift = state?.shift ?? null;
  const summary = state === null ? null : shiftSummary(state, now);
  if (state === null || shift === null || summary === null) return null;

  const routeNames = new Map(db.select({ id: routes.id, name: routes.name }).from(routes).where(eq(routes.site_id, state.site_id)).all().map((route) => [route.id, route.name]));
  const named = <R extends ShiftRound>(round: R): Named<R> => ({ ...round, route_name: routeNames.get(round.route_id) ?? '' });
  return {
    timezone: state.timezone,
    guard_name: userName(db, shift.guard_id) ?? '',
    started_at: shift.started_at,
    now,
    rounds: summary.rounds.map(named),
    counts: summary.counts,
    open_rounds: summary.open_rounds.map(named),
    incidents: db.select({ n: count() }).from(incidents).where(eq(incidents.shift_id, shift.id)).get()?.n ?? 0,
    manual_points:
      db
        .select({ n: count() })
        .from(scans)
        .innerJoin(rounds, eq(scans.round_id, rounds.id))
        .where(and(eq(rounds.shift_id, shift.id), eq(scans.method, 'manual')))
        .get()?.n ?? 0,
  };
}

/**
 * Checks that the PIN is the guard's; if it is, closes the shift and logs the guard out (the navigation follows the session
 * to the PIN screen). Throws if the entries cannot be written, and the guard stays logged in then.
 */
export async function closeShiftWithPin(db: Database, guardId: string, pin: string, readClock: ReadClock = readDeviceClock): Promise<PinLoginResult> {
  const result = await pinConfirm(db, guardId, pin, readClock);
  if (result.status !== 'ok') return result;
  await appendDecidedEntries(
    db,
    () => {
      const now = trustedTime(db, readClock()).time;
      const state = loadGuardState(db, now);
      if (state === null) throw new Error('The site of the phone is not pulled yet');
      return { drafts: closeShiftByGuard(state, now) };
    },
    { readClock },
  );
  useSession.setState({ activeUser: null, shiftStart: null });
  void requestSync('shift_closed');
  return result;
}
