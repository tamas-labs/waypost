import {
  ALL_DAYS,
  ScheduleEditError,
  addStartTime,
  beginScheduleEdit,
  dayOn,
  draftRounds,
  orderStartTimes,
  removeStartTime,
  replaceStartTime,
  rulesOf,
  scheduleChanges,
  scheduleDraftError,
  scheduleEditChanged,
  scheduleSave,
  setIntervalWindow,
  setNoLimit,
  setScheduleActive,
  setScheduleMode,
  stepTimeLimit,
  suggestedTimeLimit,
  toggleDay,
  type SavedSchedule,
  type ScheduleEdit,
  type ScheduleEditBase,
} from './schedule-edit';

const ROUTE = { id: '019a2b3c-4d5e-7f00-8a00-0000000000b1', name: 'Éjszakai kör' };
const SCHEDULE_ID = '019a2b3c-4d5e-7f00-8a00-0000000000e1';

const NIGHTLY: SavedSchedule = {
  id: SCHEDULE_ID,
  name: 'Éjszakai kör',
  weekdays: 31,
  mode: 'interval',
  start_times: null,
  interval_from: '20:00',
  interval_to: '08:00',
  interval_every_min: 60,
  time_limit_min: 25,
  active: true,
};

const base = (schedule: SavedSchedule | null, walk_duration_s: number | null = 980): ScheduleEditBase => ({
  route: ROUTE,
  walk_duration_s,
  schedule,
  schedule_count: schedule === null ? 0 : 1,
});

const expectError = (run: () => unknown, code: string) => {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(ScheduleEditError);
    expect((e as ScheduleEditError).code).toBe(code);
    return;
  }
  throw new Error(`No ScheduleEditError ${code}`);
};

describe('a new schedule', () => {
  test('is every night 20:00–08:00 hourly, on, with the suggested time limit, and can be saved as it is', () => {
    const edit = beginScheduleEdit(base(null));
    expect(edit.draft).toEqual({
      weekdays: ALL_DAYS,
      mode: 'interval',
      start_times: [],
      interval_from: '20:00',
      interval_to: '08:00',
      interval_every_min: 60,
      time_limit_min: 25,
      limit_before: 25,
      active: true,
    });
    expect(scheduleEditChanged(edit)).toBe(true);
    expect(scheduleSave(edit)).toEqual({
      kind: 'create',
      body: {
        route_id: ROUTE.id,
        name: 'Éjszakai kör',
        weekdays: ALL_DAYS,
        mode: 'interval',
        interval_from: '20:00',
        interval_to: '08:00',
        interval_every_min: 60,
        time_limit_min: 25,
        active: true,
      },
    });
  });

  test('without a measured walk the limit is 20 minutes', () => {
    expect(suggestedTimeLimit(base(null, null))).toBe(20);
    expect(beginScheduleEdit(base(null, null)).draft.time_limit_min).toBe(20);
  });

  test('as a list sends its times only', () => {
    let edit = setScheduleMode(beginScheduleEdit(base(null)), 'list');
    edit = { ...edit, draft: { ...edit.draft, start_times: [] } };
    edit = addStartTime(addStartTime(edit, '22:00'), '02:00');
    expect(scheduleSave(edit)).toEqual({
      kind: 'create',
      body: expect.objectContaining({ mode: 'list', start_times: ['22:00', '02:00'] }),
    });
    expect(scheduleSave(edit).body).not.toHaveProperty('interval_from');
  });
});

