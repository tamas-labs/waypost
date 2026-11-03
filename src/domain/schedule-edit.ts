// The schedule of a route as the supervisor edits it (S8, specification: Állapotgépek / Menetrend → körök): the days,
// the start times as a list or a repeating window, the time limit with its suggested value (M3-14) or none, and whether
// the schedule is on. A route has one schedule on the phone's screen (decisions: "Menetrend"): the first one, if the
// server has more. The save is a create or a change of only what changed (supervisor/schedule-edit.ts).
import type { LocalTime, ScheduleCreateRequest, ScheduleUpdateRequest } from '@waypost/schema';

import { formatLocalTime, parseLocalTime } from '@/time/zone';

import { defaultTimeLimit } from './deadline';
import { windowMinutes, type ScheduleRules } from './schedule';

export type ScheduleMode = 'list' | 'interval';

/** Every day of the week in the weekdays mask (Monday = 1 … Sunday = 64). */
export const ALL_DAYS = 127;
/** The step of the time limit's −/+ buttons, and its bounds (api/schedule-create.request: 1 … 1440). */
export const TIME_LIMIT_STEP = 5;
export const TIME_LIMIT_MIN = 5;
export const TIME_LIMIT_MAX = 1440;
/** The frequencies of a repeating window the screen offers, in minutes. */
export const INTERVAL_OPTIONS: readonly number[] = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360];

/** A list switched to starts with the window's times only up to this many: a dense window is no list to edit. */
const LIST_SEED_MAX = 24;

/** The defaults of a new schedule: every night from 20:00 to 08:00, hourly (the design's example). */
const NEW_INTERVAL = { interval_from: '20:00', interval_to: '08:00', interval_every_min: 60 } as const;

/** A schedule of the route as it is on the phone. */
export interface SavedSchedule extends ScheduleRules {
  id: string;
  name: string;
  time_limit_min: number | null;
  active: boolean;
}

export interface ScheduleEditBase {
  route: { id: string; name: string };
  /** The walk of the route's current version, for the suggested time limit; null: not measured (or no version). */
  walk_duration_s: number | null;
  /** The schedule edited; null: the route has none, the save creates it. */
  schedule: SavedSchedule | null;
  /** How many schedules the route has on the phone: more than one is edited on the web. */
  schedule_count: number;
}

/** What the screen shows and changes. Both modes' fields are kept, so switching back loses nothing. */
export interface ScheduleDraft {
  weekdays: number;
  mode: ScheduleMode;
  start_times: LocalTime[];
  interval_from: LocalTime;
  interval_to: LocalTime;
  interval_every_min: number;
  /** null: no time limit. */
  time_limit_min: number | null;
  /** The limit shown again when "Nincs időkorlát" is switched off. */
  limit_before: number;
  active: boolean;
}

export interface ScheduleEdit {
  base: ScheduleEditBase;
  draft: ScheduleDraft;
}

export type ScheduleEditErrorCode = 'no_days' | 'no_times' | 'same_from_to' | 'duplicate_time' | 'unchanged';

export class ScheduleEditError extends Error {
  constructor(
    readonly code: ScheduleEditErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'ScheduleEditError';
  }
}

/** The suggested time limit of the route (M3-14): from its measured walk, otherwise 20 minutes. */
export const suggestedTimeLimit = (base: ScheduleEditBase) => defaultTimeLimit(base.walk_duration_s);

export function beginScheduleEdit(base: ScheduleEditBase): ScheduleEdit {
  const suggested = suggestedTimeLimit(base);
  const saved = base.schedule;
  if (saved === null) {
    return {
      base,
      draft: {
        weekdays: ALL_DAYS,
        mode: 'interval',
        start_times: [],
        ...NEW_INTERVAL,
        time_limit_min: suggested,
        limit_before: suggested,
        active: true,
      },
    };
  }
  return {
    base,
    draft: {
      weekdays: saved.weekdays,
      mode: saved.mode,
      start_times: [...(saved.start_times ?? [])],
      interval_from: saved.interval_from ?? NEW_INTERVAL.interval_from,
      interval_to: saved.interval_to ?? NEW_INTERVAL.interval_to,
      interval_every_min: saved.interval_every_min ?? NEW_INTERVAL.interval_every_min,
      time_limit_min: saved.time_limit_min,
      limit_before: saved.time_limit_min ?? suggested,
      active: saved.active,
    },
  };
}

const withDraft = (edit: ScheduleEdit, change: Partial<ScheduleDraft>): ScheduleEdit => ({
  ...edit,
  draft: { ...edit.draft, ...change },
});

/** Day 0 = Monday … 6 = Sunday on or off. */
export function toggleDay(edit: ScheduleEdit, day: number): ScheduleEdit {
  return withDraft(edit, { weekdays: edit.draft.weekdays ^ (1 << day) });
}

