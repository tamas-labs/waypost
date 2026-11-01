import type { Timestamp } from '@waypost/schema';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { IconButton } from '@/components/icon-button';
import { InfoBanner } from '@/components/info-banner';
import { PointListItem, type PointState } from '@/components/point-list-item';
import { ProgressRing } from '@/components/progress';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { SiteMap } from '@/components/site-map';
import { showToast } from '@/components/toast';
import { getDatabase } from '@/db/open';
import { playFeedback, playHaptic } from '@/feedback/feedback';
import { closedStatusOf, loadRoundScreenInfo, markRoundShown, roundMapOf, type RoundPoint, type RoundScreenInfo } from '@/guard/round';
import { useLiveQuery } from '@/hooks/use-live-query';
import { tagReadOf } from '@/guard/scan';
import { useCountdown } from '@/guard/use-countdown';
import { t } from '@/i18n';
import { usePosition } from '@/location/use-position';
import { useScanRecorder } from '@/hooks/use-scan-recorder';
import { openNfcSettings } from '@/nfc/reader';
import type { TagReading } from '@/nfc/tag';
import { useTagReader, type TagReader } from '@/nfc/use-tag-reader';
import { useTheme } from '@/theme/theme-provider';
import { statusStyle, tabular } from '@/theme/tokens';
import { countdownText } from '@/time/countdown';
import { parseTimestamp } from '@/time/timestamp';
import { localTimeOf } from '@/time/zone';

/** The time left turns to the warning colour and vibrates once in the last 5 minutes (DESIGN_HANDOFF 7). */
const WARN_SECONDS = 5 * 60;

type RoundView = 'list' | 'map';
const VIEWS: readonly { value: RoundView; label: string }[] = [
  { value: 'list', label: t('round.list') },
  { value: 'map', label: t('round.map') },
];

interface RoundMessage {
  variant: 'error' | 'info' | 'warn';
  text: string;
}

/** The round, reloaded after a chain entry (a scan, its closing) and a pull. */
function useRoundInfo(roundId: string): RoundScreenInfo | null {
  return useLiveQuery(useCallback(() => loadRoundScreenInfo(getDatabase(), roundId), [roundId]));
}

function pointState(point: RoundPoint): PointState {
  if (point.scan === null) return 'pending';
  if (point.scan.manual) return 'manual';
  return point.scan.out_of_order ? 'wrongOrder' : 'scanned';
}

/** "22:03 · NFC", "22:09 · Kézi – nem igazolt", "22:05 · NFC · Rossz sorrend". */
function pointMeta(point: RoundPoint, timezone: string): string | undefined {
  if (point.scan === null) return undefined;
  const { scanned_at, method, manual, out_of_order } = point.scan;
  const parts = [localTimeOf(parseTimestamp(scanned_at), timezone), manual ? t('round.manualNotVerified') : t(`method.${method}`)];
  if (out_of_order) parts.push(t('status.wrongOrder'));
  return parts.join(' · ');
}

/** The round's map, with the phone's position followed only while it can be seen. */
function RoundMapView({ info, focused }: { info: RoundScreenInfo; focused: boolean }) {
  const { space } = useTheme();
  const position = usePosition(focused);
  const { points, walked, walked_between } = roundMapOf(info.points);
  const time = (at: Timestamp) => localTimeOf(parseTimestamp(at), info.timezone);
  return (
    <SiteMap
      points={points.map((point) => ({
        id: point.checkpoint_id,
        number: point.position,
        name: point.name,
        state: point.state,
        coordinate: point.coordinate,
        accuracy_m: point.accuracy_m,
      }))}
      walked={walked}
      walkedLabel={walked_between === null ? null : t('round.walked', { from: time(walked_between.from), to: time(walked_between.to) })}
      position={position}
      accessibilityLabel={t('round.mapLabel', { scanned: info.scanned, pending: info.points.length - info.scanned })}
      style={{ marginHorizontal: space.l }}
    />
  );
}

/** What the banner above the points says: the first that holds. */
function roundMessage(state: { failed: boolean; invalidTag: boolean; reader: TagReader; hint: boolean }): RoundMessage | null {
  const { failed, invalidTag, reader, hint } = state;
  if (failed) return { variant: 'error', text: t('round.recordFailed') };
  if (invalidTag) return { variant: 'error', text: t('round.tagInvalid') };
  if (reader.error !== null) return { variant: 'error', text: t('round.readFailed') };
  if (reader.status?.supported === false) return { variant: 'info', text: t('round.nfcMissing') };
  if (Platform.OS === 'android' && reader.status?.enabled === false) return { variant: 'warn', text: t('round.nfcOff') };
  return hint ? { variant: 'info', text: t('round.nfcHint') } : null;
}

/** The ways to scan on this screen: tags are recorded as they come, "Leolvasás" and QR by the buttons. */
function useRoundScanning(roundId: string) {
  const scanner = useScanRecorder('push', roundId);
  // Android: what "Leolvasás" says while tags are read anyway.
  const [hint, setHint] = useState(false);
  const [invalidTag, setInvalidTag] = useState(false);

  const onTag = (tag: TagReading) => {
    setHint(false);
    const read = tagReadOf(tag);
    setInvalidTag(read === null);
    if (read === null) playFeedback('error');
    else void scanner.record(read);
  };
  const reader = useTagReader(onTag);

  const openQr = () => router.push({ pathname: '/qr', params: { round_id: roundId } });
  const scan = () => {
    setHint(false);
    if (reader.status?.supported === false) openQr();
    else if (Platform.OS === 'ios') void reader.read();
    else if (reader.status?.enabled === false)
      openNfcSettings().catch((error: unknown) => __DEV__ && console.warn('Opening the NFC settings failed', error));
    else setHint(true);
  };

  return {
    message: roundMessage({ failed: scanner.failed, invalidTag, reader, hint }),
    recording: scanner.recording,
    busy: scanner.recording || reader.reading,
    openQr,
    scan,
  };
}

