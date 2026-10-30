import { StyleSheet, Text, View } from 'react-native';

import { t, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import type { ColorTokens } from '@/theme/tokens';

import { Icon, type IconName } from './icon';

/** A round on the timeline: closed (completed / incomplete / missed), running, the next one, or a later one. */
export type TimelineState = 'completed' | 'incomplete' | 'missed' | 'running' | 'next' | 'future';

export interface TimelineRound {
  id: string;
  /** Scheduled time, site local "HH:MM"; the cell's label is the hour. */
  time: string;
  state: TimelineState;
}

const STATES: Record<TimelineState, { fill: keyof ColorTokens | null; border: keyof ColorTokens; icon: IconName | null; label: TranslationKey }> = {
  completed: { fill: 'ok', border: 'ok', icon: 'check', label: 'status.completed' },
  incomplete: { fill: 'warn', border: 'warn', icon: 'exclam', label: 'status.incomplete' },
  missed: { fill: 'miss', border: 'miss', icon: 'x', label: 'status.missed' },
  running: { fill: null, border: 'run', icon: 'arc', label: 'status.inProgress' },
  next: { fill: null, border: 'accent', icon: 'bell', label: 'status.next' },
  future: { fill: null, border: 'track', icon: null, label: 'status.pending' },
};

const LEGEND: TimelineState[] = ['completed', 'incomplete', 'missed', 'next'];

/** Above this many rounds the cells are too narrow for icons, and only every n-th hour is labelled (13 fit, B-Kezdolap). */
const FULL_COLUMNS = 13;

/** "20:00 Teljesítve, 21:00 Hiányos, 22:00 Következik, a többi később": the timeline read as one text. */
export function timelineLabel(rounds: readonly TimelineRound[]): string {
  const told = rounds.filter((round) => round.state !== 'future').map((round) => `${round.time} ${t(STATES[round.state].label)}`);
  if (rounds.some((round) => round.state === 'future')) told.push(t('components.timelineLater'));
  return t('components.timeline', { items: told.join(', ') });
}

export interface RoundTimelineProps {
  rounds: readonly TimelineRound[];
  /** full: 40 dp cells with icons, hour labels and legend (home); compact: 28 dp (shift end); mini: 8 dp (site card). */
  variant?: 'full' | 'compact' | 'mini';
  /** The legend below a full timeline; off for all but the last of several timelines in a card. */
  legend?: boolean;
}

/** The night's rounds side by side (DESIGN_HANDOFF 5.9). */
export function RoundTimeline({ rounds, variant = 'full', legend = true }: RoundTimelineProps) {
  const { color, typography, size, space, radius, border, iconSize, iconStroke } = useTheme();
  const full = variant === 'full';
  const height = full ? size.timelineCell : variant === 'compact' ? size.timelineCellCompact : size.timelineCellMini;
  const cellRadius = full ? radius.cell : variant === 'compact' ? radius.cellSm : size.timelineCellMini / 2;
  const withIcons = full && rounds.length <= FULL_COLUMNS;
  const labelEvery = Math.ceil(rounds.length / FULL_COLUMNS);
  return (
    <View style={{ gap: space.m }}>
      <View accessible accessibilityRole="image" accessibilityLabel={timelineLabel(rounds)} style={[styles.row, { gap: size.timelineGap }]}>
        {rounds.map((round, index) => {
          const s = STATES[round.state];
          return (
            <View key={round.id} style={[styles.column, { gap: space.xs }]}>
              <View
                style={[
                  styles.cell,
                  { height, borderRadius: cellRadius },
                  s.fill === null ? { borderWidth: full ? border.thick : border.thin, borderColor: color[s.border] } : { backgroundColor: color[s.fill] },
                ]}
              >
                {withIcons && s.icon !== null && (
                  <Icon name={s.icon} size={iconSize.badge} color={s.fill === null ? color[s.border] : color.bg} strokeWidth={iconStroke.bold} />
                )}
              </View>
              {variant !== 'mini' && (
                <Text style={[typography.micro, styles.tabular, { color: round.state === 'next' ? color.accent : color.text2 }]}>
                  {index % labelEvery === 0 ? round.time.slice(0, 2) : ' '}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      {full && legend && (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.legend, { columnGap: space.m, rowGap: space.xs }]}>
          {LEGEND.map((state) => {
            const s = STATES[state];
            return (
              <View key={state} style={[styles.row, styles.center, { gap: space.xs }]}>
                <View
                  style={[
                    { width: size.legendSwatch, height: size.legendSwatch, borderRadius: radius.swatch },
                    s.fill === null ? { borderWidth: border.thick, borderColor: color[s.border] } : { backgroundColor: color[s.fill] },
                  ]}
                />
                <Text style={[typography.unit, { color: color.text2 }]}>{t(s.label)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  center: { alignItems: 'center' },
  column: { flex: 1, alignItems: 'center' },
  cell: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap' },
  tabular: { fontVariant: ['tabular-nums'] },
});