export const dayOn = (draft: ScheduleDraft, day: number) => (draft.weekdays & (1 << day)) !== 0;

/**
 * The times of a list in the order of their day: the list is a sequence from its start day (a time not later than the
 * previous one is on the next day), so it starts after the longest gap between two times around the clock – a night's
 * 20:00, 22:00, 00:00, 02:00 stays a night, not a day starting at 00:00. Equal gaps: the day starts at midnight.
 */
export function orderStartTimes(times: readonly LocalTime[]): LocalTime[] {
  const minutes = [...new Set(times.map(parseLocalTime))].sort((a, b) => a - b);
  if (minutes.length < 2) return minutes.map(formatLocalTime);
  let start = 0;
  let longest = minutes[0]! + 1440 - minutes.at(-1)!;
  for (let i = 1; i < minutes.length; i += 1) {
    const gap = minutes[i]! - minutes[i - 1]!;
    if (gap > longest) {
      longest = gap;
      start = i;
    }
  }
  return [...minutes.slice(start), ...minutes.slice(0, start)].map(formatLocalTime);
}

/**
 * List or repeating window. A list switched to with no times starts with the window's times (up to 24), a window switched to
 * from a list that has times starts at its first and ends at its last: what the schedule did stays the starting point.
 */
export function setScheduleMode(edit: ScheduleEdit, mode: ScheduleMode): ScheduleEdit {
  const { draft } = edit;
  if (mode === draft.mode) return edit;
  if (mode === 'list' && draft.start_times.length === 0 && draft.interval_from !== draft.interval_to) {
    const times = windowMinutes(rulesOf({ ...draft, mode: 'interval' })).map((minutes) => formatLocalTime(minutes % 1440));
    if (times.length <= LIST_SEED_MAX) return withDraft(edit, { mode, start_times: orderStartTimes(times) });
  }
  if (mode === 'interval' && draft.start_times.length >= 2 && !edit.base.schedule?.interval_from) {
    return withDraft(edit, { mode, interval_from: draft.start_times[0]!, interval_to: draft.start_times.at(-1)! });
  }
  return withDraft(edit, { mode });
}

/** A time added to the list, in its place; one already in it is an error (the schema: unique items). */
export function addStartTime(edit: ScheduleEdit, time: LocalTime): ScheduleEdit {
  if (edit.draft.start_times.includes(time)) throw new ScheduleEditError('duplicate_time');
  return withDraft(edit, { start_times: orderStartTimes([...edit.draft.start_times, time]) });
}

/** A time of the list changed to another one. */
export function replaceStartTime(edit: ScheduleEdit, from: LocalTime, to: LocalTime): ScheduleEdit {
  if (from === to) return edit;
  if (edit.draft.start_times.includes(to)) throw new ScheduleEditError('duplicate_time');
  return withDraft(edit, { start_times: orderStartTimes(edit.draft.start_times.map((time) => (time === from ? to : time))) });
}

export function removeStartTime(edit: ScheduleEdit, time: LocalTime): ScheduleEdit {
  return withDraft(edit, { start_times: edit.draft.start_times.filter((t) => t !== time) });
}

export function setIntervalWindow(
  edit: ScheduleEdit,
  change: Partial<Pick<ScheduleDraft, 'interval_from' | 'interval_to' | 'interval_every_min'>>,
): ScheduleEdit {
  return withDraft(edit, change);
}

/**
 * The time limit 5 minutes shorter or longer, within 5 … 1440. A limit between two steps (set on the web) goes to the
 * nearer step in that direction.
 */
export function stepTimeLimit(edit: ScheduleEdit, by: -1 | 1): ScheduleEdit {
  const current = edit.draft.time_limit_min ?? edit.draft.limit_before;
  const stepped =
    by > 0
      ? Math.floor(current / TIME_LIMIT_STEP) * TIME_LIMIT_STEP + TIME_LIMIT_STEP
      : Math.ceil(current / TIME_LIMIT_STEP) * TIME_LIMIT_STEP - TIME_LIMIT_STEP;
  const limit = Math.min(TIME_LIMIT_MAX, Math.max(TIME_LIMIT_MIN, stepped));
  return withDraft(edit, { time_limit_min: limit, limit_before: limit });
}

/** "Nincs időkorlát": null; switched off, the limit before it comes back. */
export function setNoLimit(edit: ScheduleEdit, none: boolean): ScheduleEdit {
  const { draft } = edit;
  if (none) return withDraft(edit, { time_limit_min: null, limit_before: draft.time_limit_min ?? draft.limit_before });
  return withDraft(edit, { time_limit_min: draft.limit_before });
}

export function setScheduleActive(edit: ScheduleEdit, active: boolean): ScheduleEdit {
  return withDraft(edit, { active });
}

