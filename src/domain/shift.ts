// The shift state machine (specification: Állapotgépek / Műszak). The automatic close is part of the scheduler step
// (rounds.ts), because it depends on the schedules.
import type { Timestamp } from '@waypost/schema';

import { shiftClosed, shiftStarted } from '@/chain/payloads';
import type { ChainEntryDraft } from '@/chain/writer';

import { closeRound } from './rounds';
import { DomainError, isOpen, type GuardState, type NewId } from './state';

export interface GuardLogin {
  /** started: a new shift; continued: the same guard's open shift goes on; handover: another guard's shift closed first. */
  outcome: 'started' | 'continued' | 'handover';
  shift_id: string;
  drafts: ChainEntryDraft[];
}

/** The open rounds closed now by the usual rule (completed, incomplete or missed). */
function closeOpenRounds(state: GuardState, now: Timestamp): ChainEntryDraft[] {
  return state.rounds.filter(isOpen).map((round) => closeRound(state, round, now));
}

/**
 * A guard logged in with PIN: without an open shift a new one starts; the same guard continues the open shift;
 * another guard first closes it (its open rounds, then shift_closed handover) and starts a new one.
 */
export function guardLogin(state: GuardState, guardId: string, now: Timestamp, newId: NewId): GuardLogin {
  const open = state.shift;
  if (open !== null && open.guard_id === guardId) return { outcome: 'continued', shift_id: open.id, drafts: [] };
  const shiftId = newId();
  const start = shiftStarted({ shift_id: shiftId, guard_id: guardId, site_id: state.site_id });
  if (open === null) return { outcome: 'started', shift_id: shiftId, drafts: [start] };
  return { outcome: 'handover', shift_id: shiftId, drafts: [...closeOpenRounds(state, now), shiftClosed({ shift_id: open.id, closed_by: 'handover' }), start] };
}

/** The guard closes the shift (after the PIN and the summary); an open round closes with it. */
export function closeShiftByGuard(state: GuardState, now: Timestamp): ChainEntryDraft[] {
  if (state.shift === null) throw new DomainError('no_shift', 'There is no open shift');
  return [...closeOpenRounds(state, now), shiftClosed({ shift_id: state.shift.id, closed_by: 'guard' })];
}
