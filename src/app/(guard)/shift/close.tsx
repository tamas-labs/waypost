import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { t } from '@/i18n';

// Closing the shift (G12): M3-38.
export default function ShiftCloseScreen() {
  return <PlaceholderScreen title={t('shiftEnd.title')} onBack={() => router.back()} />;
}
