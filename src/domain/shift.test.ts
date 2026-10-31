import { closeShiftByGuard, guardLogin, nextRound, shiftDay, shiftHome, shiftSummary } from './shift';
import { DomainError } from './state';
import { C1, C2, C3, C4, GUARD, guardState, idSequence, local, OPEN_SHIFT, OTHER_GUARD, round, ROUTE_A, ROUTE_B, SCHEDULES, SCHEDULE_A, SHIFT, SITE } from './testing';

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
    expect(login.closed_shift).toEqual(OPEN_SHIFT);
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

describe('the shift day', () => {
  const tonight = {
    start_day: '2026-11-03',
    first_at: local('20:00'),
    last_at: local('23:00'),
    routes: [
      { route_id: ROUTE_A, checkpoints: 3, rounds: 4, schedules: [SCHEDULES[0]] },
      { route_id: ROUTE_B, checkpoints: 2, rounds: 2, schedules: [SCHEDULES[1]] },
    ],
  };

  it('is the night ahead before its first round, and the running one until its last', () => {
    expect(shiftDay(guardState(), local('19:40'))).toEqual(tonight);
    expect(shiftDay(guardState(), local('21:15'))).toEqual(tonight);
    expect(shiftDay(guardState(), local('23:00'))).toEqual(tonight);
  });

  it('is the next night after the last round', () => {
    expect(shiftDay(guardState(), local('23:10'))).toMatchObject({ start_day: '2026-11-04', first_at: local('20:00', '2026-11-04') });
  });

  it('leaves out routes without rounds, and is null without any', () => {
    const routes = guardState().routes.map((route) => (route.id === ROUTE_B ? { ...route, current_version_id: null } : route));
    expect(shiftDay(guardState({ routes }), local('19:40'))?.routes.map((route) => route.route_id)).toEqual([ROUTE_A]);
    expect(shiftDay(guardState({ schedules: [] }), local('19:40'))).toBeNull();
  });
});

