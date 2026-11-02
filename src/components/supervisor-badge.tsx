import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

import { Icon } from './icon';

/** "Supervisor" capsule with the shield (DESIGN_HANDOFF Supervisor mód): in the header of every supervisor screen. */
export function SupervisorBadge() {
  const { color, typography, size, space, radius, iconSize, iconStroke } = useTheme();
  return (
    <View
      style={[
        styles.badge,
        { minHeight: size.chipHeight, paddingHorizontal: space.m, gap: space.s, borderRadius: radius.pill, backgroundColor: color.runBg },
      ]}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Icon name="shield" size={iconSize.badge} color={color.run} strokeWidth={iconStroke.bold} />
      </View>
      <Text style={[typography.badge, { color: color.run }]}>{t('supervisor.badge')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
});
