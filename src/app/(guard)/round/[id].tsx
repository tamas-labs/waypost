import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { t } from '@/i18n';

// The round in progress (G5): M3-33.
export default function RoundScreen() {
  return <PlaceholderScreen title={t('round.screenTitle')} onBack={() => router.back()} />;
}
