import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { t } from '@/i18n';

// Recording an incident (G11): M3-37.
export default function NewIncidentScreen() {
  return <PlaceholderScreen title={t('incident.title')} onBack={() => router.back()} />;
}
