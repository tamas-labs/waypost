// The texts of the report settings (S10): the reports with their timing, the alert's delay, the retention.
import { MIN_RETENTION_DAYS, retentionDays, type ReportFrequency } from '@/domain/report-settings';
import { t, type TranslationKey } from '@/i18n';

const REPORT_TEXT: Record<ReportFrequency, { title: TranslationKey; sub: TranslationKey }> = {
  shift: { title: 'reports.shift', sub: 'reports.shiftSub' },
  daily: { title: 'reports.daily', sub: 'reports.dailySub' },
  weekly: { title: 'reports.weekly', sub: 'reports.weeklySub' },
  monthly: { title: 'reports.monthly', sub: 'reports.monthlySub' },
};

/** "Heti összesítő", "Hétfőn 10:00 · HTML e-mail és PDF" (the specification's timing, in the site's time). */
export function reportText(frequency: ReportFrequency): { title: string; sub: string } {
  const { title, sub } = REPORT_TEXT[frequency];
  return { title: t(title), sub: t(sub) };
}

/** "30 perc", "2 óra", "1 óra 30 perc". */
export function alertDelayText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return t('reports.minutes', { minutes: rest });
  if (rest === 0) return t('reports.hours', { hours });
  return t('reports.hoursMinutes', { hours, minutes: rest });
}

/** The retention with the reports of everyone on the site: "31 nap", growing with a monthly one, or 62 because of one. */
export function retentionText(frequencies: Iterable<ReportFrequency>): string {
  const days = retentionDays(frequencies);
  return days === MIN_RETENTION_DAYS
    ? t('reports.retention', { days, monthly: retentionDays(['monthly']) })
    : t('reports.retentionMonthly', { days });
}
