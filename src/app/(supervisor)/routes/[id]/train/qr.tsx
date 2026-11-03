import { useLocalSearchParams } from 'expo-router';

import { useTrainingReader } from '@/hooks/use-training';
import { t } from '@/i18n';
import { QrReaderScreen } from '@/qr/qr-reader-screen';

// The QR reader of the training (S5): a code of a checkpoint on the site goes on to the point screen in its place; a QR
// code never makes a new checkpoint (decisions: "Betanítás – domain").
export default function TrainingQrScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const reader = useTrainingReader(id, 'replace');
  return (
    <QrReaderScreen
      onScan={(qr_payload) => void reader.handle({ method: 'qr', qr_payload })}
      hint={t('training.qrHint')}
      busyText={reader.locating ? t('training.locating') : null}
      message={reader.message}
    />
  );
}
