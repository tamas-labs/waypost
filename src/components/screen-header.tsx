import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

import { IconButton } from './icon-button';
import { SyncStatusIndicator } from './sync-status-indicator';

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  /** Shows the 48 dp back button. */
  onBack?: () => void;
  /** The right side; default: the sync indicator, which is on every screen (a status badge goes next to it). */
  right?: ReactNode;
}

/** The header of a screen (DESIGN_HANDOFF 6): below the safe area, back button, title (20/800) and subtitle (13/600), sync indicator at the right. */
export function ScreenHeader({ title, subtitle, onBack, right = <SyncStatusIndicator /> }: ScreenHeaderProps) {
  const { color, typography, space, size } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.s, paddingHorizontal: space.l, paddingBottom: space.s, gap: space.m }]}>
      {onBack !== undefined && <IconButton icon="back" accessibilityLabel={t('common.back')} onPress={onBack} />}
      {/* As high as the back button, with or without it. */}
      <View style={[styles.titles, { minHeight: size.touchMin }]}>
        {title !== undefined && (
          <Text style={[typography.title2, { color: color.text }]} accessibilityRole="header">
            {title}
          </Text>
        )}
        {subtitle !== undefined && <Text style={[typography.small, { color: color.text2 }]}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  titles: { flex: 1, justifyContent: 'center' },
});
