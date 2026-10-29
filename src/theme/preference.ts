import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';

import type { ThemePreference } from './theme-provider';

const PREFERENCES: readonly ThemePreference[] = ['system', 'dark', 'light'];

/** The stored manual theme choice; 'system' if none was made (or the stored value is not a known choice). */
export function loadThemePreference(db: Database): ThemePreference {
  const stored = getKv(db, 'ui.theme_preference');
  return stored !== null && PREFERENCES.includes(stored) ? stored : 'system';
}

export function saveThemePreference(db: Database, preference: ThemePreference): void {
  setKv(db, 'ui.theme_preference', preference);
}