describe('a saved schedule', () => {
  test('starts as it is, and is unchanged until something changes', () => {
    const edit = beginScheduleEdit(base(NIGHTLY));
    expect(edit.draft).toEqual(expect.objectContaining({ weekdays: 31, mode: 'interval', time_limit_min: 25, limit_before: 25 }));
    expect(scheduleEditChanged(edit)).toBe(false);
    expect(scheduleChanges(edit)).toEqual({});
    expectError(() => scheduleSave(edit), 'unchanged');
  });

  test('a saved list keeps its order, and a schedule without a limit remembers the suggested one', () => {
    const list: SavedSchedule = {
      ...NIGHTLY,
      mode: 'list',
      start_times: ['22:00', '23:00', '21:00'],
      interval_from: null,
      interval_to: null,
      interval_every_min: null,
      time_limit_min: null,
    };
    const edit = beginScheduleEdit(base(list));
    expect(edit.draft.start_times).toEqual(['22:00', '23:00', '21:00']);
    expect(edit.draft).toEqual(
      expect.objectContaining({ interval_from: '20:00', interval_to: '08:00', interval_every_min: 60, limit_before: 25 }),
    );
    expect(scheduleEditChanged(edit)).toBe(false);
  });

  test('sends only what changed', () => {
    let edit = beginScheduleEdit(base(NIGHTLY));
    edit = toggleDay(edit, 5);
    expect(scheduleChanges(edit)).toEqual({ weekdays: 63 });
    edit = stepTimeLimit(edit, 1);
    edit = setScheduleActive(edit, false);
    expect(scheduleSave(edit)).toEqual({ kind: 'update', id: SCHEDULE_ID, body: { weekdays: 63, time_limit_min: 30, active: false } });
  });

  test('a changed window sends all its fields; turned back, nothing', () => {
    let edit = setIntervalWindow(beginScheduleEdit(base(NIGHTLY)), { interval_every_min: 30 });
    expect(scheduleChanges(edit)).toEqual({ interval_from: '20:00', interval_to: '08:00', interval_every_min: 30 });
    edit = setIntervalWindow(edit, { interval_every_min: 60 });
    expect(scheduleEditChanged(edit)).toBe(false);
  });

  test('a changed mode sends the mode with its fields', () => {
    const edit = setScheduleMode(beginScheduleEdit(base({ ...NIGHTLY, interval_from: '20:00', interval_to: '23:00' })), 'list');
    expect(scheduleChanges(edit)).toEqual({ mode: 'list', start_times: ['20:00', '21:00', '22:00', '23:00'] });
  });

  test('a changed list sends the list', () => {
    const list: SavedSchedule = {
      ...NIGHTLY,
      mode: 'list',
      start_times: ['22:00', '02:00'],
      interval_from: null,
      interval_to: null,
      interval_every_min: null,
    };
    const edit = removeStartTime(beginScheduleEdit(base(list)), '02:00');
    expect(scheduleChanges(edit)).toEqual({ start_times: ['22:00'] });
  });
});

describe('the days', () => {
  test('toggle one by one; none cannot be saved', () => {
    let edit = beginScheduleEdit(base({ ...NIGHTLY, weekdays: 1 }));
    expect(dayOn(edit.draft, 0)).toBe(true);
    expect(dayOn(edit.draft, 6)).toBe(false);
    edit = toggleDay(edit, 6);
    expect(edit.draft.weekdays).toBe(65);
    edit = toggleDay(toggleDay(edit, 6), 0);
    expect(edit.draft.weekdays).toBe(0);
    expect(scheduleDraftError(edit.draft)).toBe('no_days');
    expectError(() => scheduleSave(edit), 'no_days');
  });
});

describe('the order of a list', () => {
  test('starts after the longest gap around the clock', () => {
    expect(orderStartTimes(['00:00', '20:00', '02:00', '22:00'])).toEqual(['20:00', '22:00', '00:00', '02:00']);
    expect(orderStartTimes(['16:00', '08:00', '12:00'])).toEqual(['08:00', '12:00', '16:00']);
    expect(orderStartTimes(['23:30', '00:30'])).toEqual(['23:30', '00:30']);
  });

  test('equal gaps start at midnight; one time or none is itself', () => {
    expect(orderStartTimes(['18:00', '06:00', '00:00', '12:00'])).toEqual(['00:00', '06:00', '12:00', '18:00']);
    expect(orderStartTimes(['21:15'])).toEqual(['21:15']);
    expect(orderStartTimes([])).toEqual([]);
  });

  test('a time is added and changed in its place, never twice; removed', () => {
    const list: SavedSchedule = {
      ...NIGHTLY,
      mode: 'list',
      start_times: ['22:00', '02:00'],
      interval_from: null,
      interval_to: null,
      interval_every_min: null,
    };
    let edit = beginScheduleEdit(base(list));
    edit = addStartTime(edit, '00:00');
    expect(edit.draft.start_times).toEqual(['22:00', '00:00', '02:00']);
    expectError(() => addStartTime(edit, '02:00'), 'duplicate_time');
    edit = replaceStartTime(edit, '02:00', '21:00');
    expect(edit.draft.start_times).toEqual(['21:00', '22:00', '00:00']);
    expect(replaceStartTime(edit, '21:00', '21:00')).toBe(edit);
    expectError(() => replaceStartTime(edit, '21:00', '22:00'), 'duplicate_time');
    edit = removeStartTime(removeStartTime(removeStartTime(edit, '21:00'), '22:00'), '00:00');
    expect(scheduleDraftError(edit.draft)).toBe('no_times');
    expect(draftRounds(edit.draft)).toBeNull();
  });
});

