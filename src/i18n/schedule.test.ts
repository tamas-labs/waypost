import { scheduleCadence, scheduleSummary, weekdaysText } from './schedule';

const MON = 1;
const TUE = 2;
const WED = 4;
const THU = 8;
const FRI = 16;
const SAT = 32;
const SUN = 64;

describe('weekdaysText', () => {
  it.each([
    [127, 'Minden nap'],
    [0, 'Egy nap sem'],
    [MON | TUE | WED | THU | FRI, 'H–P'],
    [MON | WED | FRI, 'H, Sze, P'],
    [SAT | SUN, 'Szo, V'],
    [MON | TUE | THU | FRI | SAT | SUN, 'H, K, Cs–V'],
  ])('%i → %s', (mask, text) => {
    expect(weekdaysText(mask)).toBe(text);
  });
});

const interval = { mode: 'interval' as const, start_times: null, interval_from: '20:00', interval_to: '08:00' };
const list = (start_times: string[]) => ({
  mode: 'list' as const,
  start_times,
  interval_from: null,
  interval_to: null,
  interval_every_min: null,
});

describe('scheduleCadence', () => {
  it.each([
    [60, 'óránként'],
    [120, '2 óránként'],
    [30, '30 percenként'],
  ])('every %i minutes → %s', (every, text) => {
    expect(scheduleCadence({ ...interval, weekdays: 127, interval_every_min: every })).toBe(text);
  });

  it('counts the times of a list', () => {
    expect(scheduleCadence({ ...list(['21:00', '23:00']), weekdays: 127 })).toBe('2 időpont');
  });
});

describe('scheduleSummary', () => {
  it('describes an interval schedule as the design does', () => {
    expect(scheduleSummary({ ...interval, weekdays: MON | TUE | WED | THU | FRI, interval_every_min: 60, time_limit_min: 25 })).toBe(
      'H–P · 20:00–08:00 óránként · 25 perc',
    );
  });

  it('lists a few times, counts more, and tells when there is no time limit', () => {
    expect(scheduleSummary({ ...list(['21:00', '23:00', '01:00']), weekdays: 127, time_limit_min: null })).toBe(
      'Minden nap · 21:00, 23:00, 01:00 · nincs időkorlát',
    );
    expect(scheduleSummary({ ...list(['20:00', '22:00', '00:00', '02:00']), weekdays: SAT | SUN, time_limit_min: 30 })).toBe(
      'Szo, V · 4 időpont · 30 perc',
    );
  });
});
