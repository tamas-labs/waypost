import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PhotoFile } from '@/chain/payloads';
import { MAX_PHOTOS } from '@/domain/scan';
import { t } from '@/i18n';
import { photoFile } from '@/photo/files';
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
      {granted && (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onMountError={() => setProblem(t('qr.cameraFailed'))} />
      )}
      <View style={[styles.close, { paddingTop: insets.top + space.s, paddingHorizontal: space.l }]}>
        <IconButton icon="x" accessibilityLabel={t('common.cancel')} onPress={onClose} />
      </View>
      <View style={[styles.controls, { padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.m }]}>
        {problem !== null && <InfoBanner variant="error" text={problem} />}
        {granted ? (
          <Button
            hero
            icon="camera"
            label={t(taking ? 'photoField.taking' : 'common.addPhoto')}
            disabled={taking}
            onPress={() => void shoot()}
          />
        ) : (
          permission !== null && (
            <>
              <InfoBanner variant="warn" text={t(canAsk ? 'photoField.permissionNeeded' : 'qr.permissionDenied')} />
              <Button
                label={t(canAsk ? 'qr.allow' : 'qr.openSettings')}
                onPress={() => void (canAsk ? requestPermission() : Linking.openSettings())}
              />
            </>
          )
        )}
      </View>
    </View>
  );
}

/** The camera over the form. It gives way to a screen pushed over the form (an alarm), which it would cover. */
function CameraModal({ open, onTaken, onClose }: { open: boolean; onTaken: (photo: PhotoFile) => void; onClose: () => void }) {
  const focused = useIsFocused();
  return (
    <Modal visible={open && focused} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <PhotoCamera onTaken={onTaken} onClose={onClose} />
    </Modal>
  );
}

function confirmRemove(onRemove: () => void): void {
  Alert.alert(t('photoField.removeTitle'), undefined, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('photoField.remove'), style: 'destructive', onPress: onRemove },
  ]);
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
  const [cameraOpen, setCameraOpen] = useState(false);

  return (
    <View style={{ gap: space.s }}>
      <Text style={[typography.label, { color: color.text, paddingLeft: space.xs }]}>
        {t('common.photo')}
        {required && <Text style={{ color: color.miss }}>{` · ${t('common.required')}`}</Text>}
      </Text>
      <View style={[styles.tiles, { gap: space.s }]}>
        {photos.map((photo, index) => (
          <PhotoSlot
            key={photo.id}
            uri={photo.local_uri}
            number={index + 1}
            accessibilityHint={t('photoField.removeHint')}
            onPress={disabled ? undefined : () => confirmRemove(() => onRemove(photo))}
            style={styles.tile}
          />
        ))}
        {photos.length < MAX_PHOTOS && <PhotoAdd disabled={disabled} onPress={() => setCameraOpen(true)} style={styles.tile} />}
      </View>
      <CameraModal open={cameraOpen} onTaken={onAdd} onClose={() => setCameraOpen(false)} />
    </View>
  );
}

export interface SinglePhotoFieldProps {
  label: string;
  /** After the label in the secondary colour: "· segít megtalálni". */
  hint?: string;
  photo: PhotoFile | null;
  /** A new photo, instead of the one shown. */
  onTake: (photo: PhotoFile) => void;
  onRemove: () => void;
  disabled?: boolean;
}

/**
 * One photo (S-PontAdatai): the photo with an "Újra" tile next to it that takes another instead, or the tile that
 * takes the first. A tap on the photo asks whether to delete it.
 */
export function SinglePhotoField({ label, hint, photo, onTake, onRemove, disabled = false }: SinglePhotoFieldProps) {
  const { color, typography, fontFamily, size, space } = useTheme();
  const [cameraOpen, setCameraOpen] = useState(false);
  const open = () => setCameraOpen(true);
  return (
    <View style={{ gap: space.s }}>
      <Text style={[typography.label, { color: color.text, paddingLeft: space.xs }]}>
        {label}
        {hint !== undefined && <Text style={{ color: color.text2, fontFamily: fontFamily.semibold }}>{` · ${hint}`}</Text>}
      </Text>
      <View style={[styles.tiles, { gap: space.s }]}>
        {photo === null ? (
          <PhotoAdd disabled={disabled} onPress={open} style={{ height: size.photoTileLarge }} />
        ) : (
          <>
            <PhotoSlot
              // Found by its ID: iOS moves the app's documents at an update, so the URI of an older draft goes stale.
              uri={photoFile(photo.id).uri}
              number={1}
              accessibilityHint={t('photoField.removeHint')}
              onPress={disabled ? undefined : () => confirmRemove(onRemove)}
              style={{ height: size.photoTileLarge }}
            />
            <PhotoAdd
              disabled={disabled}
              onPress={open}
              label={t('training.retakePhoto')}
              accessibilityLabel={t('training.retakePhotoLabel')}
              style={{ flex: 0, width: size.photoRetake, height: size.photoTileLarge }}
            />
          </>
        )}
      </View>
      <CameraModal open={cameraOpen} onTaken={onTake} onClose={() => setCameraOpen(false)} />
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