/** The draft as a schedule's rules: the fields of the other mode are null, as in the entity. */
export function rulesOf(draft: ScheduleDraft): ScheduleRules {
  return draft.mode === 'list'
    ? {
        weekdays: draft.weekdays,
        mode: 'list',
        start_times: draft.start_times,
        interval_from: null,
        interval_to: null,
        interval_every_min: null,
      }
    : {
        weekdays: draft.weekdays,
        mode: 'interval',
        start_times: null,
        interval_from: draft.interval_from,
        interval_to: draft.interval_to,
        interval_every_min: draft.interval_every_min,
      };
}

/** What makes the draft not savable; null if it can be saved. */
export function scheduleDraftError(draft: ScheduleDraft): ScheduleEditErrorCode | null {
  if ((draft.weekdays & ALL_DAYS) === 0) return 'no_days';
  if (draft.mode === 'list' && draft.start_times.length === 0) return 'no_times';
  if (draft.mode === 'interval' && draft.interval_from === draft.interval_to) return 'same_from_to';
  return null;
}

/** The rounds of one day of the draft: how many, the last one's time, and whether the window crosses midnight. */
export function draftRounds(draft: ScheduleDraft): { count: number; last: LocalTime; overnight: boolean } | null {
  if (scheduleDraftError({ ...draft, weekdays: ALL_DAYS }) !== null) return null;
  const minutes = windowMinutes(rulesOf(draft));
  const last = minutes.at(-1)!;
  return { count: minutes.length, last: formatLocalTime(last % 1440), overnight: last >= 1440 };
}

/** The fields of the draft's mode, as the requests carry them. */
function modeFields(
  draft: ScheduleDraft,
): Pick<ScheduleUpdateRequest, 'start_times' | 'interval_from' | 'interval_to' | 'interval_every_min'> {
  if (draft.mode === 'list') return { start_times: draft.start_times as [LocalTime, ...LocalTime[]] };
  return { interval_from: draft.interval_from, interval_to: draft.interval_to, interval_every_min: draft.interval_every_min };
}

const sameTimes = (a: readonly LocalTime[] | null, b: readonly LocalTime[]) =>
  a !== null && a.length === b.length && a.every((time, i) => time === b[i]);

/**
 * The change of the saved schedule: only what changed, and with a changed mode or times all fields of the mode (the
 * server clears the other mode's). Empty: nothing changed. A new schedule has no change: it is created.
 */
export function scheduleChanges(edit: ScheduleEdit): ScheduleUpdateRequest {
  const { draft } = edit;
  const saved = edit.base.schedule;
  if (saved === null) return {};
  const body: ScheduleUpdateRequest = {};
  if (draft.weekdays !== saved.weekdays) body.weekdays = draft.weekdays;
  const timesChanged =
    draft.mode === 'list'
      ? !sameTimes(saved.start_times, draft.start_times)
      : saved.interval_from !== draft.interval_from ||
        saved.interval_to !== draft.interval_to ||
        saved.interval_every_min !== draft.interval_every_min;
  if (draft.mode !== saved.mode) Object.assign(body, { mode: draft.mode }, modeFields(draft));
  else if (timesChanged) Object.assign(body, modeFields(draft));
  if (draft.time_limit_min !== saved.time_limit_min) body.time_limit_min = draft.time_limit_min;
  if (draft.active !== saved.active) body.active = draft.active;
  return body;
}

/** Whether there is something to save: a new schedule always (its defaults too), a saved one if it changed. */
export function scheduleEditChanged(edit: ScheduleEdit): boolean {
  return edit.base.schedule === null || Object.keys(scheduleChanges(edit)).length > 0;
}

export type ScheduleSave =
  | { kind: 'create'; body: Omit<ScheduleCreateRequest, 'id'> & Required<Pick<ScheduleCreateRequest, 'time_limit_min' | 'active'>> }
  | { kind: 'update'; id: string; body: ScheduleUpdateRequest };

/**
 * What the save sends; throws ScheduleEditError if the draft cannot be saved or nothing changed. A new schedule is
 * named after its route (the design asks no name) and carries its time limit explicitly, so the phone has it before
 * the server's response.
 */
export function scheduleSave(edit: ScheduleEdit): ScheduleSave {
  const error = scheduleDraftError(edit.draft);
  if (error !== null) throw new ScheduleEditError(error);
  const { draft, base } = edit;
  if (base.schedule === null) {
    return {
      kind: 'create',
      body: {
        route_id: base.route.id,
        name: base.route.name,
        weekdays: draft.weekdays,
        mode: draft.mode,
        ...modeFields(draft),
        time_limit_min: draft.time_limit_min,
        active: draft.active,
      },
    };
  }
  const body = scheduleChanges(edit);
  if (Object.keys(body).length === 0) throw new ScheduleEditError('unchanged');
  return { kind: 'update', id: base.schedule.id, body };
}
