import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import type { ColorTokens } from '@/theme/tokens';

// The ring is drawn in a 104 viewBox (B-Kor.dc.html), scaled to its size.
const VIEW = 104;

export interface ProgressRingProps {
  done: number;
  total: number;
  /** regular: 96 dp with the count inside (round list); small: 52 dp with the count beside it (map header). */
  size?: 'regular' | 'small';
}

/** Points done of the round (DESIGN_HANDOFF 5.7): track ring, accent arc from the top, "5/9 pont". */
export function ProgressRing({ done, total, size = 'regular' }: ProgressRingProps) {
  const { color, typography, size: sizes, space } = useTheme();
  const small = size === 'small';
  const diameter = small ? sizes.progressRingSm : sizes.progressRing;
  const stroke = small ? sizes.progressRingStrokeSm : sizes.progressRingStroke;
  // 3 units of air outside the stroke, as in the references (r 44 at stroke 10, r 42 at stroke 14).
  const r = (VIEW - stroke) / 2 - 3;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? Math.min(done / total, 1) : 0;
  const count = (
    <View style={small ? undefined : styles.inside}>
      <Text style={[small ? typography.ringValueSm : typography.ringValue, styles.tabular, { color: color.text }]}>{`${done}/${total}`}</Text>
      <Text style={[typography.unit, { color: color.text2 }]}>{t('common.points')}</Text>
    </View>
  );
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={t('components.progress', { done, total })} accessibilityValue={{ min: 0, max: total, now: done }} style={[styles.row, { gap: space.m }]}>
      <View style={{ width: diameter, height: diameter }}>
        <Svg width={diameter} height={diameter} viewBox={`0 0 ${VIEW} ${VIEW}`}>
          <Circle cx={VIEW / 2} cy={VIEW / 2} r={r} fill="none" stroke={color.track} strokeWidth={stroke} />
          {fraction > 0 && (
            <Circle
              cx={VIEW / 2}
              cy={VIEW / 2}
              r={r}
              fill="none"
              stroke={color.accent}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circumference * fraction} ${circumference}`}
              transform={`rotate(-90 ${VIEW / 2} ${VIEW / 2})`}
            />
          )}
        </Svg>
        {!small && <View style={StyleSheet.absoluteFill}>{count}</View>}
      </View>
      {small && count}
    </View>
  );
}

export interface ProgressSegmentsProps {
  /** One segment per point, in order: the colour of its state (tokens), or null for a pending one (track). */
  segments: (keyof ColorTokens | null)[];
}

/** N equal segments, one per point (DESIGN_HANDOFF 5.8); decorative, the count next to it is the text. */
export function ProgressSegments({ segments }: ProgressSegmentsProps) {
  const { color, size, space } = useTheme();
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.row, { gap: space.xs }]}>
      {segments.map((segment, index) => (
        <View
          // The segments are positions: the index is their identity.
          key={index}
          style={[styles.segment, { height: size.progressSegment, borderRadius: size.progressSegment / 2, backgroundColor: color[segment ?? 'track'] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  inside: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segment: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
});
