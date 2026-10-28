import type { Database } from '@/db/database';
import { getKv } from '@/db/kv';

/**
 * Base URL of the API, prefix included (e.g. https://example.com/api/waypost/v1): EXPO_PUBLIC_WAYPOST_API_URL at
 * build time; in development builds the URL entered on the developer enrollment screen overrides it. Null if neither.
 */
export function apiBaseUrl(db: Database): string | null {
  const override = __DEV__ ? getKv(db, 'dev.api_base_url') : null;
  return override ?? (process.env.EXPO_PUBLIC_WAYPOST_API_URL || null);
}
