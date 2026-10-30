import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { t } from '@/i18n';

// The result of a scan (G7–G9), with the outcome in its params (useScanRecorder): M3-35.
export default function ScanResultScreen() {
  return <PlaceholderScreen title={t('scanResult.screenTitle')} onBack={() => router.back()} />;
}
