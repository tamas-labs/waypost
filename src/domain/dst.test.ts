// The rules above the schedule expansion on the nights of a DST change in Budapest (audit WP-APP-012): the expansion is
// covered by the shared vectors; these pin the rounds opened, the deadlines, the automatic close and the alarms.
// 2026-03-29 02:00 CET → 03:00 CEST (a wall-clock time in the gap is 03:00); 2026-10-25 03:00 CEST → 02:00 CET (a
// repeated time is its first occurrence).
import type { Timestamp } from '@waypost/schema';

import { alarmPlan } from './alarms';
import { autoCloseTime, deadlineOfRound, schedulerStep, slotsAround } from './rounds';
import type { ScheduleOfRoute } from './schedule';
import type { GuardState } from './state';
import { guardState, idSequence, OPEN_SHIFT, ROUTE_A, ROUTE_B, SCHEDULE_A, SCHEDULE_B } from './testing';

/** A: every hour 20:00–06:00 with a 20-minute limit; B: three times after midnight without a limit. */
const NIGHT: ScheduleOfRoute[] = [
  {
    id: SCHEDULE_A,
    route_id: ROUTE_A,
    weekdays: 127,
    mode: 'interval',
    start_times: null,
    interval_from: '20:00',
    interval_to: '06:00',
    interval_every_min: 60,
    time_limit_min: 20,
    active: true,
  },
  {
    id: SCHEDULE_B,
    route_id: ROUTE_B,
    weekdays: 127,
    mode: 'list',
    start_times: ['01:30', '02:30', '03:30'],
    interval_from: null,
    interval_to: null,
    interval_every_min: null,
    time_limit_min: null,
    active: true,
  },
];

const utc = (date: string, time: string): Timestamp => `${date}T${time}:00.000Z`;
const plus = (at: Timestamp, minutes: number): Timestamp => new Date(Date.parse(at) + minutes * 60_000).toISOString();

interface Night {
  name: string;
  /** The shift's start, 19:55 local. */
  startedAt: Timestamp;
  a: Timestamp[];
  /** B's rounds with their deadlines. */
  b: [Timestamp, Timestamp][];
  autoClose: Timestamp;
}

const NIGHTS: Night[] = [
  {
    name: 'spring forward (2026-03-28/29)',
    startedAt: utc('2026-03-28', '18:55'),
    // 02:00 local falls into the gap: it is 03:00 CEST, the same instant as 03:00, so one round.
    a: [
      ...['19:00', '20:00', '21:00', '22:00', '23:00'].map((time) => utc('2026-03-28', time)),
      ...['00:00', '01:00', '02:00', '03:00', '04:00'].map((time) => utc('2026-03-29', time)),
    ],
    // 02:30 local is 03:00 CEST too: 30 minutes after 01:30, 30 minutes before 03:30.
    b: [
      [utc('2026-03-29', '00:30'), utc('2026-03-29', '01:00')],
      [utc('2026-03-29', '01:00'), utc('2026-03-29', '01:30')],
      [utc('2026-03-29', '01:30'), utc('2026-03-29', '02:30')],
    ],
    // A's last deadline (06:20 CEST) + 60 minutes.
    autoClose: utc('2026-03-29', '05:20'),
  },
  {
    name: 'fall back (2026-10-24/25)',
    startedAt: utc('2026-10-24', '17:55'),
    // 02:00 local is its first occurrence (CEST); the repeated hour has no round, 03:00 CET is two hours later.
    a: [
      ...['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'].map((time) => utc('2026-10-24', time)),
      ...['00:00', '02:00', '03:00', '04:00', '05:00'].map((time) => utc('2026-10-25', time)),
    ],
    // The deadline is the next round: an hour on the wall clock, two hours across the repeated hour.
    b: [
      [utc('2026-10-24', '23:30'), utc('2026-10-25', '00:30')],
      [utc('2026-10-25', '00:30'), utc('2026-10-25', '02:30')],
      [utc('2026-10-25', '02:30'), utc('2026-10-25', '03:30')],
    ],
    autoClose: utc('2026-10-25', '06:20'),
  },
];

describe.each(NIGHTS.map((night) => [night.name, night] as const))('the night of %s', (_name, night) => {
  const shift = { ...OPEN_SHIFT, started_at: night.startedAt };
  const state: GuardState = guardState({ shift, schedules: NIGHT });
  const startedMs = Date.parse(night.startedAt);

  it('has the deadlines of the rounds in real time', () => {
    for (const at of night.a) {
      expect(deadlineOfRound(state, { route_id: ROUTE_A, schedule_id: SCHEDULE_A, scheduled_at: at, time_limit_min: 20 })).toBe(
        plus(at, 20),
      );
    }
    for (const [at, deadline] of night.b) {
      expect(deadlineOfRound(state, { route_id: ROUTE_B, schedule_id: SCHEDULE_B, scheduled_at: at, time_limit_min: null })).toBe(deadline);
    }
  });

  it('closes the shift 60 minutes after the last deadline', () => {
    expect(autoCloseTime(state, slotsAround(state, startedMs, startedMs), startedMs)).toBe(Date.parse(night.autoClose));
  });

  it('opens every round once, closes each at its deadline and the shift at the automatic close', () => {
    const drafts = schedulerStep(state, plus(night.autoClose, 600), idSequence());
    const opened = (scheduleId: string) =>
      drafts.flatMap((draft) =>
        draft.type === 'round_opened' && draft.payload.schedule_id === scheduleId ? [draft.payload.scheduled_at] : [],
      );
    expect(opened(SCHEDULE_A)).toEqual(night.a);
    expect(opened(SCHEDULE_B)).toEqual(night.b.map(([at]) => at));
    const closedAt = drafts.flatMap((draft) => (draft.type === 'round_closed' ? [draft.payload.finished_at] : []));
    expect([...closedAt].sort()).toEqual([...night.a.map((at) => plus(at, 20)), ...night.b.map(([, deadline]) => deadline)].sort());
    expect(drafts.at(-1)).toMatchObject({ type: 'shift_closed', payload: { closed_by: 'auto' } });
  });

  it('plans an alarm at the time of every round of the night', () => {
    const night36h = alarmPlan(guardState({ schedules: NIGHT }), plus(night.startedAt, -55), 192);
    const fired = night36h.filter((alarm) => alarm.kind === 'round' && alarm.fire_at <= night.autoClose).map((alarm) => alarm.fire_at);
    expect(fired).toEqual([...night.a, ...night.b.map(([at]) => at)].sort());
  });
});