/** Once the round has closed and this screen is on top again, it leaves. */
function useLeaveClosedRound(roundId: string, over: boolean, focused: boolean) {
  useEffect(() => {
    if (!over || !focused) return;
    // A round completed by a scan has told so on its result.
    const status = closedStatusOf(getDatabase(), roundId);
    if (status === 'incomplete' || status === 'missed') showToast(t('round.closedToast', { status: t(statusStyle[status].label) }), 'warn');
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, [over, focused, roundId]);
}

// The round in progress, as a list (G5, B-Kor; specification: (guard)/round/[id]) or on a map (G6, B-Terkep): how many
// points are done, the time left, the points, and the ways to scan. Android reads tags without a button while the screen
// is focused; iOS reads with "Leolvasás". The screen stays awake, and leaves by itself once the round has closed and it
// is on top again (a scan that completes the round first shows its result).
export default function RoundScreen() {
  const { color, space } = useTheme();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const info = useRoundInfo(id);
  const focused = useIsFocused();
  const scanning = useRoundScanning(id);
  const [view, setView] = useState<RoundView>('list');

  useKeepAwake();
  useEffect(() => markRoundShown(id), [id]);
  useLeaveClosedRound(id, info === null, focused);

  if (info === null) return <View style={[styles.screen, { backgroundColor: color.bg }]} />;

  return (
    <View style={[styles.screen, { backgroundColor: color.bg }]}>
      <ScreenHeader
        title={t('round.title', { time: localTimeOf(parseTimestamp(info.scheduled_at), info.timezone) })}
        subtitle={info.route_name ?? undefined}
        onBack={() => router.back()}
      />
      <View style={{ paddingHorizontal: space.l, paddingBottom: space.m, gap: space.m }}>
        <RoundSummary info={info} view={view} />
        {scanning.message !== null && <InfoBanner variant={scanning.message.variant} text={scanning.message.text} />}
        <SegmentedControl options={VIEWS} value={view} onChange={setView} accessibilityLabel={t('round.view')} />
      </View>
      {view === 'list' ? <RoundPointList info={info} /> : <RoundMapView info={info} focused={focused} />}
      <RoundActions roundId={id} view={view} scanning={scanning} />
    </View>
  );
}

function RoundSummary({ info, view }: { info: RoundScreenInfo; view: RoundView }) {
  const { space } = useTheme();
  return (
    <Card style={[styles.summary, { gap: space.l }]}>
      {view === 'list' && <ProgressRing done={info.scanned} total={info.points.length} />}
      {/* In one place in both views: the warning vibration of the last 5 minutes does not start over. */}
      <TimeLeft key={info.deadline} deadline={info.deadline} timezone={info.timezone} compact={view === 'map'} />
      {view === 'map' && <ProgressRing size="small" done={info.scanned} total={info.points.length} />}
    </Card>
  );
}

function RoundPointList({ info }: { info: RoundScreenInfo }) {
  const { space } = useTheme();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s }}>
      {info.points.map((point) => (
        <PointListItem
          key={point.checkpoint_id}
          name={point.name}
          state={pointState(point)}
          meta={pointMeta(point, info.timezone)}
          position={info.fixed_order && point.scan === null ? point.position : undefined}
        />
      ))}
    </ScrollView>
  );
}

function RoundActions({ roundId, view, scanning }: { roundId: string; view: RoundView; scanning: ReturnType<typeof useRoundScanning> }) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: insets.bottom + space.l, gap: space.m }}>
      {view === 'list' && (
        <View style={[styles.row, { gap: space.s }]}>
          <Button variant="secondary" icon="qr" label={t('round.qr')} onPress={scanning.openQr} />
          <Button
            variant="secondary"
            label={t('round.tagUnreadable')}
            onPress={() => router.push({ pathname: '/manual', params: { round_id: roundId } })}
            style={[styles.grow, { paddingHorizontal: space.s }]}
          />
        </View>
      )}
      <View style={[styles.row, { gap: space.m }]}>
        <IconButton
          size="large"
          icon="flag"
          iconColor="warn"
          accessibilityLabel={t('round.recordIncident')}
          onPress={() => router.push('/incident/new')}
        />
        <Button
          hero
          icon="nfc"
          label={scanning.recording ? t('round.recording') : t('round.scan')}
          disabled={scanning.busy}
          onPress={scanning.scan}
          style={styles.grow}
        />
      </View>
    </View>
  );
}

/** The time left until the deadline: the warning colour and one vibration in the last 5 minutes, the error colour once over. */
function TimeLeft({ deadline, timezone, compact }: { deadline: Timestamp; timezone: string; compact: boolean }) {
  const { color, typography, space } = useTheme();
  const seconds = useCountdown(deadline);
  const lastMinutes = seconds > 0 && seconds <= WARN_SECONDS;
  useEffect(() => {
    if (lastMinutes) playHaptic('warning');
  }, [lastMinutes]);

  const timeColor = seconds === 0 ? color.miss : lastMinutes ? color.warn : color.text;
  return (
    <View accessible style={[styles.grow, { gap: space.xs }]}>
      <Text style={[typography.rowLabel, { color: color.text2 }]}>{t('round.remaining')}</Text>
      <Text
        style={[compact ? typography.counterSm : typography.counter, tabular, { color: timeColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.2}
      >
        {countdownText(seconds)}
      </Text>
      {!compact && (
        <Text style={[typography.rowLabel, tabular, { color: color.text2 }]}>
          {t('round.deadline', { time: localTimeOf(parseTimestamp(deadline), timezone) })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
});
