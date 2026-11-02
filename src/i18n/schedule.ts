// Schedules in words, for the shift start (G2) and the supervisor screens (S3): the days, the times, how often.
import type { ScheduleRules } from '@/domain/schedule';

import { t, type TranslationKey } from './index';

/** "óránként", "2 óránként", "30 percenként"; a list schedule by its number of times. */
export function scheduleCadence(schedule: ScheduleRules): string {
  if (schedule.mode === 'list') return t('shiftStart.timesCount', { count: schedule.start_times?.length ?? 0 });
  const every = schedule.interval_every_min ?? 0;
  if (every === 60) return t('shiftStart.everyHour');
  if (every > 0 && every % 60 === 0) return t('shiftStart.everyHours', { hours: every / 60 });
  return t('shiftStart.everyMinutes', { minutes: every });
}

const DAY_KEYS = [
  'schedule.dayShort.mon',
  'schedule.dayShort.tue',
  'schedule.dayShort.wed',
  'schedule.dayShort.thu',
  'schedule.dayShort.fri',
  'schedule.dayShort.sat',
  'schedule.dayShort.sun',
] as const satisfies readonly TranslationKey[];

/**
 * The days of a weekdays mask (Monday = 1 … Sunday = 64): "Minden nap", a run of three or more as "H–P", otherwise
 * the days one by one ("H, Sze, P"); "Egy nap sem" for none.
 */
export function weekdaysText(mask: number): string {
  const days = DAY_KEYS.map((_, day) => (mask & (1 << day)) !== 0);
  if (days.every(Boolean)) return t('schedule.everyDay');
  if (!days.some(Boolean)) return t('schedule.noDay');
  const parts: string[] = [];
  for (let day = 0; day < 7; day += 1) {
    if (!days[day]) continue;
    let last = day;
    while (last + 1 < 7 && days[last + 1]) last += 1;
    if (last - day >= 2) parts.push(`${t(DAY_KEYS[day]!)}–${t(DAY_KEYS[last]!)}`);
    else for (let d = day; d <= last; d += 1) parts.push(t(DAY_KEYS[d]!));
    day = last;
  }
  return parts.join(', ');
}

/** List schedules show their times up to this many, then only their number. */
const LISTED_TIMES = 3;

/**
 * A schedule in one line (DESIGN_HANDOFF S3): "H–P · 20:00–08:00 óránként · 25 perc"; a list schedule with its times
 * ("21:00, 23:00, 01:00") or their number; "nincs időkorlát" without a time limit.
 */
export function scheduleSummary(schedule: ScheduleRules & { time_limit_min: number | null }): string {
  const times =
    schedule.mode === 'interval'
      ? `${schedule.interval_from ?? ''}–${schedule.interval_to ?? ''} ${scheduleCadence(schedule)}`
      : (schedule.start_times ?? []).length <= LISTED_TIMES
        ? (schedule.start_times ?? []).join(', ')
        : scheduleCadence(schedule);
  const limit = schedule.time_limit_min === null ? t('schedule.noLimitShort') : t('shiftStart.limit', { minutes: schedule.time_limit_min });
  return [weekdaysText(schedule.weekdays), times, limit].join(' · ');
}