describe('switching the mode', () => {
  test('a list starts with the window’s times; a dense window gives an empty list', () => {
    const edit = setScheduleMode(beginScheduleEdit(base(null)), 'list');
    expect(edit.draft.start_times).toHaveLength(13);
    expect(edit.draft.start_times.slice(0, 2)).toEqual(['20:00', '21:00']);
    expect(edit.draft.start_times.at(-1)).toBe('08:00');
    const dense = setScheduleMode(setIntervalWindow(beginScheduleEdit(base(null)), { interval_every_min: 15 }), 'list');
    expect(dense.draft.start_times).toEqual([]);
  });

  test('a window from a list starts at its first and ends at its last time', () => {
    const list: SavedSchedule = {
      ...NIGHTLY,
      mode: 'list',
      start_times: ['21:00', '23:00', '03:00'],
      interval_from: null,
      interval_to: null,
      interval_every_min: null,
    };
    const edit = setScheduleMode(beginScheduleEdit(base(list)), 'interval');
    expect(edit.draft).toEqual(
      expect.objectContaining({ mode: 'interval', interval_from: '21:00', interval_to: '03:00', interval_every_min: 60 }),
    );
  });

  test('back and forth keeps both modes’ values; the same mode is no change', () => {
    const start = beginScheduleEdit(base(NIGHTLY));
    expect(setScheduleMode(start, 'interval')).toBe(start);
    const back = setScheduleMode(setScheduleMode(start, 'list'), 'interval');
    expect(back.draft.interval_from).toBe('20:00');
    expect(scheduleEditChanged(back)).toBe(false);
    const list = setScheduleMode(
      beginScheduleEdit(
        base({ ...NIGHTLY, interval_from: null, interval_to: null, interval_every_min: null, mode: 'list', start_times: ['22:00'] }),
      ),
      'interval',
    );
    expect(list.draft).toEqual(expect.objectContaining({ interval_from: '20:00', interval_to: '08:00' }));
  });

  test('a window from and to the same time cannot be saved', () => {
    const edit = setIntervalWindow(beginScheduleEdit(base(NIGHTLY)), { interval_to: '20:00' });
    expect(scheduleDraftError(edit.draft)).toBe('same_from_to');
    expect(setScheduleMode(edit, 'list').draft.start_times).toEqual([]);
  });
});

describe('the time limit', () => {
  test('steps by 5 minutes within 5 … 1440; a value between steps goes to the nearer step', () => {
    const at = (limit: number) => beginScheduleEdit(base({ ...NIGHTLY, time_limit_min: limit }));
    expect(stepTimeLimit(at(25), 1).draft.time_limit_min).toBe(30);
    expect(stepTimeLimit(at(25), -1).draft.time_limit_min).toBe(20);
    expect(stepTimeLimit(at(23), 1).draft.time_limit_min).toBe(25);
    expect(stepTimeLimit(at(23), -1).draft.time_limit_min).toBe(20);
    expect(stepTimeLimit(at(5), -1).draft.time_limit_min).toBe(5);
    expect(stepTimeLimit(at(3), -1).draft.time_limit_min).toBe(5);
    expect(stepTimeLimit(at(1440), 1).draft.time_limit_min).toBe(1440);
  });

  test('"Nincs időkorlát" is null; switched off, the limit before it comes back; a step brings a limit again', () => {
    const limited = stepTimeLimit(beginScheduleEdit(base(NIGHTLY)), 1);
    const none = setNoLimit(limited, true);
    expect(none.draft.time_limit_min).toBeNull();
    expect(scheduleChanges(none)).toEqual({ time_limit_min: null });
    expect(setNoLimit(none, false).draft.time_limit_min).toBe(30);
    expect(setNoLimit(setNoLimit(none, true), false).draft.time_limit_min).toBe(30);
    expect(stepTimeLimit(none, 1).draft.time_limit_min).toBe(35);
  });
});

describe('the rounds of a day', () => {
  test('a window: count, last time, whether it crosses midnight', () => {
    expect(draftRounds(beginScheduleEdit(base(NIGHTLY)).draft)).toEqual({ count: 13, last: '08:00', overnight: true });
    const day = setIntervalWindow(beginScheduleEdit(base(NIGHTLY)), {
      interval_from: '08:00',
      interval_to: '16:00',
      interval_every_min: 120,
    });
    expect(draftRounds(day.draft)).toEqual({ count: 5, last: '16:00', overnight: false });
  });

  test('a list, even without days chosen', () => {
    const list: SavedSchedule = {
      ...NIGHTLY,
      weekdays: 1,
      mode: 'list',
      start_times: ['22:00', '02:00'],
      interval_from: null,
      interval_to: null,
      interval_every_min: null,
    };
    const edit = toggleDay(beginScheduleEdit(base(list)), 0);
    expect(draftRounds(edit.draft)).toEqual({ count: 2, last: '02:00', overnight: true });
  });

  test('the rules of the draft have the other mode’s fields null', () => {
    const edit: ScheduleEdit = beginScheduleEdit(base(NIGHTLY));
    expect(rulesOf(edit.draft)).toEqual({
      weekdays: 31,
      mode: 'interval',
      start_times: null,
      interval_from: '20:00',
      interval_to: '08:00',
      interval_every_min: 60,
    });
    expect(rulesOf(setScheduleMode(edit, 'list').draft)).toEqual(
      expect.objectContaining({ mode: 'list', interval_from: null, interval_every_min: null }),
    );
  });
});
