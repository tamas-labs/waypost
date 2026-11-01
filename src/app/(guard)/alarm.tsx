import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clearAlarm, muteAlarm, useActiveAlarms } from '@/alarms/active-alarms';
import { useRinging } from '@/alarms/ringing';
import { Button } from '@/components/button';
import { StatusDot } from '@/components/status-dot';
import { SyncStatusIndicator } from '@/components/sync-status-indicator';
import { getDatabase } from '@/db/open';
import type { AlarmSlot } from '@/domain/alarms';
import { loadAlarmScreenInfo, type AlarmScreenInfo } from '@/guard/alarm';
import { runSchedulerStep } from '@/guard/scheduler';
import { useLiveQuery } from '@/hooks/use-live-query';
import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import { statusStyle, tabular } from '@/theme/tokens';
import { parseTimestamp } from '@/time/timestamp';
import { localTimeOf } from '@/time/zone';

/** The round of the alarm, reloaded after a chain entry (the round opened, started or closed) and a pull. */
function useAlarmInfo(slot: AlarmSlot): AlarmScreenInfo | null {
  const { route_id, schedule_id, scheduled_at } = slot;
  return useLiveQuery(
    useCallback(() => loadAlarmScreenInfo(getDatabase(), { route_id, schedule_id, scheduled_at }), [route_id, schedule_id, scheduled_at]),
  );
}

/** There is no way back from the alarm. */
function useBackButtonBlocked() {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);
}

/** Leaves the screen, once and clearing the alarm; by itself when the round has nothing to wait for. */
function useLeaveAlarm({ route_id, schedule_id, scheduled_at }: AlarmSlot, over: boolean) {
  const left = useRef(false);
  const leave = useCallback(
    (href: Href | null) => {
      if (left.current) return;
      left.current = true;
      // A reminder over the round's own screen goes back to it.
      if (href !== null) router.dismissTo(href);
      else if (router.canGoBack()) router.back();
      else router.replace('/');
      clearAlarm({ route_id, schedule_id, scheduled_at });
    },
    [route_id, schedule_id, scheduled_at],
  );

  useEffect(() => {
    if (over) leave(null);
  }, [over, leave]);
  return leave;
}

function alarmDetails(info: AlarmScreenInfo): string {
  return [
    info.route_name,
    t('alarm.points', { count: info.checkpoints }),
    info.time_limit_min === null ? null : t('alarm.limit', { minutes: info.time_limit_min }),
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

// The alarm (G4, B-Ebresztes): a round is due. It rings until "Indulok" (to the round's screen; the time starts with
// the first scan) or "Hang némítása" (the screen stays, the reminder rings again). There is no snooze and no way back;
// the screen leaves by itself once the round has nothing to wait for (it started or closed).
export default function AlarmScreen() {
  const { color, typography, space, size } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    route_id = '',
    schedule_id = '',
    scheduled_at = '',
  } = useLocalSearchParams<{ route_id: string; schedule_id: string; scheduled_at: string }>();
  const slot = { route_id, schedule_id, scheduled_at };
  const info = useAlarmInfo(slot);
  const muted = useActiveAlarms((state) => state.muted);
  const [going, setGoing] = useState(false);

  // The screen would go dark, and the app with it to the background, where the sound stops.
  useKeepAwake();
  useRinging(info !== null && !muted && !going);
  useBackButtonBlocked();
  const leave = useLeaveAlarm(slot, info === null);

  const go = async () => {
    setGoing(true);
    // The scheduler has a step at every alarm, but it may not have run yet.
    await runSchedulerStep(getDatabase()).catch((error: unknown) => __DEV__ && console.warn('Scheduler step failed (alarm)', error));
    const roundId = loadAlarmScreenInfo(getDatabase(), slot)?.round_id ?? null;
    leave(roundId === null ? null : { pathname: '/round/[id]', params: { id: roundId } });
  };

  if (info === null) return <View style={[styles.screen, { backgroundColor: color.bg }]} />;

  const time = (at: string) => localTimeOf(parseTimestamp(at), info.timezone);

  return (
    <ScrollView
      style={{ backgroundColor: color.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl, paddingHorizontal: space.xxl, gap: space.xl },
      ]}
    >
      <View style={styles.centre}>
        <SyncStatusIndicator />
      </View>

      <View style={[styles.main, { gap: space.xxl }]}>
        <AlarmClock time={time(scheduled_at)} />

        <View style={[styles.centre, { gap: space.s }]}>
          <Text style={[typography.alarm, styles.text, tabular, { color: color.text }]} accessibilityRole="header">
            {t('alarm.title', { time: time(scheduled_at) })}
          </Text>
          <Text style={[typography.resultBody, styles.text, tabular, { color: color.text2 }]}>{alarmDetails(info)}</Text>
        </View>

        {info.previous !== null && <PreviousRound status={info.previous.status} time={time(info.previous.scheduled_at)} />}
      </View>

      <View style={[styles.wide, { gap: space.m }]}>
        <Button hero label={t('alarm.go')} disabled={going} onPress={() => void go()} style={{ minHeight: size.buttonAlarm }} />
        <Button variant="secondary" label={muted ? t('alarm.muted') : t('alarm.mute')} disabled={muted || going} onPress={muteAlarm} />
      </View>
    </ScrollView>
  );
}

function AlarmClock({ time }: { time: string }) {
  const { color, typography, size } = useTheme();
  const [outer, middle, inner] = size.alarmRing;
  const circle = (diameter: number) => ({ width: diameter, height: diameter, borderRadius: diameter / 2 });
  return (
    // The title says the time.
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.ring, circle(outer), { backgroundColor: color.ring1 }]}
    >
      <View style={[styles.ring, circle(middle), { backgroundColor: color.ring2 }]}>
        <View style={[styles.ring, circle(inner), { backgroundColor: color.accent }]}>
          <Text
            style={[typography.alarmTime, tabular, { color: color.onAccent }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.2}
          >
            {time}
          </Text>
        </View>
      </View>
    </View>
  );
}

function PreviousRound({ status, time }: { status: NonNullable<AlarmScreenInfo['previous']>['status']; time: string }) {
  const { color, typography, space, radius, border } = useTheme();
  return (
    <View
      accessible
      style={[
        styles.previous,
        {
          gap: space.s,
          paddingHorizontal: space.l,
          paddingVertical: space.m,
          borderRadius: radius.item,
          backgroundColor: color.surface,
          borderWidth: border.thin,
          borderColor: color.cardBorder,
        },
      ]}
    >
      <StatusDot status={status} />
      <Text style={[typography.siteName, tabular, styles.previousText, { color: color.text }]}>
        {t('alarm.previous', { time, status: t(statusStyle[status].label).toLowerCase() })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center' },
  centre: { alignItems: 'center' },
  main: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  ring: { alignItems: 'center', justifyContent: 'center' },
  previous: { flexDirection: 'row', alignItems: 'center' },
  previousText: { flexShrink: 1 },
  text: { textAlign: 'center' },
  wide: { alignSelf: 'stretch' },
});
