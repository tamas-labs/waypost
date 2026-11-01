import type { Timestamp } from '@waypost/schema';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveAlarms } from '@/alarms/active-alarms';
import { logOut, useSession } from '@/auth/session';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { ShiftTimeline } from '@/components/shift-timeline';
import { StatusDot } from '@/components/status-dot';
import { getDatabase } from '@/db/open';
import { isClosedStatus, roundKey, type ClosedStatus } from '@/domain/state';
import { loadShiftHomeInfo, type ShiftHomeInfo, type ShiftHomeRound } from '@/guard/home';
import { forgetShownRounds, markRoundShown, wasRoundShown } from '@/guard/round';
import { useCountdown } from '@/guard/use-countdown';
import { useLiveQuery } from '@/hooks/use-live-query';
import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import { statusStyle, tabular } from '@/theme/tokens';
import { parseTimestamp } from '@/time/timestamp';
import { countdownText } from '@/time/countdown';
import { localTimeOf, MINUTE_MS } from '@/time/zone';

type ClosedRound = ShiftHomeRound & { state: ClosedStatus };

const isClosed = (round: ShiftHomeRound): round is ClosedRound => isClosedStatus(round.state);

/** The shift's rounds, reloaded after a chain entry (a round opened, a scan, a shift closed) and a pull. */
function useShiftHomeInfo(guardId: string | null): ShiftHomeInfo | null {
  return useLiveQuery(useCallback(() => (guardId === null ? null : loadShiftHomeInfo(getDatabase(), guardId)), [guardId]));
}

/** A round open for the first time goes on to its screen; an alarm goes first, because its "Indulok" opens the round. */
function useOpenRunningRound(runningId: string | null) {
  const focused = useIsFocused();
  const alarmActive = useActiveAlarms(({ alarms }) => alarms.length > 0);
  // This screen is mounted at a login: the guard's rounds are shown again.
  useEffect(() => forgetShownRounds(), []);
  useEffect(() => {
    if (!focused || alarmActive || runningId === null || wasRoundShown(runningId)) return;
    markRoundShown(runningId);
    router.push({ pathname: '/round/[id]', params: { id: runningId } });
  }, [focused, alarmActive, runningId]);
}

// Shift home (G3, B-Kezdolap): the next round with a countdown, the rounds of the shift on a timeline, the closed ones
// in a list, and the buttons of the incident and of closing the shift. A round open for the first time goes on to its
// screen (G5); back from there, this screen stays, so the shift can be closed or handed over meanwhile. The back button
// logs out to the PIN screen, so another guard can take over (the shift stays open); a shift closed meanwhile
// (automatically) logs out by itself.
export default function HomeScreen() {
  const { color, space } = useTheme();
  const guardId = useSession(({ activeUser }) => activeUser?.id ?? null);
  const info = useShiftHomeInfo(guardId);

  const shiftClosed = info !== null && info.home === null;
  useEffect(() => {
    if (shiftClosed) logOut();
  }, [shiftClosed]);

  const home = info?.home ?? null;
  useOpenRunningRound(home?.running?.round_id ?? null);

  const rounds = home?.rounds ?? [];
  const closed = rounds.filter(isClosed);
  const severalRoutes = new Set(rounds.map((round) => round.route_id)).size > 1;
  const time = (at: Timestamp) => (info === null ? '' : localTimeOf(parseTimestamp(at), info.timezone));

  return (
    <View style={[styles.screen, { backgroundColor: color.bg }]}>
      <ScreenHeader
        overline={info?.site_name}
        title={t('home.onShift', { name: info?.guard_name ?? '' })}
        onBack={logOut}
        backLabel={t('home.logout')}
      />
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.l, gap: space.m }}>
        {home !== null && <WhatComesNext home={home} time={time} />}

        {rounds.length === 0 ? (
          <InfoBanner variant="info" text={t('home.noRounds')} />
        ) : (
          <RoundsCard rounds={rounds} closedCount={closed.length} time={time} />
        )}

        {/* Newest on top. */}
        {[...closed].reverse().map((round) => (
          <ClosedRoundRow key={roundKey(round)} round={round} time={time(round.scheduled_at)} withRoute={severalRoutes} />
        ))}
      </ScrollView>

      <HomeButtons />
    </View>
  );
}

