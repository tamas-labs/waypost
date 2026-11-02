import { useState } from 'react';
import { Alert } from 'react-native';

import { createApiClient } from '@/api/client';
import { apiBaseUrl } from '@/api/config';
import { logOut, useSession } from '@/auth/session';
import { signOutSupervisor, unsentSupervisorActions } from '@/auth/supervisor';
import { Button } from '@/components/button';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { showToast } from '@/components/toast';
import { getDatabase } from '@/db/open';
import { t } from '@/i18n';

/** Logs the supervisor out of their own phone; asks first if actions would be lost. */
function useSupervisorLogout(): [() => void, boolean] {
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try {
      const db = getDatabase();
      const baseUrl = apiBaseUrl(db);
      await signOutSupervisor(db, baseUrl === null ? null : createApiClient({ baseUrl }));
    } catch (error) {
      showToast(t('supervisor.logoutFailed', { message: error instanceof Error ? error.message : String(error) }), 'warn');
      setBusy(false);
    }
  };
  const logout = () => {
    const unsent = unsentSupervisorActions(getDatabase());
    if (unsent === 0) {
      void signOut();
      return;
    }
    Alert.alert(t('supervisor.logoutUnsentTitle'), t('supervisor.logoutUnsent', { count: unsent }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('supervisor.logout'), style: 'destructive', onPress: () => void signOut() },
    ]);
  };
  return [logout, busy];
}

// Sites (S2): M5-07. Until then the way out is here: on the site phone back to the PIN login, on the supervisor's own
// phone the logout.
export default function SitesScreen() {
  const mode = useSession((state) => state.mode);
  const [logout, loggingOut] = useSupervisorLogout();
  const actions =
    mode === 'site_phone' ? (
      <Button label={t('supervisor.exit')} variant="secondary" onPress={logOut} />
    ) : (
      <Button label={t('supervisor.logout')} variant="secondary" onPress={logout} disabled={loggingOut} />
    );
  return <PlaceholderScreen title={t('supervisor.sites')} actions={actions} />;
}
