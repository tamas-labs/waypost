import type { Timestamp } from '@waypost/schema';
import { Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { RoundTimeline, type RoundTimelineProps, type TimelineState } from './round-timeline';

export interface ShiftTimelineRound {
  route_id: string;
  route_name: string;
  schedule_id: string;
  scheduled_at: Timestamp;
  state: TimelineState;
}

export interface ShiftTimelineProps {
  rounds: readonly ShiftTimelineRound[];
  /** The site's local time of a round. */
  time: (at: Timestamp) => string;
  variant?: RoundTimelineProps['variant'];
}

/** The rounds of a shift on one timeline per route, named when there are several; the legend under the last. */
export function ShiftTimeline({ rounds, time, variant }: ShiftTimelineProps) {
  const { color, typography, space } = useTheme();
  const routes = [...new Set(rounds.map((round) => round.route_id))].map((routeId) => rounds.filter((round) => round.route_id === routeId));
  return routes.map((routeRounds, index) => (
    <View key={routeRounds[0]!.route_id} style={{ gap: space.s }}>
      {routes.length > 1 && <Text style={[typography.small, { color: color.text2 }]}>{routeRounds[0]!.route_name}</Text>}
      <RoundTimeline
        variant={variant}
        legend={index === routes.length - 1}
        rounds={routeRounds.map((round) => ({ id: `${round.schedule_id}|${round.scheduled_at}`, time: time(round.scheduled_at), state: round.state }))}
      />
    </View>
  ));
}
