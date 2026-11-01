// The PIN login of the site phone (specification: Azonosítás / PIN-kód, Állapotgépek / Műszak): the PIN identifies the
// user; a guard's login runs the shift state machine (a new shift, the same guard's goes on, or a handover) and writes
// its entries before the session opens the guard mode; a supervisor's opens the supervisor mode.
import { pinLogin, type PinLoginResult } from '@/auth/pin';
import { useSession } from '@/auth/session';
import { appendDecidedEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { guardLogin, type GuardLogin } from '@/domain/shift';
import { uuidv7 } from '@/id/uuidv7';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';

import { userName } from './names';
import { requestSchedulerStep } from './scheduler';
import { loadGuardStateNow } from './state';

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
      const { now, state } = loadGuardStateNow(db, readClock);
      if (state === null) throw new Error('The site of the phone is not pulled yet');
      return { ...guardLogin(state, id, now, uuidv7), now };
    },
    { readClock },
  );
  const closed = decision.closed_shift;
  const handover = closed === undefined ? null : { guard_name: userName(db, closed.guard_id) ?? '', at: decision.now };
  // A new shift goes through the shift start screen (G2); the same guard's shift goes on at the shift home.
  useSession.setState({ activeUser: { id, role }, shiftStart: decision.outcome === 'continued' ? null : { handover } });
  // A new shift may have rounds due right away.
  if (decision.outcome !== 'continued') requestSchedulerStep('shift_started');
  const { now: _now, ...login } = decision;
  return { status: 'ok', role, user: { id, name }, login };
}
