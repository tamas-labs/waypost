import { t } from '@/i18n';
import { palette, statusStyle, syncStyle, theme } from '@/theme/tokens';

test('the light palette has exactly the keys of the dark one', () => {
  expect(Object.keys(palette.light).sort()).toEqual(Object.keys(palette.dark).sort());
});

test('theme() returns the named palette with the shared scales', () => {
  expect(theme('dark').color.bg).toBe(palette.dark.bg);
  expect(theme('light').color.bg).toBe(palette.light.bg);
  expect(theme('light').size.touchMin).toBe(48);
});

test('every status and sync label is a text in hu.json', () => {
  for (const style of Object.values(statusStyle)) expect(t(style.label)).not.toBe('');
  expect(t(syncStyle.synced.label)).toBe('Szinkronizálva');
  expect(t(syncStyle.offline.label)).toBe('Offline');
  expect(t(syncStyle.offline.labelQueued, { count: 2 })).toBe('Offline · 2 vár');
  expect(t(syncStyle.uploading.label, { count: 5 })).toBe('Feltöltés… 5');
});
