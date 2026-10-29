import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import { statusStyle } from '@/theme/tokens';

import { Icon } from './icon';
import type { StatusKey } from './status-dot';

export interface StatusBadgeProps {
  status: StatusKey;
  /** Replaces the status name (e.g. "Kézi rögzítés" in the header of the manual entry). */
  label?: string;
}

/** Capsule with the status colour, icon and name (DESIGN_HANDOFF 5.5): round header, site card, manual entry. */
export function StatusBadge({ status, label }: StatusBadgeProps) {
  const { color, typography, size, space, radius, iconSize, iconStroke, border } = useTheme();
  const style = statusStyle[status];
  const fg = color[style.fg];
  return (
    <View
      style={[
        styles.badge,
        { minHeight: size.chipHeight, paddingHorizontal: space.m, gap: space.s, borderRadius: radius.pill },
        style.bg === null ? { borderWidth: border.thin, borderColor: fg } : { backgroundColor: color[style.bg] },
      ]}
    >
      {style.icon !== 'ring' && (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Icon name={style.icon} size={iconSize.badge} color={fg} strokeWidth={iconStroke.bold} />
        </View>
      )}
      <Text style={[typography.badge, { color: fg }]}>{label ?? t(style.label)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
});
