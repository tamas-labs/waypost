import type { ChainEntryDraft } from '@/chain/writer';

import { autoCloseTime, closingStatus, deadlineOfRound, schedulerStep, slotsAround } from './rounds';
import { C1, C2, C3, guardState, idSequence, local, OPEN_SHIFT, round, ROUTE_A, ROUTE_B, SCHEDULE_A, SCHEDULE_B, SCHEDULES, SHIFT, VERSION_A1, VERSION_A2, VERSION_B1 } from './testing';
import type { GuardState } from './state';

/** The drafts as short lines: "opened A 20:00", "closed <round> missed 20:20", "shift auto". */
function describeDrafts(drafts: ChainEntryDraft[]): string[] {
  const time = (ts: string) => new Date(Date.parse(ts) + 3600_000).toISOString().slice(11, 16);
  return drafts.map((draft) => {
    switch (draft.type) {
      case 'round_opened':
        return `opened ${draft.payload.schedule_id === SCHEDULE_A ? 'A' : 'B'} ${time(draft.payload.scheduled_at)}`;
      case 'round_closed':
        return `closed ${draft.payload.status} ${time(draft.payload.finished_at)}`;
      case 'shift_closed':
        return `shift ${draft.payload.closed_by}`;
      default:
        return draft.type;
    }
  });
}

const step = (state: GuardState, now: string) => schedulerStep(state, now, idSequence());
const withShift = (overrides: Partial<GuardState> = {}) => guardState({ shift: OPEN_SHIFT, ...overrides });

describe('round closing status', () => {
  it('is completed with every checkpoint scanned, incomplete with some, missed with none', () => {
    const scan = (checkpoint_id: string) => ({ checkpoint_id, scanned_at: local('20:05') });
    expect(closingStatus({ scans: [scan(C1), scan(C3), scan(C2)] }, [C1, C2, C3])).toBe('completed');
    expect(closingStatus({ scans: [scan(C2)] }, [C1, C2, C3])).toBe('incomplete');
    expect(closingStatus({ scans: [] }, [C1, C2, C3])).toBe('missed');
  });
});

describe('deadline of a round', () => {
  it('is the time limit after its time, or without one the route\'s next round', () => {
    expect(deadlineOfRound(guardState(), round('A', '20:00'))).toBe(local('20:20'));
    expect(deadlineOfRound(guardState(), round('B', '20:30'))).toBe(local('22:30'));
  });
});