describe('the shift home', () => {
  const states = (home: ReturnType<typeof shiftHome>, route: string) => home!.rounds.filter((r) => r.route_id === route).map((r) => [r.scheduled_at, r.state]);
  const scan = (checkpoint_id: string, time: string) => ({ checkpoint_id, scanned_at: local(time) });

  it('is null without an open shift', () => {
    expect(shiftHome(guardState(), local('19:40'))).toBeNull();
  });

  it('has the rounds of the night ahead, the first of each route next, and when the shift closes', () => {
    const home = shiftHome(guardState({ shift: OPEN_SHIFT }), local('19:56'))!;
    expect(states(home, ROUTE_A)).toEqual([
      [local('20:00'), 'next'],
      [local('21:00'), 'future'],
      [local('22:00'), 'future'],
      [local('23:00'), 'future'],
    ]);
    expect(states(home, ROUTE_B)).toEqual([
      [local('20:30'), 'next'],
      [local('22:30'), 'future'],
    ]);
    expect(home.next_at).toBe(local('20:00'));
    expect(home.running).toBeNull();
    // The last deadline is B 22:30 + 60 minutes, A 23:00 + 20 minutes: 23:30, and an hour more.
    expect(home.auto_close_at).toBe(local('00:30', '2026-11-04'));
  });

  it('tells the closed rounds: scanned points, what was skipped, how long it took', () => {
    const completed = round('A', '20:00', { status: 'completed', scans: [scan(C1, '20:02'), scan(C2, '20:09'), scan(C3, '20:21')] });
    const incomplete = round('A', '21:00', { status: 'incomplete', scans: [scan(C1, '21:03'), scan(C3, '21:10')] });
    const missed = round('B', '20:30', { status: 'missed' });
    const home = shiftHome(guardState({ shift: OPEN_SHIFT, rounds: [completed, missed, incomplete] }), local('21:30'))!;
    expect(home.rounds.slice(0, 3)).toMatchObject([
      { scheduled_at: local('20:00'), state: 'completed', opened: true, scanned: 3, total: 3, missing_checkpoint_ids: [], duration_ms: 19 * 60_000 },
      { scheduled_at: local('20:30'), state: 'missed', opened: true, scanned: 0, total: 2, missing_checkpoint_ids: [C3, C4], duration_ms: null },
      { scheduled_at: local('21:00'), state: 'incomplete', opened: true, scanned: 2, total: 3, missing_checkpoint_ids: [C2], duration_ms: null },
    ]);
    expect(home.next_at).toBe(local('22:00'));
  });

  it('counts the scans of the round version, not those of the current one', () => {
    const old = round('A', '20:00', { status: 'completed', route_version_id: '019a2b3c-4d5e-7f00-8a00-000000000072', scans: [scan(C2, '20:02'), scan(C4, '20:05')] });
    expect(shiftHome(guardState({ shift: OPEN_SHIFT, rounds: [old] }), local('20:10'))!.rounds[0]).toMatchObject({ scanned: 2, total: 2, duration_ms: 3 * 60_000 });
  });

  it('shows a running round with its deadline', () => {
    const running = round('A', '21:00', { status: 'in_progress', scans: [scan(C1, '21:03')] });
    const home = shiftHome(guardState({ shift: OPEN_SHIFT, rounds: [round('A', '20:00', { status: 'missed' }), round('B', '20:30', { status: 'missed' }), running] }), local('21:05'))!;
    expect(home.running).toEqual({ round_id: running.id, scheduled_at: local('21:00'), deadline: local('21:20') });
    expect(home.rounds.find((r) => r.scheduled_at === local('21:00'))).toMatchObject({ state: 'running', scanned: 1, total: 3 });
  });

  it('marks the rounds over before the shift started as never opened, and keeps those of an earlier shift', () => {
    const shift = { ...OPEN_SHIFT, started_at: local('21:30') };
    const home = shiftHome(guardState({ shift, rounds: [round('A', '21:00', { status: 'incomplete', shift_id: 'earlier', scans: [scan(C1, '21:02')] })] }), local('21:31'))!;
    expect(states(home, ROUTE_A)).toEqual([
      [local('20:00'), 'missed'],
      [local('21:00'), 'incomplete'],
      [local('22:00'), 'next'],
      [local('23:00'), 'future'],
    ]);
    expect(home.rounds[0]).toMatchObject({ opened: false, scanned: 0, total: 3, missing_checkpoint_ids: [C1, C2, C3] });
    // B 20:30 has no time limit: its deadline, 22:30, is still ahead, so the scheduler opens it.
    expect(states(home, ROUTE_B)).toEqual([
      [local('20:30'), 'next'],
      [local('22:30'), 'future'],
    ]);
    expect(home.next_at).toBe(local('20:30'));
  });

  it('stays on the day of the shift after its last round', () => {
    const closed = SCHEDULES.flatMap((schedule) => (schedule.id === SCHEDULE_A ? ['20:00', '21:00', '22:00', '23:00'].map((time) => round('A', time, { status: 'missed' })) : ['20:30', '22:30'].map((time) => round('B', time, { status: 'missed' }))));
    const home = shiftHome(guardState({ shift: OPEN_SHIFT, rounds: closed }), local('23:40'))!;
    expect(home.rounds).toHaveLength(6);
    expect(home.next_at).toBeNull();
    expect(home.running).toBeNull();
  });

  it('includes what another day of a schedule opens before the automatic close', () => {
    // Route B's morning round: yesterday morning's is not the shift's, tomorrow morning's opens before route A's night closes.
    const schedules = [
      { ...SCHEDULES[0]!, interval_from: '20:00', interval_to: '08:00' },
      { ...SCHEDULES[1]!, start_times: ['06:30'] },
    ];
    const home = shiftHome(guardState({ shift: OPEN_SHIFT, schedules }), local('19:56'))!;
    expect(states(home, ROUTE_B)).toEqual([[local('06:30', '2026-11-04'), 'next']]);
  });

  it('keeps a round of the shift whose schedule has changed since', () => {
    const moved = round('A', '20:15', { status: 'completed', scans: [scan(C1, '20:16')] });
    expect(shiftHome(guardState({ shift: OPEN_SHIFT, rounds: [moved] }), local('20:30'))!.rounds[1]).toMatchObject({ scheduled_at: local('20:15'), state: 'completed' });
  });

  it('has no rounds without a schedule', () => {
    expect(shiftHome(guardState({ shift: OPEN_SHIFT, schedules: [] }), local('19:56'))).toEqual({ rounds: [], next_at: null, running: null, auto_close_at: null });
  });
});

describe('the summary of closing the shift', () => {
  const scanned = (checkpoint_id: string) => ({ checkpoint_id, scanned_at: local('20:05') });

  it('has nothing without an open shift', () => {
    expect(shiftSummary(guardState(), local('20:10'))).toBeNull();
  });

  it('counts the closed rounds, and tells how each open one would close', () => {
    const rounds = [
      round('A', '20:00', { status: 'completed', scans: [scanned(C1), scanned(C2), scanned(C3)] }),
      round('B', '20:30', { status: 'incomplete', scans: [scanned(C3)] }),
      round('A', '21:00', { status: 'missed' }),
      round('B', '22:30', { status: 'in_progress', scans: [scanned(C4)] }),
      round('A', '22:00'),
    ];
    const summary = shiftSummary(guardState({ shift: OPEN_SHIFT, rounds }), local('22:35'))!;
    expect(summary.counts).toEqual({ completed: 1, incomplete: 1, missed: 1 });
    expect(summary.open_rounds.map((r) => [r.scheduled_at, r.scanned, r.total, r.closes_as])).toEqual([
      [local('22:30'), 1, 2, 'incomplete'],
      [local('22:00'), 0, 3, 'missed'],
    ]);
    expect(summary.rounds).toEqual(shiftHome(guardState({ shift: OPEN_SHIFT, rounds }), local('22:35'))!.rounds);
  });

  it('counts a round over before the shift started as missed, as the shift home does', () => {
    const summary = shiftSummary(guardState({ shift: { ...OPEN_SHIFT, started_at: local('21:30') } }), local('21:40'))!;
    expect(summary.counts.missed).toBeGreaterThan(0);
    expect(summary.open_rounds).toEqual([]);
  });
});
