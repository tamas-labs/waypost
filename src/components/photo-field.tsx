import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PhotoFile } from '@/chain/payloads';
import { MAX_PHOTOS } from '@/domain/scan';
import { t } from '@/i18n';
import { takePhoto } from '@/photo/photo';
import { useTheme } from '@/theme/theme-provider';

import { Button } from './button';
import { IconButton } from './icon-button';
import { InfoBanner } from './info-banner';
import { PhotoAdd, PhotoSlot } from './photo-tile';

/** Three tiles in a row (B-Kezi), with the gaps between them. */
const TILE_WIDTH = '31%';

/** The app's own camera, so the gallery is out of reach (specification: Fotó). */
function PhotoCamera({ onTaken, onClose }: { onTaken: (photo: PhotoFile) => void; onClose: () => void }) {
  const { color, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [taking, setTaking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const shoot = async () => {
    if (camera.current === null || taking) return;
    setTaking(true);
    setProblem(null);
    try {
      onTaken(await takePhoto(camera.current));
      onClose();
    } catch (error) {
      if (__DEV__) console.warn('Taking a photo failed', error);
      setProblem(t('photoField.failed'));
    } finally {
      setTaking(false);
    }
  };

  const granted = permission?.granted === true;
  // Asked again only while the system allows it; after a final refusal only the settings can grant it.
  const canAsk = permission?.canAskAgain ?? true;
  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      {granted && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onMountError={() => setProblem(t('qr.cameraFailed'))} />}
      <View style={[styles.close, { paddingTop: insets.top + space.s, paddingHorizontal: space.l }]}>
        <IconButton icon="x" accessibilityLabel={t('common.cancel')} onPress={onClose} />
      </View>
      <View style={[styles.controls, { padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.m }]}>
        {problem !== null && <InfoBanner variant="error" text={problem} />}
        {granted ? (
          <Button hero icon="camera" label={t(taking ? 'photoField.taking' : 'common.addPhoto')} disabled={taking} onPress={() => void shoot()} />
        ) : (
          permission !== null && (
            <>
              <InfoBanner variant="warn" text={t(canAsk ? 'photoField.permissionNeeded' : 'qr.permissionDenied')} />
              <Button label={t(canAsk ? 'qr.allow' : 'qr.openSettings')} onPress={() => void (canAsk ? requestPermission() : Linking.openSettings())} />
            </>
          )
        )}
      </View>
    </View>
  );
}

export interface PhotoFieldProps {
  photos: readonly PhotoFile[];
  onAdd: (photo: PhotoFile) => void;
  onRemove: (photo: PhotoFile) => void;
  /** Marks the label: "· kötelező" in the error colour. */
  required?: boolean;
  disabled?: boolean;
}

/** The photos of a form: the taken ones (a tap asks whether to delete it), and the tile that opens the camera, up to 5. */
export function PhotoField({ photos, onAdd, onRemove, required = false, disabled = false }: PhotoFieldProps) {
  const { color, typography, space } = useTheme();
  const focused = useIsFocused();
  const [cameraOpen, setCameraOpen] = useState(false);

  const askRemove = (photo: PhotoFile) => {
    Alert.alert(t('photoField.removeTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('photoField.remove'), style: 'destructive', onPress: () => onRemove(photo) },
    ]);
  };

  return (
    <View style={{ gap: space.s }}>
      <Text style={[typography.label, { color: color.text, paddingLeft: space.xs }]}>
        {t('common.photo')}
        {required && <Text style={{ color: color.miss }}>{` · ${t('common.required')}`}</Text>}
      </Text>
      <View style={[styles.tiles, { gap: space.s }]}>
        {photos.map((photo, index) => (
          <PhotoSlot key={photo.id} uri={photo.local_uri} number={index + 1} accessibilityHint={t('photoField.removeHint')} onPress={disabled ? undefined : () => askRemove(photo)} style={styles.tile} />
        ))}
        {photos.length < MAX_PHOTOS && <PhotoAdd disabled={disabled} onPress={() => setCameraOpen(true)} style={styles.tile} />}
      </View>
      {/* It gives way to a screen pushed over the form (an alarm), which it would cover. */}
      <Modal visible={cameraOpen && focused} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setCameraOpen(false)}>
        <PhotoCamera onTaken={onAdd} onClose={() => setCameraOpen(false)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { flex: 0, width: TILE_WIDTH },
  close: { flexDirection: 'row', justifyContent: 'flex-end' },
  controls: { marginTop: 'auto' },
});
