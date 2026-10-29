import { useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { playFeedback } from '@/feedback/feedback';
import { t } from '@/i18n';
import { parseCheckpointQr } from '@/qr/payload';
import { QrScanner } from '@/qr/qr-scanner';
import { useTheme } from '@/theme/theme-provider';

interface Reading {
  key: number;
  at: Date;
  payload: string;
}

/** The panel under the viewfinder shows the latest reads only. */
const SHOWN_READINGS = 3;

/** Share of the shorter screen side taken by the viewfinder frame. */
const VIEWFINDER_SHARE = 0.7;

/** HH:MM:SS, local time. */
function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// M1-05 device test: a full-screen camera view that reads waypost:cp: codes only, from paper and from a screen.
// It keeps reading, so several codes can be tried one after the other; each read gives the success feedback (M3-22).
export default function QrScreen() {
  const { color, typography, space, radius, size } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [ignored, setIgnored] = useState<{ at: Date; data: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(0);

  const addReading = useCallback((payload: string) => {
    const key = nextKey.current++;
    playFeedback('success');
    setReadings((previous) => [{ key, at: new Date(), payload }, ...previous]);
  }, []);

  const card = { backgroundColor: color.surface, borderColor: color.cardBorder, borderRadius: radius.card, padding: space.l, gap: space.s };
  const pill = { borderRadius: radius.pill, minHeight: size.iconButton, paddingHorizontal: space.l };
  const small = [typography.small, styles.tabular, { color: color.text2 }];

  const backButton = (
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={[styles.button, pill, { backgroundColor: color.surface }]}>
      <Text style={[typography.buttonSm, { color: color.text }]}>{t('common.back')}</Text>
    </Pressable>
  );

  if (permission === null || !permission.granted) {
    // Asked again only while the system allows it; after a final refusal only the settings can grant it.
    const canAsk = permission?.canAskAgain ?? true;
    return (
      <View style={[styles.fill, { backgroundColor: color.bg, padding: space.l, paddingTop: insets.top + space.l, gap: space.l }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.row}>{backButton}</View>
        <View style={[styles.card, card]}>
          <Text style={[typography.title2, { color: color.text }]}>{t('prototype.qr.title')}</Text>
          <Text style={[typography.bodyRegular, { color: color.text2 }]}>
            {permission === null ? t('prototype.qr.checking') : t(canAsk ? 'prototype.qr.permissionNeeded' : 'prototype.qr.permissionDenied')}
          </Text>
        </View>
        {permission !== null && (
          <Pressable
            accessibilityRole="button"
            onPress={() => (canAsk ? requestPermission() : Linking.openSettings()).catch((e: unknown) => setError(String(e)))}
            style={[styles.button, { backgroundColor: color.accent, borderRadius: radius.pill, minHeight: size.buttonHero }]}
          >
            <Text style={[typography.button, { color: color.onAccent }]}>{t(canAsk ? 'prototype.qr.allow' : 'prototype.qr.openSettings')}</Text>
          </Pressable>
        )}
        {error !== null && <Text style={[typography.bodyRegular, { color: color.miss }]}>{t('prototype.qr.error', { error })}</Text>}
      </View>
    );
  }

  const viewfinder = Math.round(Math.min(width, height) * VIEWFINDER_SHARE);
  return (
    <View style={[styles.fill, { backgroundColor: color.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <QrScanner style={StyleSheet.absoluteFill} torch={torch} onScan={addReading} onIgnored={(data) => setIgnored({ at: new Date(), data })} onError={setError} />

      <View style={[styles.row, { paddingTop: insets.top + space.s, paddingHorizontal: space.l }]}>
        {backButton}
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: torch }}
          onPress={() => setTorch((on) => !on)}
          style={[styles.button, pill, { backgroundColor: torch ? color.accent : color.surface }]}
        >
          <Text style={[typography.buttonSm, { color: torch ? color.onAccent : color.text }]}>{t(torch ? 'prototype.qr.torchOn' : 'prototype.qr.torchOff')}</Text>
        </Pressable>
      </View>

      <View pointerEvents="none" style={[styles.fill, styles.center]}>
        <View style={[styles.viewfinder, { width: viewfinder, height: viewfinder, borderColor: color.accent, borderRadius: radius.card }]} />
      </View>

      <View style={[styles.card, card, { margin: space.l, marginBottom: insets.bottom + space.l }]}>
        {readings.length === 0 ? (
          <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('prototype.qr.hint')}</Text>
        ) : (
          <Text style={[typography.label, styles.tabular, { color: color.text2 }]}>{t('prototype.qr.count', { count: readings.length })}</Text>
        )}
        {readings.slice(0, SHOWN_READINGS).map(({ key, at, payload }) => {
          const checkpoint = parseCheckpointQr(payload);
          return (
            <View key={key}>
              <Text style={small}>{formatTime(at)}</Text>
              <Text style={[typography.body, { color: color.text }]} selectable>
                {payload}
              </Text>
              {checkpoint === null && <Text style={[typography.small, { color: color.warn }]}>{t('prototype.qr.notCheckpoint')}</Text>}
            </View>
          );
        })}
        {ignored !== null && (
          <Text style={small} numberOfLines={2}>
            {t('prototype.qr.ignored', { time: formatTime(ignored.at), data: ignored.data })}
          </Text>
        )}
        {error !== null && <Text style={[typography.bodyRegular, { color: color.miss }]}>{t('prototype.qr.error', { error })}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  card: { borderWidth: 1 },
  button: { alignItems: 'center', justifyContent: 'center' },
  viewfinder: { borderWidth: 3 },
  tabular: { fontVariant: ['tabular-nums'] },
});
