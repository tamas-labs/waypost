import type { Ref } from 'react';
import { Pressable, StyleSheet, Text, View, type HostInstance } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import { syncStyle } from '@/theme/tokens';

import { Icon, type IconName } from './icon';

export type SyncState = keyof typeof syncStyle;

/** Offline and uploading show what happens with an icon; the others a status dot. */
const STATE_ICON: Partial<Record<SyncState, IconName>> = { offline: 'cloudOff', uploading: 'cloudUpload' };

export interface SyncIndicatorProps {
  state: SyncState;
  /** Items waiting for upload: "Offline · 2 vár", "Feltöltés… 3". */
  count?: number;
  /** Opens the details (last sync, "Szinkronizálás most"; SyncStatusIndicator). */
  onPress?: () => void;
  /** The details are open. */
  expanded?: boolean;
  accessibilityHint?: string;
  /** For measuring where the chip is (the details open below it). */
  ref?: Ref<HostInstance>;
}

/** The text of the chip: the label of the state, with the waiting count where it has one (tokens.ts syncStyle). */
export function syncLabel(state: SyncState, count = 0): string {
  const style = syncStyle[state];
  if ('labelQueued' in style && count > 0) return t(style.labelQueued, { count });
  return state === 'uploading' ? t(style.label, { count }) : t(style.label);
}

/** The sync chip at the right of the header (DESIGN_HANDOFF 2.4, 5.3): always visible, discreet. */
export function SyncIndicator({ state, count = 0, onPress, expanded, accessibilityHint, ref }: SyncIndicatorProps) {
  const { color, typography, size, space, radius, border, iconSize } = useTheme();
  const style = syncStyle[state];
  const icon = STATE_ICON[state];
  const label = syncLabel(state, count);
  return (
    <Pressable
      ref={ref}
      accessibilityRole={onPress === undefined ? 'text' : 'button'}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      disabled={onPress === undefined}
      onPress={onPress}
      // The 30 dp chip reaches the 48 dp touch minimum.
      hitSlop={(size.touchMin - size.chipHeight) / 2}
      style={[
        styles.chip,
        {
          height: size.chipHeight,
          paddingHorizontal: space.m,
          gap: space.s,
          borderRadius: radius.pill,
          backgroundColor: color[style.bg],
          borderWidth: border.thin,
          // The surface chip is set off by the card border; the tinted ones have none.
          borderColor: style.bg === 'surface' ? color.cardBorder : color[style.bg],
        },
      ]}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {icon === undefined ? (
          <View style={{ width: size.syncDot, height: size.syncDot, borderRadius: size.syncDot / 2, backgroundColor: color[style.dot] }} />
        ) : (
          <Icon name={icon} size={iconSize.sync} color={color[style.fg]} />
        )}
      </View>
      <Text style={[typography.chip, styles.tabular, { color: color[style.fg] }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  tabular: { fontVariant: ['tabular-nums'] },
});
