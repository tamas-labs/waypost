import { closeShiftByGuard, guardLogin, nextRound } from './shift';
import { DomainError } from './state';
import { C1, GUARD, guardState, idSequence, local, OPEN_SHIFT, OTHER_GUARD, round, ROUTE_A, SHIFT, SITE } from './testing';

describe('shift state machine', () => {
  it('starts a shift when a guard logs in without an open shift', () => {
    expect(guardLogin(guardState(), GUARD, local('19:55'), idSequence())).toEqual({
      outcome: 'started',
      shift_id: '019a2b3c-4d5e-7f00-8a00-000000001000',
      drafts: [{ type: 'shift_started', payload: { shift_id: '019a2b3c-4d5e-7f00-8a00-000000001000', guard_id: GUARD, site_id: SITE }, gnss_time: null }],
    });
  });

  it('continues the open shift when the same guard logs in again', () => {
    expect(guardLogin(guardState({ shift: OPEN_SHIFT, rounds: [round('A', '20:00')] }), GUARD, local('20:10'), idSequence())).toEqual({ outcome: 'continued', shift_id: SHIFT, drafts: [] });
  });

  it('hands over to another guard: open rounds close, then the shift, then the new one starts', () => {
    const scanned = round('A', '20:00', { status: 'in_progress', scans: [{ checkpoint_id: C1, scanned_at: local('20:02') }] });
    const unscanned = round('B', '20:30');
    const closed = round('A', '19:00', { status: 'missed' });
    const login = guardLogin(guardState({ shift: OPEN_SHIFT, rounds: [closed, scanned, unscanned] }), OTHER_GUARD, local('20:40'), idSequence());
    expect(login.outcome).toBe('handover');
    expect(login.drafts).toEqual([
      { type: 'round_closed', payload: { round_id: scanned.id, status: 'incomplete', finished_at: local('20:40') }, gnss_time: null },
      { type: 'round_closed', payload: { round_id: unscanned.id, status: 'missed', finished_at: local('20:40') }, gnss_time: null },
      { type: 'shift_closed', payload: { shift_id: SHIFT, closed_by: 'handover' }, gnss_time: null },
      { type: 'shift_started', payload: { shift_id: login.shift_id, guard_id: OTHER_GUARD, site_id: SITE }, gnss_time: null },
    ]);
  });

  it('closes the shift by the guard’s decision, with its open round', () => {
    const open = round('A', '20:00');
    expect(closeShiftByGuard(guardState({ shift: OPEN_SHIFT, rounds: [open] }), local('20:10'))).toEqual([
      { type: 'round_closed', payload: { round_id: open.id, status: 'missed', finished_at: local('20:10') }, gnss_time: null },
      { type: 'shift_closed', payload: { shift_id: SHIFT, closed_by: 'guard' }, gnss_time: null },
    ]);
    expect(closeShiftByGuard(guardState({ shift: OPEN_SHIFT }), local('20:10'))).toEqual([{ type: 'shift_closed', payload: { shift_id: SHIFT, closed_by: 'guard' }, gnss_time: null }]);
    expect(() => closeShiftByGuard(guardState(), local('20:10'))).toThrow(new DomainError('no_shift', 'There is no open shift'));
  });
});

describe('the next round', () => {
  it('starts the shift with the first round of the day, later ones are just the next round', () => {
    expect(nextRound(guardState(), local('19:40'))).toEqual({ scheduled_at: local('20:00'), starts_shift: true });
    expect(nextRound(guardState(), local('20:00'))).toEqual({ scheduled_at: local('20:30'), starts_shift: false });
    // After the last round of the night (B 22:30, A 23:00): the next day's first.
    expect(nextRound(guardState(), local('23:10'))).toEqual({ scheduled_at: local('20:00', '2026-11-04'), starts_shift: true });
  });

  it('skips routes without rounds, and is null without any', () => {
    const routes = guardState().routes.map((route) => (route.id === ROUTE_A ? { ...route, active: false } : route));
    expect(nextRound(guardState({ routes }), local('19:40'))).toEqual({ scheduled_at: local('20:30'), starts_shift: true });
    expect(nextRound(guardState({ schedules: [] }), local('19:40'))).toBeNull();
  });
});
