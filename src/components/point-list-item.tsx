import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import type { ColorTokens } from '@/theme/tokens';

import { StatusDot, type StatusKey } from './status-dot';

export type PointState = 'scanned' | 'manual' | 'suspicious' | 'wrongOrder' | 'pending' | 'missing';

const STATES: Record<PointState, { dot: StatusKey; meta: keyof ColorTokens; label: TranslationKey }> = {
  scanned: { dot: 'completed', meta: 'text2', label: 'components.scanned' },
  manual: { dot: 'manual', meta: 'manual', label: 'status.manual' },
  suspicious: { dot: 'time_suspicious', meta: 'time', label: 'status.timeSuspicious' },
  wrongOrder: { dot: 'wrong_order', meta: 'warn', label: 'status.wrongOrder' },
  pending: { dot: 'pending', meta: 'text2', label: 'status.pending' },
  missing: { dot: 'missed', meta: 'miss', label: 'status.absent' },
};

export interface PointListItemProps {
  name: string;
  state: PointState;
  /**
   * The line under the name: "22:03 · NFC", "22:09 · Kézi – nem igazolt", "időgyanús: túl gyors (40 mp, mért 3:10)".
   * A pending point shows "Hátravan" at the right, a missing one "Hiányzik" under the name, without it.
   */
  meta?: string;
  /** Fixed order: the position of a pending point in the numbered dot. */
  position?: number;
  onPress?: () => void;
}

/** A checkpoint in the round's list (DESIGN_HANDOFF 5.6): status = dot + colour + text. */
export function PointListItem({ name, state, meta, position, onPress }: PointListItemProps) {
  const { color, typography, size, space, radius, border } = useTheme();
  const s = STATES[state];
  const statusText = t(s.label);
  const metaText = state === 'missing' ? (meta ?? statusText) : meta;
  return (
    <Pressable
      accessible
      accessibilityRole={onPress === undefined ? undefined : 'button'}
      accessibilityLabel={[name, statusText, state === 'missing' ? undefined : meta].filter((part) => part !== undefined).join(', ')}
      disabled={onPress === undefined}
      onPress={onPress}
      style={[
        styles.row,
        { minHeight: size.listItem, paddingHorizontal: space.l, gap: space.m, borderRadius: radius.item },
        state === 'pending'
          ? { borderWidth: border.thick, borderStyle: 'dashed', borderColor: color.dash }
          : state === 'missing'
            ? { backgroundColor: color.missBg }
            : { backgroundColor: color.card, borderWidth: border.thin, borderColor: color.cardBorder },
      ]}
    >
      {state === 'pending' && position !== undefined ? <StatusDot number={position} /> : <StatusDot status={s.dot} filled={state === 'missing'} />}
      <View style={styles.texts}>
        <Text style={[typography.body, { color: color.text }]}>{name}</Text>
        {state !== 'pending' && metaText !== undefined && <Text style={[typography.small, styles.tabular, { color: color[s.meta] }]}>{metaText}</Text>}
      </View>
      {state === 'pending' && <Text style={[typography.small, { color: color.text2 }]}>{statusText}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  texts: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
});
