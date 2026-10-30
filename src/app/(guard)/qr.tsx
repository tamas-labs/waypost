import { useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { IconButton } from '@/components/icon-button';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { t } from '@/i18n';
import { useScanRecorder } from '@/navigation/use-scan-recorder';
import { QrScanner } from '@/qr/qr-scanner';
import { useTheme } from '@/theme/theme-provider';

/** Share of the shorter screen side taken by the viewfinder frame. */
const VIEWFINDER_SHARE = 0.7;

// The QR reader over the round's screen (specification, Mobilapp / NFC és QR: a full-screen camera view; only
// waypost:cp: codes count). A code is recorded like a tag, and this screen gives way to its result.
export default function QrScreen() {
  const { color, typography, space, radius, border } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const scanner = useScanRecorder('replace');

  if (permission === null || !permission.granted) {
    // Asked again only while the system allows it; after a final refusal only the settings can grant it.
    const canAsk = permission?.canAskAgain ?? true;
    return (
      <View style={[styles.screen, { backgroundColor: color.bg }]}>
        <ScreenHeader title={t('qr.title')} onBack={() => router.back()} />
        {permission !== null && (
          <View style={{ padding: space.l, gap: space.l }}>
            <InfoBanner variant="warn" text={t(canAsk ? 'qr.permissionNeeded' : 'qr.permissionDenied')} />
            <Button label={t(canAsk ? 'qr.allow' : 'qr.openSettings')} onPress={() => void (canAsk ? requestPermission() : Linking.openSettings())} />
          </View>
        )}
      </View>
    );
  }

  const viewfinder = Math.round(Math.min(width, height) * VIEWFINDER_SHARE);
  const problem = scanner.failed ? t('round.recordFailed') : cameraFailed ? t('qr.cameraFailed') : null;
  return (
    <View style={[styles.screen, { backgroundColor: color.bg }]}>
      <QrScanner style={StyleSheet.absoluteFill} torch={torch} onScan={(qr_payload) => void scanner.record({ method: 'qr', qr_payload })} onError={() => setCameraFailed(true)} />

      <View style={[styles.top, { paddingTop: insets.top + space.s, paddingHorizontal: space.l }]}>
        <IconButton icon="back" accessibilityLabel={t('common.back')} onPress={() => router.back()} />
        <Button variant="secondary" label={t(torch ? 'qr.torchOn' : 'qr.torchOff')} onPress={() => setTorch((on) => !on)} />
      </View>

      <View pointerEvents="none" style={[styles.screen, styles.centre]}>
        <View style={{ width: viewfinder, height: viewfinder, borderWidth: border.thick, borderColor: color.accent, borderRadius: radius.card }} />
      </View>

      <View style={{ padding: space.l, paddingBottom: insets.bottom + space.l }}>
        {problem !== null ? (
          <InfoBanner variant="error" text={problem} />
        ) : (
          <View style={{ padding: space.m, borderRadius: radius.item, backgroundColor: color.surface }}>
            <Text style={[typography.bodyRegular, styles.text, { color: color.text }]}>{scanner.recording ? t('round.recording') : t('qr.hint')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center' },
});
