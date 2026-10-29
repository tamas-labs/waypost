import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Icon, type IconName } from './icon';

export interface CategoryTileProps {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Full width and lower, the icon beside the label ("Egyéb"). */
  wide?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** An incident category to choose (DESIGN_HANDOFF 5.15): selected → 2 dp accent border, runBg, bolder label. */
export function CategoryTile({ icon, label, selected, onPress, wide = false, style }: CategoryTileProps) {
  const { color, typography, size, space, radius, border, iconSize, fontFamily, press } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        wide ? [styles.wide, { height: size.categoryTileWide, gap: space.s }] : { height: size.categoryTile, gap: space.xs },
        { borderRadius: radius.item, paddingHorizontal: space.s },
        selected
          ? { borderWidth: border.thick, borderColor: color.accent, backgroundColor: color.runBg }
          : { borderWidth: border.thin, borderColor: color.cardBorder, backgroundColor: color.surface },
        pressed && { opacity: press.opacity },
        style,
      ]}
    >
      <Icon name={icon} size={iconSize.button} color={selected ? color.accent : color.text} />
      <Text style={[typography.tile, styles.label, { color: color.text }, selected && { fontFamily: fontFamily.extrabold }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  wide: { flexDirection: 'row' },
  label: { textAlign: 'center' },
});
