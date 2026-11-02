import { logOut, useSession } from '@/auth/session';
import { Button } from '@/components/button';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { t } from '@/i18n';

// Sites (S2): M5-07. Until then the way out of the supervisor mode is here: on the site phone back to the PIN login.
export default function SitesScreen() {
  const mode = useSession((state) => state.mode);
  const actions = mode === 'site_phone' ? <Button label={t('supervisor.exit')} variant="secondary" onPress={logOut} /> : undefined;
  return <PlaceholderScreen title={t('supervisor.sites')} actions={actions} />;
}
