import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { t } from '@/i18n';

// The manual entry (G10), with the round in round_id: M3-36.
export default function ManualEntryScreen() {
  return <PlaceholderScreen title={t('manual.screenTitle')} onBack={() => router.back()} />;
}
