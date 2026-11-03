// The report settings of a site (S10; specification, Jelentések, figyelmeztetések és adatmegőrzés): which reports the
// supervisor gets, after how long without data the site's supervisors are alerted, and how long the server keeps the
// raw data – the retention follows the longest report anyone subscribed to on the site.
import type { ReportSubscription } from '@waypost/schema';

export type ReportFrequency = ReportSubscription['frequency'];

/** The order of the screen and of the summaries. */
export const REPORT_FREQUENCIES: readonly ReportFrequency[] = ['shift', 'daily', 'weekly', 'monthly'];

/** The period of a report in days (specification, Adatmegőrzés). */
const PERIOD_DAYS: Record<ReportFrequency, number> = { shift: 1, daily: 1, weekly: 7, monthly: 31 };
/** The shortest retention. */
export const MIN_RETENTION_DAYS = 31;

/** max(31, 2 × the longest subscribed period): 62 days with a monthly report, 31 otherwise. */
export function retentionDays(frequencies: Iterable<ReportFrequency>): number {
  let longest = 0;
  for (const frequency of frequencies) longest = Math.max(longest, PERIOD_DAYS[frequency]);
  return Math.max(MIN_RETENTION_DAYS, 2 * longest);
}

/** The limits of site.no_data_alert_after_min (entities/site.json). */
export const ALERT_MIN = 1;
export const ALERT_MAX = 1440;
/** The choices of the screen, in minutes. */
export const ALERT_OPTIONS: readonly number[] = [30, 60, 120, 180, 240, 360, 480, 720, 1440];

/** The choices, with a value set on the web among them. */
export function alertOptions(current: number): number[] {
  return ALERT_OPTIONS.includes(current) ? [...ALERT_OPTIONS] : [...ALERT_OPTIONS, current].sort((a, b) => a - b);
}

export interface ReportSettings {
  /** In the order of REPORT_FREQUENCIES. */
  frequencies: ReportFrequency[];
  alert_after_min: number;
}

/** The frequencies in the screen's order, each once. */
export function orderedFrequencies(frequencies: Iterable<ReportFrequency>): ReportFrequency[] {
  const set = new Set(frequencies);
  return REPORT_FREQUENCIES.filter((frequency) => set.has(frequency));
}

/** A report on or off. */
export function setReport(settings: ReportSettings, frequency: ReportFrequency, on: boolean): ReportSettings {
  const others = settings.frequencies.filter((other) => other !== frequency);
  return { ...settings, frequencies: orderedFrequencies(on ? [...others, frequency] : others) };
}

export function setAlertAfter(settings: ReportSettings, minutes: number): ReportSettings {
  if (!Number.isInteger(minutes) || minutes < ALERT_MIN || minutes > ALERT_MAX) throw new RangeError(`Alert after ${minutes} min`);
  return { ...settings, alert_after_min: minutes };
}

export interface ReportSettingsChanges {
  subscribe: ReportFrequency[];
  unsubscribe: ReportFrequency[];
  /** null: unchanged. */
  alert_after_min: number | null;
}

/** What the save changes; nothing: empty lists and null. */
export function reportSettingsChanges(saved: ReportSettings, draft: ReportSettings): ReportSettingsChanges {
  return {
    subscribe: draft.frequencies.filter((frequency) => !saved.frequencies.includes(frequency)),
    unsubscribe: saved.frequencies.filter((frequency) => !draft.frequencies.includes(frequency)),
    alert_after_min: draft.alert_after_min === saved.alert_after_min ? null : draft.alert_after_min,
  };
}

export const hasReportSettingsChanges = (changes: ReportSettingsChanges) =>
  changes.subscribe.length > 0 || changes.unsubscribe.length > 0 || changes.alert_after_min !== null;
