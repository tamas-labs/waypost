import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { Button } from '@/components/button';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { getDatabase } from '@/db/open';
import { useLiveQuery } from '@/hooks/use-live-query';
import { t } from '@/i18n';
import { qrDrawing } from '@/qr/code';
import { printQrLabel, shareQrLabel, type QrLabel } from '@/qr/label';
import { loadCheckpointLabel, type CheckpointLabel } from '@/supervisor/checkpoint-label';
import { useTheme } from '@/theme/theme-provider';

/** The code on the screen at most this wide: larger only makes it harder to hold a phone to. */
const CODE_MAX = 360;

// The QR label of a checkpoint (specification: (supervisor)/checkpoints/[id]/qr): the point's code large, to print
// ("Nyomtatás", the system's print dialog) or to share as a PDF ("Megosztás"), and to scan from the screen. An NFC
// point has one too, as a spare if its tag cannot be read. Until the server has given the point its code (a point just
// trained on this phone), the screen says so and waits for the sync.
export default function CheckpointQrScreen() {
  const { color, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const point = useLiveQuery(useCallback(() => loadCheckpointLabel(getDatabase(), id), [id]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (point === null) {
    return (
      <View style={[styles.grow, { backgroundColor: color.bg }]}>
        <ScreenHeader title={t('qrLabel.title')} onBack={() => router.back()} />
        <View style={{ padding: space.l }}>
          <InfoBanner variant="warn" text={t('qrLabel.missing')} />
        </View>
      </View>
    );
  }

  const label: QrLabel | null = point.qr_payload === null ? null : { name: point.name, site: point.site_name, payload: point.qr_payload };
  const run = (output: (label: QrLabel) => Promise<void>) => {
    if (label === null || busy) return;
    setBusy(true);
    setError(null);
    output(label)
      .catch((e: unknown) => setError(t('qrLabel.failed', { message: e instanceof Error ? e.message : String(e) })))
      .finally(() => setBusy(false));
  };

  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader
        title={point.name}
        subtitle={point.site_name === null ? t('qrLabel.title') : `${t('qrLabel.title')} · ${point.site_name}`}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.l }}>
        {label === null ? (
          <InfoBanner variant="offline" text={t('qrLabel.pending')} />
        ) : (
          <>
            <QrCodeView payload={label.payload} name={point.name} />
            <InfoBanner variant="info" text={purposeText(point)} />
          </>
        )}
        {!point.active && <InfoBanner variant="warn" text={t('qrLabel.inactive')} />}
        {error !== null && (
          <View accessibilityLiveRegion="polite" accessibilityRole="alert">
            <InfoBanner variant="error" text={error} />
          </View>
        )}
        <Button icon="printer" label={t('qrLabel.print')} disabled={label === null || busy} onPress={() => run(printQrLabel)} />
        <Button
          variant="secondary"
          icon="share"
          label={t('qrLabel.share')}
          disabled={label === null || busy}
          onPress={() => run(shareQrLabel)}
        />
      </ScrollView>
    </View>
  );
}

const purposeText = (point: CheckpointLabel) => t(point.tag_type === 'qr' ? 'qrLabel.purposeQr' : 'qrLabel.purposeNfc');

/** The code itself, dark on light in both themes (qrInk, qrPaper), with its quiet zone. */
function QrCodeView({ payload, name }: { payload: string; name: string }) {
  const { color, space, radius } = useTheme();
  const { width } = useWindowDimensions();
  const drawing = useMemo(() => qrDrawing(payload), [payload]);
  // A whole number of points per module: no seams between the rows of modules.
  const side = Math.floor(Math.min(width - 2 * space.l, CODE_MAX) / drawing.size) * drawing.size;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('qrLabel.code', { name })}
      testID="qr-code"
      style={[styles.code, { width: side, height: side, borderRadius: radius.item, backgroundColor: color.qrPaper }]}
    >
      <Svg width={side} height={side} viewBox={`0 0 ${drawing.size} ${drawing.size}`}>
        <Rect width={drawing.size} height={drawing.size} fill={color.qrPaper} />
        <Path d={drawing.path} fill={color.qrInk} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  code: { alignSelf: 'center', overflow: 'hidden' },
});
