import { alertDelayText, reportText, retentionText } from './report-settings-view';

test('the reports with the specification’s timing', () => {
  expect(reportText('shift')).toEqual({ title: 'Műszakjelentés', sub: 'A műszak zárása után · HTML e-mail' });
  expect(reportText('monthly').sub).toBe('A hónap 1. napján 10:00 · HTML e-mail és PDF');
});

test('the alert’s delay', () => {
  expect(alertDelayText(30)).toBe('30 perc');
  expect(alertDelayText(120)).toBe('2 óra');
  expect(alertDelayText(90)).toBe('1 óra 30 perc');
});

test('the retention', () => {
  expect(retentionText(['shift', 'weekly'])).toMatch(/^Nyers adatok megőrzése: 31 nap\. Havi jelentésnél 62 napra nő\./);
  expect(retentionText(['monthly'])).toMatch(/^Nyers adatok megőrzése: 62 nap, mert a telephelyről havi jelentés is megy\./);
});
