import { t, type TranslationKey } from '@/i18n';
import hu from '@/i18n/hu.json';

function leaves(node: object, prefix = ''): [string, unknown][] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? leaves(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value] as [string, unknown]],
  );
}

test('returns the text of a key', () => {
  expect(t('app.name')).toBe('Waypost');
  expect(t('common.back')).toBe('Vissza');
});

test('replaces every placeholder', () => {
  expect(t('sync.offlineQueued', { count: 3 })).toBe('Offline · 3 vár');
  expect(t('pin.enteredOf', { n: 2, total: 6 })).toBe('2 számjegy megadva a 6-ból');
});

test('throws for a missing parameter and an unknown key', () => {
  expect(() => t('sync.offlineQueued')).toThrow('Missing parameter "count" for text sync.offlineQueued');
  expect(() => t('nope.nothing' as TranslationKey)).toThrow('Unknown text key: nope.nothing');
  expect(() => t('sync' as TranslationKey)).toThrow('Unknown text key: sync');
});

test('every text is a non-empty string with well-formed {{placeholders}} only', () => {
  const all = leaves(hu);
  expect(all.length).toBeGreaterThan(200);
  // A stray brace would be shown to the user as it is.
  const bad = all.filter(([, value]) => typeof value !== 'string' || value.trim() === '' || /[{}]/.test(value.replace(/\{\{\w+\}\}/g, '')));
  expect(bad).toEqual([]);
});
