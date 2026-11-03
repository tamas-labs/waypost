import { conflictText, guardLine, ownPinLine, shiftTime } from './guards-view';

const TZ = 'Europe/Budapest';
const NOW = Date.parse('2026-10-28T09:00:00.000Z');
const guard = { id: 'g', name: 'Nagy Péter', active: true, pin: 'unknown' as const, on_shift: false, last_shift_at: null };

test('the time of a shift: today, yesterday, or the date, in the site’s time zone', () => {
  expect(shiftTime('2026-10-28T06:30:00.000Z', NOW, TZ)).toBe('ma 07:30');
  // 23:30 in Budapest on the 27th is the 27th there, not the 28th.
  expect(shiftTime('2026-10-27T22:30:00.000Z', NOW, TZ)).toBe('tegnap 23:30');
  expect(shiftTime('2026-10-24T18:00:00.000Z', NOW, TZ)).toBe('10. 24. 20:00');
});

test('a guard’s line', () => {
  expect(guardLine(guard, NOW, TZ)).toBe('Beléphet');
  expect(guardLine({ ...guard, pin: 'set', on_shift: true }, NOW, TZ)).toBe('PIN beállítva · most műszakban');
  expect(guardLine({ ...guard, pin: 'none', last_shift_at: '2026-10-27T19:00:00.000Z' }, NOW, TZ)).toBe(
    'Nincs PIN-kód · Utolsó műszak: tegnap 20:00',
  );
  expect(guardLine({ ...guard, active: false, pin: 'set' }, NOW, TZ)).toBe('Felfüggesztve · nem tud belépni');
});

test('the supervisor’s own PIN', () => {
  expect(ownPinLine({ name: 'Kovács Anna', pin: 'set' })).toBe('Kovács Anna · beállítva');
  expect(ownPinLine({ name: 'Kovács Anna', pin: 'none' })).toBe('Kovács Anna · nincs beállítva');
  expect(ownPinLine({ name: 'Kovács Anna', pin: 'unknown' })).toBe('Kovács Anna');
});

test('the refusals', () => {
  const user = { id: 'g', name: 'Nagy Péter' };
  expect(conflictText({ call_id: 'c', kind: 'create', user: null }).title).toBe('Egy új őr nem jött létre');
  expect(conflictText({ call_id: 'c', kind: 'pin', user }).title).toBe('Nagy Péter: a PIN-kód foglalt volt');
  expect(conflictText({ call_id: 'c', kind: 'attach', user: null }).title).toBe('Egy őr: a PIN-kód foglalt volt');
  expect(conflictText({ call_id: 'c', kind: 'attach', user }).text).toMatch(/nem került a telephelyre/);
});
