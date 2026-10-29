import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import type { ColorTokens } from '@/theme/tokens';

import { Icon, type IconName } from './icon';

export type InfoBannerVariant = 'info' | 'warn' | 'error' | 'offline' | 'manual' | 'success';

const VARIANTS: Record<InfoBannerVariant, { bg: keyof ColorTokens; fg: keyof ColorTokens; icon: IconName }> = {
  info: { bg: 'runBg', fg: 'run', icon: 'info' },
  warn: { bg: 'warnBg', fg: 'warn', icon: 'warning' },
  error: { bg: 'missBg', fg: 'miss', icon: 'warning' },
  offline: { bg: 'offBg', fg: 'offFg', icon: 'cloudUpload' },
  manual: { bg: 'manualBg', fg: 'manual', icon: 'pencil' },
  success: { bg: 'okBg', fg: 'ok', icon: 'check' },
};

export interface InfoBannerProps {
  variant: InfoBannerVariant;
  text: string;
  /** A bold lead-in before the text ("3 tétel vár feltöltésre."). */
  title?: string;
  /** Replaces the variant's icon. */
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

/** Tinted strip with an icon and a short text (DESIGN_HANDOFF 5.12); the text stays in the text colour. */
export function InfoBanner({ variant, text, title, icon, style }: InfoBannerProps) {
  const { color, typography, radius, space, iconSize, fontFamily } = useTheme();
  const v = VARIANTS[variant];
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: color[v.bg], borderRadius: radius.item, paddingVertical: space.m, paddingHorizontal: space.l, gap: space.m },
        style,
      ]}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.icon}>
        <Icon name={icon ?? v.icon} size={iconSize.banner} color={color[v.fg]} />
      </View>
      <Text style={[typography.banner, styles.text, { color: color.text }]}>
        {title !== undefined && <Text style={{ fontFamily: fontFamily.extrabold }}>{`${title} `}</Text>}
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start' },
  // Aligns the icon with the first line of the text (20 line height, 18 icon).
  icon: { marginTop: 1 },
  text: { flex: 1 },
});
