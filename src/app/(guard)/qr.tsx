import { useLocalSearchParams } from 'expo-router';

import { t } from '@/i18n';
import { useScanRecorder } from '@/hooks/use-scan-recorder';
import { QrReaderScreen } from '@/qr/qr-reader-screen';

// The QR reader over the round's screen (specification, Mobilapp / NFC és QR: a full-screen camera view; only
// waypost:cp: codes count). A code is recorded like a tag, and this screen gives way to its result.
export default function QrScreen() {
  const { round_id = '' } = useLocalSearchParams<{ round_id: string }>();
  const scanner = useScanRecorder('replace', round_id);
  return (
    <QrReaderScreen
      onScan={(qr_payload) => void scanner.record({ method: 'qr', qr_payload })}
      hint={t('qr.hint')}
      busyText={scanner.recording ? t('round.recording') : null}
      message={scanner.failed ? { variant: 'error', text: t('round.recordFailed') } : null}
    />
  );
}
