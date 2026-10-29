import { alarmPlan, MAX_ALARMS } from './alarms';
import { guardState, local, OPEN_SHIFT, round, ROUTE_A, SCHEDULE_A, SCHEDULES } from './testing';

/** kind, route and local time of fire_at, e.g. 'round A 20:00'. */
const describeAlarms = (alarms: ReturnType<typeof alarmPlan>) =>
  alarms.map((alarm) => `${alarm.kind} ${alarm.route_id === ROUTE_A ? 'A' : 'B'} ${alarm.fire_at}`);

describe('alarm plan', () => {
  it('has two alarms for every round of the next 36 hours: at the time and 5 minutes later', () => {
    const alarms = alarmPlan(guardState(), local('19:00'));
    expect(describeAlarms(alarms).slice(0, 6)).toEqual([
      `round A ${local('20:00')}`,
      `reminder A ${local('20:05')}`,
      `round B ${local('20:30')}`,
      `reminder B ${local('20:35')}`,
      `round A ${local('21:00')}`,
      `reminder A ${local('21:05')}`,
    ]);
    // Two nights of 6 rounds; the third night starts after 36 hours.
    expect(alarms).toHaveLength(24);
    expect(alarms.at(-1)).toEqual({ kind: 'reminder', route_id: ROUTE_A, schedule_id: SCHEDULE_A, scheduled_at: local('23:00', '2026-11-04'), fire_at: local('23:05', '2026-11-04'), login: true });
  });

  it('includes a round exactly 36 hours ahead, with its reminder, and nothing later', () => {
    const alarms = alarmPlan(guardState(), local('08:00'));
    expect(describeAlarms(alarms).slice(-2)).toEqual([`round A ${local('20:00', '2026-11-04')}`, `reminder A ${local('20:05', '2026-11-04')}`]);
  });

  it('keeps the reminder of a round just past its time until it starts, and drops it once started or closed', () => {
    const shift = OPEN_SHIFT;
    const now = local('20:02');
    expect(describeAlarms(alarmPlan(guardState({ shift }), now)).slice(0, 2)).toEqual([`reminder A ${local('20:05')}`, `round B ${local('20:30')}`]);
    expect(describeAlarms(alarmPlan(guardState({ shift, rounds: [round('A', '20:00')] }), now))[0]).toBe(`reminder A ${local('20:05')}`);
    expect(describeAlarms(alarmPlan(guardState({ shift, rounds: [round('A', '20:00', { status: 'in_progress' })] }), now))[0]).toBe(`round B ${local('20:30')}`);
    expect(describeAlarms(alarmPlan(guardState({ shift, rounds: [round('A', '20:00', { status: 'completed' })] }), now))[0]).toBe(`round B ${local('20:30')}`);
    // After the reminder's time there is nothing left of the round.
    expect(describeAlarms(alarmPlan(guardState({ shift }), local('20:05')))[0]).toBe(`round B ${local('20:30')}`);
  });

  it('asks for a login where no open shift covers the round, i.e. without a shift or after its automatic close', () => {
    const alarms = alarmPlan(guardState({ shift: OPEN_SHIFT }), local('20:10'));
    expect(alarms.filter((alarm) => !alarm.login).map((alarm) => alarm.scheduled_at)).toEqual(expect.arrayContaining([local('20:30'), local('23:00')]));
    // The shift closes at 00:30 on 2026-11-04: the next night needs a login.
    expect(alarms.filter((alarm) => alarm.login).every((alarm) => alarm.scheduled_at >= local('20:00', '2026-11-04'))).toBe(true);
    expect(alarms.some((alarm) => alarm.login)).toBe(true);
    expect(alarmPlan(guardState(), local('20:10')).every((alarm) => alarm.login)).toBe(true);
  });

  it('keeps the first 48 alarms', () => {
    const everyQuarter = { ...SCHEDULES[0]!, interval_from: '00:00', interval_to: '23:45', interval_every_min: 15 };
    const alarms = alarmPlan(guardState({ schedules: [everyQuarter] }), local('19:00'));
    expect(alarms).toHaveLength(MAX_ALARMS);
    expect(alarms[0]?.fire_at).toBe(local('19:05'));
    expect(alarms.at(-1)?.fire_at).toBe(local('01:00', '2026-11-04'));
  });

  it('has no alarm for a route without rounds or an inactive schedule', () => {
    const state = guardState();
    const routes = state.routes.map((route) => (route.id === ROUTE_A ? { ...route, active: false } : { ...route, current_version_id: null }));
    expect(alarmPlan(guardState({ routes }), local('19:00'))).toEqual([]);
    expect(alarmPlan(guardState({ schedules: SCHEDULES.map((schedule) => ({ ...schedule, active: false })) }), local('19:00'))).toEqual([]);
  });
});
