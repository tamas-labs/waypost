import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

import { Icon } from './icon';

export interface PhotoSlotProps {
  /** The compressed photo file (photo/photo.ts); null: a saved photo whose file is not on this phone. */
  uri: string | null;
  /** Its place in the list, from 1: "2. fotó". */
  number: number;
  /** E.g. remove the photo; the screen tells what happens in the hint. */
  onPress?: () => void;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/** A taken photo (DESIGN_HANDOFF 5.14): the image cropped to the tile, a check at the top right. */
export function PhotoSlot({ uri, number, onPress, accessibilityHint, style }: PhotoSlotProps) {
  const { color, typography, size, space, radius, iconSize, iconStroke } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress === undefined ? 'image' : 'button'}
      accessibilityLabel={t('components.photo', { n: number })}
      accessibilityHint={accessibilityHint}
      disabled={onPress === undefined}
      onPress={onPress}
      style={[styles.tile, { height: size.photoTile, borderRadius: radius.item, backgroundColor: color.field }, style]}
    >
      {uri === null ? (
        <View style={[StyleSheet.absoluteFill, styles.missing, { padding: space.s, gap: space.xs }]}>
          <Icon name="image" size={iconSize.banner} color={color.text2} />
          <Text style={[typography.small, styles.centred, { color: color.text2 }]}>{t('components.photoElsewhere')}</Text>
        </View>
      ) : (
        <Image source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false} />
      )}
      <View
        style={[
          styles.check,
          {
            top: space.s,
            right: space.s,
            width: size.photoCheck,
            height: size.photoCheck,
            borderRadius: size.photoCheck / 2,
            backgroundColor: color.ok,
          },
        ]}
      >
        <Icon name="check" size={iconSize.badge} color={color.bg} strokeWidth={iconStroke.bold} />
      </View>
    </Pressable>
  );
}

export interface PhotoAddProps {
  onPress: () => void;
  disabled?: boolean;
  /** Default: "Fotó"; e.g. "Újra" next to the photo it replaces. */
  label?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** The "take a photo" tile (DESIGN_HANDOFF 5.14): dashed border, accent camera, "Fotó". */
export function PhotoAdd({
  onPress,
  disabled = false,
  label = t('common.photo'),
  accessibilityLabel = t('common.addPhoto'),
  style,
}: PhotoAddProps) {
  const { color, typography, size, space, radius, border, iconSize, press } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.add,
        { height: size.photoTile, borderRadius: radius.item, borderWidth: border.thick, borderColor: color.dash, gap: space.xs },
        pressed && { opacity: press.opacity },
        disabled && { opacity: press.disabledOpacity },
        style,
      ]}
    >
      <Icon name="camera" size={iconSize.buttonHero} color={color.accent} />
      <Text style={[typography.badge, { color: color.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, overflow: 'hidden' },
  check: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  add: { flex: 1, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' },
  missing: { alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
});
