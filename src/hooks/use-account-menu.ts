import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { createApiClient } from '@/api/client';
import { apiBaseUrl } from '@/api/config';
import { logOut, useSession } from '@/auth/session';
import { signOutSupervisor, unsentSupervisorActions } from '@/auth/supervisor';
import { showToast } from '@/components/toast';
import type { SupervisorAccount } from '@/db/kv';
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

/**
 * The account button's menu (S2): who is logged in, the device setup (M5-10), and the way out – on the supervisor's own
 * phone the logout, on the site phone back to the PIN login (an open shift stays open). Returns the function that opens
 * it, and whether a logout runs. Three buttons at most: Android shows no more in a dialog.
 */
export function useAccountMenu(account: SupervisorAccount | null): [() => void, boolean] {
  const mode = useSession((state) => state.mode);
  const [logout, busy] = useSupervisorLogout();
  const open = () => {
    if (busy) return;
    const title = account?.name ?? t('supervisor.accountUnknown');
    const setup = { text: t('deviceSetup.title'), onPress: () => router.push('/device-setup') };
    if (mode === 'site_phone') {
      Alert.alert(title, t('supervisor.accountSitePhone'), [
        { text: t('common.cancel'), style: 'cancel' },
        setup,
        { text: t('supervisor.exit'), onPress: logOut },
      ]);
      return;
    }
    Alert.alert(title, account?.email ?? undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      setup,
      { text: t('supervisor.logout'), style: 'destructive', onPress: logout },
    ]);
  };
  return [open, busy];
}
