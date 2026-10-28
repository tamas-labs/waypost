import { testAlarmTimes } from './test-schedule';

/** Local HH:MM of each time. */
function hhmm(times: Date[]): string[] {
  return times.map((time) => `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`);
}

test('12 notifications on whole quarter-hours over 3 hours', () => {
  const times = testAlarmTimes(new Date(2026, 9, 28, 21, 52, 30));
  expect(times).toHaveLength(12);
  expect(hhmm(times)).toEqual(['22:00', '22:15', '22:30', '22:45', '23:00', '23:15', '23:30', '23:45', '00:00', '00:15', '00:30', '00:45']);
  expect(times.every((time) => time.getSeconds() === 0 && time.getMilliseconds() === 0)).toBe(true);
});

test('the first one is at least a minute ahead', () => {
  expect(hhmm(testAlarmTimes(new Date(2026, 9, 28, 21, 59, 30))).slice(0, 2)).toEqual(['22:15', '22:30']);
  expect(hhmm(testAlarmTimes(new Date(2026, 9, 28, 21, 59, 0))).slice(0, 2)).toEqual(['22:00', '22:15']);
  expect(hhmm(testAlarmTimes(new Date(2026, 9, 28, 22, 0, 0))).slice(0, 2)).toEqual(['22:15', '22:30']);
});

test('other step and length', () => {
  const times = testAlarmTimes(new Date(2026, 9, 28, 10, 1, 0), { everyMin: 5, hours: 1 });
  expect(times).toHaveLength(12);
  expect(hhmm(times).slice(0, 3)).toEqual(['10:05', '10:10', '10:15']);
});
