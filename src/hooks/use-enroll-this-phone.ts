import { useState } from 'react';

import { createApiClient } from '@/api/client';
import { apiBaseUrl } from '@/api/config';
import { enrollErrorText } from '@/account/enroll-error';
import { enrollThisPhone } from '@/account/supervisor';
import { getDatabase } from '@/db/open';
import { t } from '@/i18n';

/**
 * Enrolls this phone (a supervisor's own) as the site phone of a site (enrollThisPhone). On success the session is the
 * site phone and the navigation leaves for the PIN login; on an error its text is kept for the screen.
 */
export function useEnrollThisPhone(siteId: string): { enroll: () => Promise<void>; busy: boolean; error: string | null } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enroll = async () => {
    const db = getDatabase();
    const baseUrl = apiBaseUrl(db);
    if (baseUrl === null) {
      setError(t('supervisor.enrollErrors.noServer'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await enrollThisPhone(db, createApiClient({ baseUrl }), siteId);
      // The screen closes: the session is the site phone now.
    } catch (e) {
      setError(enrollErrorText(e));
      setBusy(false);
    }
  };
  return { enroll, busy, error };
}
