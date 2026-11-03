// The texts of the schedule screen (S8): the rounds of a day, the time limit's label and explanation, and what a rule
// of the editing that cannot be applied tells the supervisor.
import { ScheduleEditError, draftRounds, suggestedTimeLimit, type ScheduleDraft, type ScheduleEdit } from '@/domain/schedule-edit';
import { t } from '@/i18n';

import { formatWalk } from './site-detail';

/** "13 kör éjszakánként · utolsó 08:00-kor"; within a day "5 kör naponta …"; null while the times are not complete. */
export function roundsSummary(draft: ScheduleDraft): string | null {
  const rounds = draftRounds(draft);
  if (rounds === null) return null;
  return t(rounds.overnight ? 'schedule.summary' : 'schedule.summaryDay', { count: rounds.count, time: rounds.last });
}

/** Whether the time limit is the suggested one (M3-14). */
export const isSuggestedLimit = (edit: ScheduleEdit) => edit.draft.time_limit_min === suggestedTimeLimit(edit.base);

/** "Mért bejárás 16:20 × 1,5 = 24:30 → 5 percre kerekítve."; unmeasured: "Nincs mérés – alapérték 20 perc." */
export function limitExplanation(edit: ScheduleEdit): string {
  const walk = edit.base.walk_duration_s;
  if (walk === null) return t('schedule.noMeasure');
  return t('schedule.explain', { walk: formatWalk(walk), raw: formatWalk(Math.round(walk * 1.5)) });
}

/** "60 perc": a frequency of a repeating window. */
export const everyText = (minutes: number) => t('scheduleEdit.minutes', { minutes });

/** What the screen says when the save cannot go on. */
export function scheduleEditErrorText(error: unknown): string {
  if (!(error instanceof ScheduleEditError))
    return t('scheduleEdit.errors.failed', { message: error instanceof Error ? error.message : String(error) });
  switch (error.code) {
    case 'no_days':
      return t('scheduleEdit.errors.noDays');
    case 'no_times':
      return t('scheduleEdit.errors.noTimes');
    case 'same_from_to':
      return t('scheduleEdit.errors.sameFromTo');
    case 'duplicate_time':
      return t('scheduleEdit.errors.duplicateTime');
    case 'unchanged':
      return t('scheduleEdit.errors.unchanged');
  }
}