describe('scheduler step', () => {
  it('does nothing without an open shift', () => {
    expect(step(guardState(), local('20:00'))).toEqual([]);
  });

  it('opens a round at its time with the route’s current version and the schedule’s time limit', () => {
    expect(step(withShift(), local('19:59'))).toEqual([]);
    const drafts = step(withShift(), local('20:00'));
    expect(drafts).toEqual([
      {
        type: 'round_opened',
        payload: { round_id: '019a2b3c-4d5e-7f00-8a00-000000001000', shift_id: SHIFT, route_version_id: VERSION_A1, schedule_id: SCHEDULE_A, scheduled_at: local('20:00'), time_limit_min: 20 },
        gnss_time: null,
      },
    ]);
  });

  it('leaves an open round alone before its deadline, and does not open a known time again', () => {
    expect(step(withShift({ rounds: [round('A', '20:00')] }), local('20:19'))).toEqual([]);
    expect(step(withShift({ rounds: [round('A', '20:00', { status: 'completed' })] }), local('20:25'))).toEqual([]);
  });

  it('closes a round at its deadline: incomplete with scans, missed without', () => {
    expect(describeDrafts(step(withShift({ rounds: [round('A', '20:00')] }), local('20:20')))).toEqual(['closed missed 20:20']);
    const scanned = round('A', '20:00', { status: 'in_progress', scans: [{ checkpoint_id: C1, scanned_at: local('20:03') }] });
    expect(step(withShift({ rounds: [scanned] }), local('20:21'))).toEqual([{ type: 'round_closed', payload: { round_id: scanned.id, status: 'incomplete', finished_at: local('20:20') }, gnss_time: null }]);
  });

  it('opens missed times later with their original time, and closes them at once if their deadline is over', () => {
    // The app did not run from 19:55 to 21:10.
    expect(describeDrafts(step(withShift(), local('21:10')))).toEqual(['opened A 20:00', 'closed missed 20:20', 'opened B 20:30', 'opened A 21:00']);
  });

  it('keeps one open round per route: the next time closes the previous round', () => {
    // B has no time limit: its 20:30 round lasts until its next time, 22:30.
    const open = round('B', '20:30', { status: 'in_progress', scans: [{ checkpoint_id: C3, scanned_at: local('20:40') }] });
    const state = withShift({ rounds: [open, round('A', '20:00', { status: 'missed' }), round('A', '21:00', { status: 'missed' }), round('A', '22:00', { status: 'missed' })] });
    expect(describeDrafts(step(state, local('22:30')))).toEqual(['closed incomplete 22:30', 'opened B 22:30']);

    // With a time limit longer than the interval, the previous round closes at the next time.
    const long = SCHEDULES.map((schedule) => (schedule.id === SCHEDULE_A ? { ...schedule, time_limit_min: 90 } : schedule));
    expect(describeDrafts(step(withShift({ schedules: long, rounds: [round('A', '20:00', { time_limit_min: 90 }), round('B', '20:30')] }), local('21:00')))).toEqual(['closed missed 21:00', 'opened A 21:00']);
  });

  it('closes the older of two open rounds of a route that the data has', () => {
    const state = withShift({ rounds: [round('A', '20:00'), round('A', '21:00')] });
    expect(describeDrafts(step(state, local('21:05')))).toEqual(['closed missed 20:20', 'opened B 20:30']);
  });

  it('opens a time slot from before the shift only if it is still running', () => {
    expect(describeDrafts(step(withShift({ shift: { ...OPEN_SHIFT, started_at: local('20:10') } }), local('20:10')))).toEqual(['opened A 20:00']);
    expect(describeDrafts(step(withShift({ shift: { ...OPEN_SHIFT, started_at: local('20:25') } }), local('20:30')))).toEqual(['opened B 20:30']);
  });

  it('opens no round for an inactive route, a route without a version or an inactive schedule', () => {
    const routes = [
      { id: ROUTE_A, order_mode: 'fixed' as const, current_version_id: VERSION_A1, active: false },
      { id: ROUTE_B, order_mode: 'free' as const, current_version_id: null, active: true },
    ];
    expect(step(withShift({ routes }), local('21:00'))).toEqual([]);
    expect(describeDrafts(step(withShift({ schedules: [{ ...SCHEDULES[0]!, active: false }, SCHEDULES[1]!] }), local('20:30')))).toEqual(['opened B 20:30']);
  });

  it('keeps the version of a running round when the route gets a new one', () => {
    const routes = [{ id: ROUTE_A, order_mode: 'fixed' as const, current_version_id: VERSION_A2, active: true }];
    const drafts = step(withShift({ routes, rounds: [round('A', '20:00', { status: 'in_progress', scans: [{ checkpoint_id: C1, scanned_at: local('20:01') }] })] }), local('21:00'));
    // The 20:00 round is judged by A1 (C1 of 3 → incomplete); the new one opens with A2.
    expect(describeDrafts(drafts)).toEqual(['closed incomplete 20:20', 'opened A 21:00']);
    expect(drafts[1]).toMatchObject({ payload: { route_version_id: VERSION_A2 } });
  });

  it('closes the shift 60 minutes after the latest deadline of its day, on every route (Q10)', () => {
    const slots = slotsAround(withShift(), Date.parse(local('19:55')), Date.parse(local('19:55')));
    // A 23:00 + 20 min = 23:20; B 22:30 is the last of its day without a limit: 23:30 → 00:30.
    expect(autoCloseTime(withShift(), slots, Date.parse(local('19:55')))).toBe(Date.parse(local('00:30', '2026-11-04')));

    const lastRounds = [round('A', '23:00', { status: 'in_progress', scans: [{ checkpoint_id: C2, scanned_at: local('23:05') }] }), round('B', '22:30')];
    const before = withShift({ rounds: [...['20:00', '21:00', '22:00'].map((t) => round('A', t, { status: 'missed' })), round('B', '20:30', { status: 'missed' }), ...lastRounds] });
    expect(describeDrafts(step(before, local('00:29', '2026-11-04')))).toEqual(['closed incomplete 23:20', 'closed missed 23:30']);

    const after = withShift({ rounds: [...before.rounds.filter((r) => r.status === 'missed'), ...lastRounds] });
    expect(describeDrafts(step(after, local('20:30', '2026-11-04')))).toEqual(['closed incomplete 23:20', 'closed missed 23:30', 'shift auto']);
  });

  it('takes the day of a shift started after midnight from the window it falls in', () => {
    const night = SCHEDULES.map((schedule) => (schedule.id === SCHEDULE_A ? { ...schedule, interval_to: '02:00' } : schedule));
    const shift = { ...OPEN_SHIFT, started_at: local('00:30', '2026-11-04') };
    const state = withShift({ shift, schedules: night });
    // The Tuesday window: A's last round 02:00 + 20 min → closes 03:20.
    expect(autoCloseTime(state, slotsAround(state, Date.parse(shift.started_at), Date.parse(shift.started_at)), Date.parse(shift.started_at))).toBe(Date.parse(local('03:20', '2026-11-04')));
  });

  it('never closes a shift automatically without schedules', () => {
    const state = withShift({ schedules: [] });
    expect(autoCloseTime(state, [], Date.parse(local('19:55')))).toBeNull();
    expect(step(state, local('12:00', '2026-11-05'))).toEqual([]);
  });

  it('closes rounds still open at the automatic close', () => {
    // A at 23:00 (20 min): the day's last deadline is 23:20, the close 00:20. B at 00:10 (30 min) belongs to the next
    // day, but starts before the close.
    const schedules = [
      { ...SCHEDULES[0]!, mode: 'list' as const, start_times: ['23:00'], interval_from: null, interval_to: null, interval_every_min: null },
      { ...SCHEDULES[1]!, start_times: ['00:10'], time_limit_min: 30 },
    ];
    const drafts = step(withShift({ schedules }), local('03:00', '2026-11-04'));
    expect(describeDrafts(drafts)).toEqual(['opened A 23:00', 'closed missed 23:20', 'opened B 00:10', 'closed missed 00:20', 'shift auto']);
    expect(drafts.at(-1)).toEqual({ type: 'shift_closed', payload: { shift_id: SHIFT, closed_by: 'auto' }, gnss_time: null });
  });

  it('orders the entries of several routes by time', () => {
    const drafts = step(withShift(), local('23:00'));
    expect(describeDrafts(drafts)).toEqual([
      'opened A 20:00',
      'closed missed 20:20',
      'opened B 20:30',
      'opened A 21:00',
      'closed missed 21:20',
      'opened A 22:00',
      'closed missed 22:20',
      'closed missed 22:30',
      'opened B 22:30',
      'opened A 23:00',
    ]);
    expect(drafts.filter((draft) => draft.type === 'round_opened').map((draft) => draft.payload.route_version_id)).toEqual([VERSION_A1, VERSION_B1, VERSION_A1, VERSION_A1, VERSION_B1, VERSION_A1]);
    expect(new Set(drafts.filter((draft) => draft.type === 'round_opened').map((draft) => draft.payload.schedule_id))).toEqual(new Set([SCHEDULE_A, SCHEDULE_B]));
  });
});
