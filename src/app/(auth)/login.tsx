import { InfoBanner } from '@/components/info-banner';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { t } from '@/i18n';
import { useSyncStatus } from '@/sync/status';

// Supervisor login (S1): M5-06.
export default function LoginScreen() {
  const replaced = useSyncStatus((state) => state.replaced);
  return (
    <PlaceholderScreen
      title={t('supervisor.loginTitle')}
      notice={replaced ? <InfoBanner variant="warn" text={t('sync.replaced')} /> : undefined}
    />
  );
}
