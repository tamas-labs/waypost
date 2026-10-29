import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import type { ColorTokens } from '@/theme/tokens';

import { Icon, type IconName } from './icon';

export type IconButtonSize = 'regular' | 'map' | 'large';

export interface IconButtonProps {
  icon: IconName;
  /** Required: the button has no visible text (DESIGN_HANDOFF 4). */
  accessibilityLabel: string;
  onPress: () => void;
  /** regular 48 dp (back), map 52 dp (map control), large 72 dp (incident next to Leolvasás). */
  size?: IconButtonSize;
  iconColor?: keyof ColorTokens;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Round icon-only button (DESIGN_HANDOFF 5.2): surface with the card border. */
export function IconButton({ icon, accessibilityLabel, onPress, size = 'regular', iconColor = 'text', disabled = false, style, testID }: IconButtonProps) {
  const { color, size: sizes, iconSize, border, press } = useTheme();
  const diameter = size === 'large' ? sizes.iconButtonLg : size === 'map' ? sizes.iconButtonMap : sizes.iconButton;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: color.surface, borderColor: color.cardBorder, borderWidth: border.thin },
        pressed && { opacity: press.opacity, transform: [{ scale: press.scale }] },
        disabled && { opacity: press.disabledOpacity },
        style,
      ]}
    >
      <Icon name={icon} size={size === 'large' ? iconSize.large : iconSize.button} color={color[iconColor]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
});