/** The running round, the next one, or that no more come; nothing without rounds. */
function WhatComesNext({ home, time }: { home: NonNullable<ShiftHomeInfo['home']>; time: (at: Timestamp) => string }) {
  const { color, typography } = useTheme();
  const { running, next_at: nextAt, auto_close_at: autoCloseAt } = home;
  if (running !== null) {
    return (
      <CountdownCard
        key={running.deadline}
        title={t('round.title', { time: time(running.scheduled_at) })}
        target={running.deadline}
        caption={t('home.remaining', { time: time(running.deadline) })}
      >
        <Button
          hero
          label={t('home.openRound')}
          onPress={() => router.push({ pathname: '/round/[id]', params: { id: running.round_id } })}
          style={styles.wide}
        />
      </CountdownCard>
    );
  }
  if (nextAt !== null) {
    return <CountdownCard key={nextAt} title={t('home.nextRound', { time: time(nextAt) })} target={nextAt} caption={t('home.startsIn')} />;
  }
  if (home.rounds.length === 0) return null;
  return (
    <Card style={styles.centre}>
      <Text style={[typography.title2, styles.centredText, { color: color.text }]}>{t('home.noMoreRounds')}</Text>
      {autoCloseAt !== null && (
        <Text style={[typography.bodyRegular, styles.centredText, { color: color.text2 }]}>
          {t('home.autoClose', { time: time(autoCloseAt) })}
        </Text>
      )}
    </Card>
  );
}

function RoundsCard({ rounds, closedCount, time }: { rounds: ShiftHomeRound[]; closedCount: number; time: (at: Timestamp) => string }) {
  const { color, typography, space } = useTheme();
  return (
    <Card>
      <View style={[styles.cardTitle, { gap: space.s }]}>
        <Text style={[typography.buttonSm, { color: color.text }]} accessibilityRole="header">
          {t('home.rounds')}
        </Text>
        <Text style={[typography.rowLabel, tabular, { color: color.text2 }]}>
          {t('home.closedCount', { closed: closedCount, total: rounds.length })}
        </Text>
      </View>
      <ShiftTimeline rounds={rounds} time={time} />
    </Card>
  );
}

function HomeButtons() {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.buttons, { paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: insets.bottom + space.l, gap: space.s }]}
    >
      <Button
        variant="secondary"
        label={t('home.incident')}
        icon="flag"
        iconColor="warn"
        onPress={() => router.push('/incident/new')}
        style={[styles.button, { paddingHorizontal: space.s }]}
      />
      <Button
        variant="secondary"
        label={t('home.endShift')}
        icon="shiftEnd"
        onPress={() => router.push('/shift/close')}
        style={[styles.button, { paddingHorizontal: space.s }]}
      />
    </View>
  );
}

/** The big card: what comes, how long until then, counted down every second. Keyed by the target, so it starts over with a new one. */
function CountdownCard({ title, target, caption, children }: { title: string; target: Timestamp; caption: string; children?: ReactNode }) {
  const { color, typography, space } = useTheme();
  const seconds = useCountdown(target);

  return (
    <Card style={[styles.centre, { paddingVertical: space.xxl, gap: space.xs }]}>
      <View accessible style={[styles.centre, { gap: space.xs }]}>
        <Text style={[typography.siteName, tabular, { color: color.text2 }]}>{title}</Text>
        <Text style={[typography.display, tabular, { color: color.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {countdownText(seconds)}
        </Text>
        <Text style={[typography.siteName, tabular, { color: color.text2 }]}>{caption}</Text>
      </View>
      {children}
    </Card>
  );
}

function closedRoundDetail(round: ClosedRound): string | null {
  if (round.state === 'incomplete') return t('home.skipped', { name: round.missing_names.join(', ') });
  if (round.state === 'missed') return t(round.opened ? 'home.noScans' : 'home.noShift');
  return round.duration_ms === null ? null : t('home.duration', { minutes: Math.max(1, Math.round(round.duration_ms / MINUTE_MS)) });
}

function ClosedRoundRow({ round, time, withRoute }: { round: ClosedRound; time: string; withRoute: boolean }) {
  const { color, typography, size, space, radius, border } = useTheme();
  const detail = [withRoute ? round.route_name : null, closedRoundDetail(round)].filter((part) => part !== null).join(' · ');
  return (
    <View
      accessible
      style={[
        styles.row,
        {
          minHeight: size.listItem,
          paddingHorizontal: space.l,
          paddingVertical: space.s,
          gap: space.m,
          borderRadius: radius.item,
          backgroundColor: color.card,
          borderWidth: border.thin,
          borderColor: color.cardBorder,
        },
      ]}
    >
      <StatusDot status={round.state} />
      <View style={styles.texts}>
        <Text style={[typography.body, tabular, { color: color.text }]}>
          {t('home.closedRound', { time, status: t(statusStyle[round.state].label), done: round.scanned, total: round.total })}
        </Text>
        {detail !== '' && (
          <Text style={[typography.small, { color: color.text2 }]} numberOfLines={2}>
            {detail}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { alignItems: 'center' },
  centredText: { textAlign: 'center' },
  cardTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  row: { flexDirection: 'row', alignItems: 'center' },
  texts: { flex: 1, minWidth: 0 },
  buttons: { flexDirection: 'row' },
  button: { flex: 1 },
  wide: { alignSelf: 'stretch' },
});
