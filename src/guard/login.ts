// The PIN login of the site phone (specification: Azonosítás / PIN-kód, Állapotgépek / Műszak): the PIN identifies the
// user; a guard's login runs the shift state machine (a new shift, the same guard's goes on, or a handover) and writes
// its entries before the session opens the guard mode; a supervisor's opens the supervisor mode.
import type { Timestamp } from '@waypost/schema';
import { eq } from 'drizzle-orm';

import { pinLogin, type PinLoginResult } from '@/auth/pin';
import { useSession } from '@/auth/session';
import { appendDecidedEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { sites, users } from '@/db/schema';
import { guardLogin, nextRound, type GuardLogin, type NextRound } from '@/domain/shift';
import { uuidv7 } from '@/id/uuidv7';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';
import { trustedTime } from '@/time/trusted-time';

import { requestSchedulerStep } from './scheduler';
import { loadGuardState } from './state';

/** What the PIN screen shows above the keypad. */
export interface PinScreenInfo {
  site_name: string;
  timezone: string;
  /** Trusted time. */
  now: Timestamp;
  /** The name of the guard whose shift is open. */
  on_shift: string | null;
  next_round: NextRound | null;
}

/** The site of the phone and its shift at the trusted time; null while the site is not pulled yet (nobody can log in). */
export function loadPinScreenInfo(db: Database, readClock: ReadClock = readDeviceClock): PinScreenInfo | null {
  const now = trustedTime(db, readClock()).time;
  const state = loadGuardState(db, now);
  if (state === null) return null;
  const site = db.select({ name: sites.name }).from(sites).where(eq(sites.id, state.site_id)).get();
  const guard = state.shift === null ? undefined : db.select({ name: users.name }).from(users).where(eq(users.id, state.shift.guard_id)).get();
  return { site_name: site?.name ?? '', timezone: state.timezone, now, on_shift: guard?.name ?? null, next_round: nextRound(state, now) };
}

export type PinSignInResult =
  | Exclude<PinLoginResult, { status: 'ok' }>
  | { status: 'ok'; role: 'supervisor'; user: { id: string; name: string } }
  /** login: what happened to the shift (the next screen tells a handover). */
  | { status: 'ok'; role: 'guard'; user: { id: string; name: string }; login: GuardLogin };

/**
 * Checks the PIN; if it is a user's, writes what the login means for the shift (guards only), then logs the user in.
 * Throws if the entries cannot be written (nobody is logged in then).
 */
export async function signInWithPin(db: Database, pin: string, readClock: ReadClock = readDeviceClock): Promise<PinSignInResult> {
  const result = await pinLogin(db, pin, readClock);
  if (result.status !== 'ok') return result;
  const { id, name, role } = result.user;
  if (role === 'supervisor') {
    useSession.setState({ activeUser: { id, role } });
    return { status: 'ok', role, user: { id, name } };
  }

  const { decision } = await appendDecidedEntries(
    db,
    () => {
      const now = trustedTime(db, readClock()).time;
      const state = loadGuardState(db, now);
      if (state === null) throw new Error('The site of the phone is not pulled yet');
      return guardLogin(state, id, now, uuidv7);
    },
    { readClock },
  );
  useSession.setState({ activeUser: { id, role } });
  // A new shift may have rounds due right away.
  if (decision.outcome !== 'continued') requestSchedulerStep('shift_started');
  return { status: 'ok', role, user: { id, name }, login: decision };
}
