import { scheduleVectors } from '@waypost/schema/vectors';

import { defaultTimeLimit, roundDeadline } from './deadline';
import { expandSchedule, slotsBetween, windowMinutes } from './schedule';
import { local, ROUTE_A, ROUTE_B, SCHEDULE_A, SCHEDULES, TIMEZONE } from './testing';

describe('schedule expansion', () => {
  it.each(scheduleVectors.expansion.map((vector) => [vector.name, vector] as const))('matches the shared vector %s', (_name, vector) => {
    expect(expandSchedule(vector.schedule, vector.timezone, vector.from_date, vector.to_date)).toEqual(vector.expected);
  });

  it('rejects an incomplete interval schedule and invalid dates', () => {
    expect(() => windowMinutes({ weekdays: 127, mode: 'interval', start_times: null, interval_from: '20:00', interval_to: null, interval_every_min: 60 })).toThrow('Incomplete interval schedule');
    expect(() => windowMinutes({ weekdays: 127, mode: 'interval', start_times: null, interval_from: '20:00', interval_to: '21:00', interval_every_min: 0 })).toThrow('Incomplete interval schedule');
    expect(() => expandSchedule(SCHEDULES[0]!, TIMEZONE, '2026-11-3', '2026-11-04')).toThrow('Invalid local date: 2026-11-3');
    expect(() => windowMinutes({ weekdays: 127, mode: 'list', start_times: ['24:00'], interval_from: null, interval_to: null, interval_every_min: null })).toThrow('Invalid local time: 24:00');
  });

  it('lists the slots of the active schedules within a period, with the window started the day before', () => {
    const slots = slotsBetween(SCHEDULES, TIMEZONE, Date.parse(local('22:00')), Date.parse(local('20:30', '2026-11-04')));
    expect(slots.map((slot) => [slot.schedule_id === SCHEDULE_A ? 'A' : 'B', slot.start_day, slot.scheduled_at])).toEqual([
      ['A', '2026-11-03', local('22:00')],
      ['B', '2026-11-03', local('22:30')],
      ['A', '2026-11-03', local('23:00')],
      ['A', '2026-11-04', local('20:00', '2026-11-04')],
      ['B', '2026-11-04', local('20:30', '2026-11-04')],
    ]);
    expect(slots[0]).toEqual({ route_id: ROUTE_A, schedule_id: SCHEDULE_A, start_day: '2026-11-03', scheduled_at: local('22:00'), time_limit_min: 20 });

    // A window of the day before reaching past midnight.
    const night = [{ ...SCHEDULES[0]!, interval_from: '22:00', interval_to: '02:00' }];
    expect(slotsBetween(night, TIMEZONE, Date.parse(local('00:30', '2026-11-04')), Date.parse(local('01:00', '2026-11-04'))).map((slot) => slot.start_day)).toEqual(['2026-11-03']);

    expect(slotsBetween([{ ...SCHEDULES[0]!, active: false }], TIMEZONE, Date.parse(local('19:00')), Date.parse(local('23:00')))).toEqual([]);
    expect(slotsBetween(SCHEDULES, TIMEZONE, Date.parse(local('23:00')), Date.parse(local('22:00')))).toEqual([]);
  });
});

describe('time limit and deadline', () => {
  it.each(scheduleVectors.time_limit_default.map((vector) => [vector.walk_duration_s, vector.time_limit_min] as const))('defaults to the shared vector: %p s → %p min', (walk, limit) => {
    expect(defaultTimeLimit(walk)).toBe(limit);
  });

  const slots = slotsBetween(SCHEDULES, TIMEZONE, Date.parse(local('19:00')), Date.parse(local('23:59')));

  it('is scheduled_at + time_limit_min with a time limit', () => {
    expect(roundDeadline({ route_id: ROUTE_A, start_day: '2026-11-03', scheduled_at: local('20:00'), time_limit_min: 20 }, slots)).toBe(local('20:20'));
    expect(roundDeadline({ route_id: ROUTE_A, start_day: '2026-11-03', scheduled_at: local('20:00'), time_limit_min: 90 }, slots)).toBe(local('21:30'));
  });

  it('is the time of the route’s next round of the same day without a time limit', () => {
    expect(roundDeadline({ route_id: ROUTE_B, start_day: '2026-11-03', scheduled_at: local('20:30'), time_limit_min: null }, slots)).toBe(local('22:30'));
  });

  it('is scheduled_at + 60 minutes for the day’s last round without a time limit', () => {
    expect(roundDeadline({ route_id: ROUTE_B, start_day: '2026-11-03', scheduled_at: local('22:30'), time_limit_min: null }, slots)).toBe(local('23:30'));
    // The next day's round of the route does not count.
    const twoDays = slotsBetween(SCHEDULES, TIMEZONE, Date.parse(local('19:00')), Date.parse(local('23:59', '2026-11-04')));
    expect(roundDeadline({ route_id: ROUTE_B, start_day: '2026-11-03', scheduled_at: local('22:30'), time_limit_min: null }, twoDays)).toBe(local('23:30'));
    // Nor another route's.
    expect(roundDeadline({ route_id: ROUTE_A, start_day: '2026-11-03', scheduled_at: local('23:00'), time_limit_min: null }, slots)).toBe(local('00:00', '2026-11-04'));
  });
});
