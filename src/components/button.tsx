import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import type { ColorTokens, Theme } from '@/theme/tokens';

import { Icon, type IconName } from './icon';

export type ButtonVariant = 'primary' | 'secondary' | 'dashed' | 'dangerText' | 'warnTonal';

export interface ButtonProps {
  /** The translated label; a hero countdown goes into it ("Tovább · 3"). */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Primary only: 72 dp for the main action of a screen (Leolvasás, Indulok, Tovább) instead of 68. */
  hero?: boolean;
  icon?: IconName;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface VariantStyle {
  height: number;
  text: keyof Theme['typography'];
  fg: keyof ColorTokens;
  bg: keyof ColorTokens | null;
  border: { color: keyof ColorTokens; width: number; dashed: boolean } | null;
  iconSize: number;
}

function variantStyle(theme: Theme, variant: ButtonVariant, hero: boolean): VariantStyle {
  const { size, iconSize, border } = theme;
  switch (variant) {
    case 'primary':
      return {
        height: hero ? size.buttonHero : size.buttonPrimary,
        text: 'button',
        fg: 'onAccent',
        bg: 'accent',
        border: null,
        iconSize: hero ? iconSize.buttonHero : iconSize.button,
      };
    case 'secondary':
      return { height: size.buttonSecondary, text: 'buttonSm', fg: 'text', bg: 'surface', border: { color: 'cardBorder', width: border.thin, dashed: false }, iconSize: iconSize.button };
    case 'dashed':
      return { height: size.buttonDashed, text: 'buttonSm', fg: 'accent', bg: null, border: { color: 'dash', width: border.thick, dashed: true }, iconSize: iconSize.button };
    case 'dangerText':
      return { height: size.buttonDanger, text: 'buttonSm', fg: 'miss', bg: null, border: null, iconSize: iconSize.button };
    case 'warnTonal':
      return { height: size.buttonTonal, text: 'buttonSm', fg: 'warn', bg: 'warnBg', border: null, iconSize: iconSize.banner };
  }
}

/** The buttons of DESIGN_HANDOFF 5.1: pressed → 0.85 opacity and 0.98 scale, disabled → 0.4 opacity. */
export function Button({ label, onPress, variant = 'primary', hero = false, icon, disabled = false, accessibilityHint, style, testID }: ButtonProps) {
  const theme = useTheme();
  const { color, typography, radius, space, press } = theme;
  const v = variantStyle(theme, variant, hero);
  const fg = color[v.fg];
  // The dashed add button carries a plus unless it has its own icon.
  const shownIcon = icon ?? (variant === 'dashed' ? 'plus' : undefined);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: v.height,
          borderRadius: radius.pill,
          paddingHorizontal: space.xl,
          gap: space.s,
          backgroundColor: v.bg === null ? undefined : color[v.bg],
        },
        v.border !== null && { borderColor: color[v.border.color], borderWidth: v.border.width, borderStyle: v.border.dashed ? 'dashed' : 'solid' },
        pressed && { opacity: press.opacity, transform: [{ scale: press.scale }] },
        disabled && { opacity: press.disabledOpacity },
        style,
      ]}
    >
      {shownIcon !== undefined && (
        <View importantForAccessibility="no-hide-descendants">
          <Icon name={shownIcon} size={v.iconSize} color={fg} />
        </View>
      )}
      <Text style={[typography[v.text], { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
