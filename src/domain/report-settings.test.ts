import {
  alertOptions,
  hasReportSettingsChanges,
  reportSettingsChanges,
  retentionDays,
  setAlertAfter,
  setReport,
  type ReportSettings,
} from './report-settings';

test('the retention: max(31, 2 × the longest period), 62 days with a monthly report', () => {
  expect(retentionDays([])).toBe(31);
  expect(retentionDays(['shift', 'daily', 'weekly'])).toBe(31);
  expect(retentionDays(['weekly', 'monthly'])).toBe(62);
});

test('the alert choices keep a value set on the web', () => {
  expect(alertOptions(120)).toEqual([30, 60, 120, 180, 240, 360, 480, 720, 1440]);
  expect(alertOptions(90)).toEqual([30, 60, 90, 120, 180, 240, 360, 480, 720, 1440]);
});

const saved: ReportSettings = { frequencies: ['shift', 'weekly'], alert_after_min: 120 };

test('a report on or off, in the screen’s order', () => {
  expect(setReport(saved, 'daily', true).frequencies).toEqual(['shift', 'daily', 'weekly']);
  expect(setReport(saved, 'shift', true).frequencies).toEqual(['shift', 'weekly']);
  expect(setReport(saved, 'shift', false).frequencies).toEqual(['weekly']);
});

test('the alert within the site’s limits', () => {
  expect(setAlertAfter(saved, 1440).alert_after_min).toBe(1440);
  expect(() => setAlertAfter(saved, 0)).toThrow(RangeError);
  expect(() => setAlertAfter(saved, 1441)).toThrow(RangeError);
  expect(() => setAlertAfter(saved, 1.5)).toThrow(RangeError);
});

test('the changes of a draft; turned off and on again is no change', () => {
  const draft = setAlertAfter(setReport(setReport(saved, 'shift', false), 'monthly', true), 60);
  expect(reportSettingsChanges(saved, draft)).toEqual({ subscribe: ['monthly'], unsubscribe: ['shift'], alert_after_min: 60 });
  const back = setReport(setReport(saved, 'shift', false), 'shift', true);
  const none = reportSettingsChanges(saved, back);
  expect(none).toEqual({ subscribe: [], unsubscribe: [], alert_after_min: null });
  expect(hasReportSettingsChanges(none)).toBe(false);
});
