// The report settings of a site while their screen is open (S10): the saved state from the database and the draft made
// from it. An untouched draft follows the database (a pull); a touched one is kept and saved against the latest.
import { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useSession } from '@/auth/session';
import { getDatabase } from '@/db/open';
import { hasReportSettingsChanges, reportSettingsChanges, type ReportSettings } from '@/domain/report-settings';
import { loadReportSettings, saveReportSettings, type ReportSettingsBase } from '@/supervisor/report-settings';
import { supervisorAccount } from '@/supervisor/sites';

import { useLiveQuery } from './use-live-query';

export interface ReportSettingsState {
  /** null: the site is not on the phone (or no supervisor uses it). */
  base: ReportSettingsBase | null;
  /** Whom the e-mails go to: the e-mail address on a supervisor's own phone, the name on the site phone. */
  recipient: string | null;
  draft: ReportSettings | null;
  changed: boolean;
  change: (next: ReportSettings) => void;
  save: () => void;
}

export function useReportSettings(siteId: string): ReportSettingsState {
  const session = useSession(useShallow(({ mode, activeUser }) => ({ mode, activeUser })));
  const load = useCallback(() => {
    const db = getDatabase();
    const account = supervisorAccount(db, session);
    return {
      base: account === null ? null : loadReportSettings(db, siteId, account.id),
      recipient: account === null ? null : (account.email ?? account.name),
    };
  }, [siteId, session]);
  const { base, recipient } = useLiveQuery(load);
  const [draft, setDraft] = useState(() => base?.saved ?? null);
  const [touched, setTouched] = useState(false);
  const key = JSON.stringify(base);
  const [loaded, setLoaded] = useState(key);
  if (key !== loaded) {
    setLoaded(key);
    if (base === null) setDraft(null);
    else if (!touched || draft === null) setDraft(base.saved);
  }

  const change = useCallback((next: ReportSettings) => {
    setTouched(true);
    setDraft(next);
  }, []);

  const save = useCallback(() => {
    if (base === null || draft === null) throw new Error('No site to save the report settings of');
    saveReportSettings(getDatabase(), base, draft);
    setTouched(false);
  }, [base, draft]);

  const changed = base !== null && draft !== null && hasReportSettingsChanges(reportSettingsChanges(base.saved, draft));
  return { base, recipient, draft, changed, change, save };
}
