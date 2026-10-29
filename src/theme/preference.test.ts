import { setKv } from '@/db/kv';
import { createTestDatabase } from '@/db/testing';

import { loadThemePreference, saveThemePreference } from './preference';

test('follows the system until a choice is saved, then gives the saved choice', async () => {
  const { db } = await createTestDatabase();
  expect(loadThemePreference(db)).toBe('system');
  saveThemePreference(db, 'light');
  expect(loadThemePreference(db)).toBe('light');
  saveThemePreference(db, 'system');
  expect(loadThemePreference(db)).toBe('system');
});

test('an unknown stored value counts as no choice', async () => {
  const { db } = await createTestDatabase();
  setKv(db, 'ui.theme_preference', 'sepia' as never);
  expect(loadThemePreference(db)).toBe('system');
});
