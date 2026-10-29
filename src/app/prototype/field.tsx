import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LocationFix, PhotoFile } from '@/chain/payloads';
import { playFeedback, type FeedbackKind } from '@/feedback/feedback';
import { t } from '@/i18n';
import { currentLocation, hasLocationPermission, requestLocationPermission } from '@/location/location';
import { discardPhoto, takePhoto } from '@/photo/photo';
import { useTheme } from '@/theme/theme-provider';

/** The camera box: 3:4, like the photos. */
const CAMERA_ASPECT_RATIO = 3 / 4;

const FEEDBACK_KINDS: readonly FeedbackKind[] = ['success', 'error', 'warning'];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// M3-20 – M3-22 device test: the location a scan would record (and how long it took), a photo as a manual entry
// would save it (size, SHA-256), and the three scan feedbacks. The photo is not recorded: its file is deleted at the
// next photo or on leaving.
export default function FieldScreen() {
  const { color, typography, space, radius, size } = useTheme();
  const [locationAllowed, setLocationAllowed] = useState<boolean | null>(null);
  const [locating, setLocating] = useState(false);
  const [located, setLocated] = useState<{ fix: LocationFix | null; ms: number } | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [taking, setTaking] = useState(false);
  const [photo, setPhoto] = useState<PhotoFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hasLocationPermission().then(setLocationAllowed, (e: unknown) => setError(errorText(e)));
  }, []);
  // The test photo is never recorded.
  useEffect(() => () => void (photo && discardPhoto(photo)), [photo]);

  const locate = async () => {
    setLocating(true);
    const start = performance.now();
    const fix = await currentLocation();
    setLocated({ fix, ms: Math.round(performance.now() - start) });
    setLocating(false);
  };

  const shoot = async () => {
    if (camera.current === null) return;
    setTaking(true);
    setError(null);
    try {
      setPhoto(await takePhoto(camera.current));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setTaking(false);
    }
  };

  const card = { backgroundColor: color.surface, borderColor: color.cardBorder, borderRadius: radius.card, padding: space.l, gap: space.s };
  const label = [typography.label, { color: color.text2 }];
  const body = [typography.bodyRegular, styles.tabular, { color: color.text }];
  const button = [styles.button, { backgroundColor: color.accent, borderRadius: radius.pill, minHeight: size.buttonSecondary }];
  const buttonText = [typography.buttonSm, { color: color.onAccent }];

  const fix = located?.fix ?? null;
  const cameraCanAsk = cameraPermission?.canAskAgain ?? true;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, gap: space.l }}>
      <Stack.Screen options={{ title: t('prototype.field.title') }} />

      <View style={[styles.card, card]}>
        <Text style={label}>{t('prototype.field.location')}</Text>
        {locationAllowed === false ? (
          <Pressable accessibilityRole="button" onPress={() => requestLocationPermission().then(setLocationAllowed, (e: unknown) => setError(errorText(e)))} style={button}>
            <Text style={buttonText}>{t('prototype.field.allowLocation')}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: locating }} disabled={locating} onPress={locate} style={[button, { opacity: locating ? 0.5 : 1 }]}>
            <Text style={buttonText}>{t(locating ? 'prototype.field.locating' : 'prototype.field.locate')}</Text>
          </Pressable>
        )}
        {located !== null && fix === null && <Text style={[typography.body, { color: color.warn }]}>{t('prototype.field.noLocation', { ms: located.ms })}</Text>}
        {located !== null && fix !== null && (
          <>
            <Text style={body} selectable>
              {t('prototype.field.coords', { lat: fix.latitude.toFixed(7), lng: fix.longitude.toFixed(7) })}
            </Text>
            <Text style={body}>{t('prototype.field.accuracy', { m: fix.accuracy_m === null ? '–' : fix.accuracy_m.toFixed(1), ms: located.ms })}</Text>
            <Text style={[body, fix.mocked && { color: color.miss }]}>{t(fix.mocked ? 'prototype.field.mocked' : 'prototype.field.notMocked')}</Text>
            <Text style={body}>{t('prototype.field.gnss', { time: fix.gnss_time ?? '–' })}</Text>
          </>
        )}
      </View>

      <View style={[styles.card, card]}>
        <Text style={label}>{t('prototype.field.photo')}</Text>
        {cameraPermission?.granted ? (
          <>
            <CameraView ref={camera} style={[styles.camera, { borderRadius: radius.card }]} facing="back" />
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: taking }} disabled={taking} onPress={shoot} style={[button, { opacity: taking ? 0.5 : 1 }]}>
              <Text style={buttonText}>{t(taking ? 'prototype.field.taking' : 'prototype.field.takePhoto')}</Text>
            </Pressable>
          </>
        ) : (
          cameraPermission !== null && (
            <Pressable
              accessibilityRole="button"
              onPress={() => (cameraCanAsk ? requestCameraPermission() : Linking.openSettings()).catch((e: unknown) => setError(errorText(e)))}
              style={button}
            >
              <Text style={buttonText}>{t(cameraCanAsk ? 'prototype.field.allowCamera' : 'prototype.qr.openSettings')}</Text>
            </Pressable>
          )
        )}
        {photo !== null && (
          <>
            <Image source={{ uri: photo.local_uri }} style={[styles.photo, { borderRadius: radius.card }]} contentFit="contain" />
            <Text style={body}>{t('prototype.field.photoSize', { kb: Math.round(photo.size_bytes / 1024) })}</Text>
            <Text style={[typography.small, { color: color.text2 }]} selectable>
              {t('prototype.field.sha256', { sha256: photo.sha256 })}
            </Text>
          </>
        )}
      </View>

      <View style={[styles.card, card]}>
        <Text style={label}>{t('prototype.field.feedback')}</Text>
        <View style={[styles.row, { gap: space.s }]}>
          {FEEDBACK_KINDS.map((kind) => (
            <Pressable key={kind} accessibilityRole="button" onPress={() => playFeedback(kind)} style={[button, styles.grow]}>
              <Text style={buttonText}>{t(`prototype.field.feedbackKinds.${kind}`)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error !== null && <Text style={[typography.bodyRegular, { color: color.miss }]}>{t('prototype.field.error', { error })}</Text>}
      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('prototype.field.hint')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  button: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  grow: { flex: 1 },
  camera: { width: '100%', aspectRatio: CAMERA_ASPECT_RATIO, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: CAMERA_ASPECT_RATIO },
  tabular: { fontVariant: ['tabular-nums'] },
});
