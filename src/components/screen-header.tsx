import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import { t } from '@/i18n';
import { routeAccess } from '@/navigation/access';
import { useTheme } from '@/theme/theme-provider';

import { IconButton } from './icon-button';
import { SupervisorBadge } from './supervisor-badge';
import { SyncStatusIndicator } from './sync-status-indicator';

export interface ScreenHeaderProps {
  /** Above the title: the site on the shift home (13/600). */
  overline?: string;
  title?: string;
  subtitle?: string;
  /** Shows the 48 dp back button. */
  onBack?: () => void;
  /** What the back button does, if not just "Vissza" (e.g. it logs out). */
  backLabel?: string;
  /** The back button's icon: a cross where leaving gives up what the screen holds (the training). */
  backIcon?: 'back' | 'x';
  /** The right side; default: the sync indicator, which is on every screen (a status badge goes next to it). */
  right?: ReactNode;
}

/**
 * The header of a screen (DESIGN_HANDOFF 6): below the safe area, back button, title (20/800) and subtitle (13/600), sync
 * indicator at the right. In supervisor mode the "Supervisor" badge comes at the left, after the back button, so the mode
 * is always clear (DESIGN_HANDOFF Supervisor mód). Back button, badge and sync indicator together fill a 360 dp wide phone
 * (Galaxy S24), and the title got no width at all: then the titles go to a second row, below them.
 */
export function ScreenHeader({
  overline,
  title,
  subtitle,
  onBack,
  backLabel = t('common.back'),
  backIcon = 'back',
  right = <SyncStatusIndicator />,
}: ScreenHeaderProps) {
  const { color, typography, space, size } = useTheme();
  const insets = useSafeAreaInsets();
  const supervisor = useSession((session) => routeAccess(session).supervisor);
  const padding = { paddingHorizontal: space.l, paddingBottom: space.s };
  const titles = (overline !== undefined || title !== undefined || subtitle !== undefined) && (
    <View style={styles.titles}>
      {overline !== undefined && <Text style={[typography.small, { color: color.text2 }]}>{overline}</Text>}
      {title !== undefined && (
        <Text style={[typography.title2, { color: color.text }]} accessibilityRole="header">
          {title}
        </Text>
      )}
      {subtitle !== undefined && <Text style={[typography.small, { color: color.text2 }]}>{subtitle}</Text>}
    </View>
  );
  const back = onBack !== undefined && <IconButton icon={backIcon} accessibilityLabel={backLabel} onPress={onBack} />;
  if (onBack !== undefined && supervisor) {
    return (
      <View style={[padding, { paddingTop: insets.top + space.s, gap: space.s }]}>
        <View style={[styles.header, { gap: space.m }]}>
          {back}
          <SupervisorBadge />
          <View style={[styles.grow, styles.end]}>{right}</View>
        </View>
        {titles}
      </View>
    );
  }
  return (
    <View style={[styles.header, padding, { paddingTop: insets.top + space.s, gap: space.m }]}>
      {back}
      {supervisor && <SupervisorBadge />}
      {/* As high as the back button, with or without it. */}
      <View style={[styles.grow, { minHeight: size.touchMin, justifyContent: 'center' }]}>{titles}</View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  end: { alignItems: 'flex-end' },
  titles: { flexShrink: 1 },
});
