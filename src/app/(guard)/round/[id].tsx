import type { Timestamp } from '@waypost/schema';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { onChainEntries } from '@/chain/events';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { IconButton } from '@/components/icon-button';
import { InfoBanner } from '@/components/info-banner';
import { PointListItem, type PointState } from '@/components/point-list-item';
import { ProgressRing } from '@/components/progress';
import { ScreenHeader } from '@/components/screen-header';
import { getDatabase } from '@/db/open';
import { playFeedback, playHaptic } from '@/feedback/feedback';
import { loadRoundScreenInfo, markRoundShown, type RoundPoint, type RoundScreenInfo } from '@/guard/round';
import { tagReadOf } from '@/guard/scan';
import { useCountdown } from '@/guard/use-countdown';
import { t } from '@/i18n';
import { useScanRecorder } from '@/navigation/use-scan-recorder';
import { openNfcSettings } from '@/nfc/reader';
import type { TagReading } from '@/nfc/tag';
import { useTagReader } from '@/nfc/use-tag-reader';
import { onConfigurationPulled } from '@/sync/events';
import { useTheme } from '@/theme/theme-provider';
import { countdownText } from '@/time/countdown';
import { parseTimestamp } from '@/time/timestamp';
import { localTimeOf } from '@/time/zone';

/** The time left turns to the warning colour and vibrates once in the last 5 minutes (DESIGN_HANDOFF 7). */
const WARN_SECONDS = 5 * 60;

/** The round, reloaded after a chain entry (a scan, its closing) and a pull. */
function useRoundInfo(roundId: string): RoundScreenInfo | null {
  const load = useCallback(() => loadRoundScreenInfo(getDatabase(), roundId), [roundId]);
  const [info, setInfo] = useState(load);
  useEffect(() => {
    const reload = () => setInfo(load());
    const stops = [onConfigurationPulled(reload), onChainEntries(reload)];
    return () => stops.forEach((stop) => stop());
  }, [load]);
  return info;
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

// The round in progress, as a list (G5, B-Kor; specification: (guard)/round/[id]): how many points are done, the time
// left, the points, and the ways to scan. Android reads tags without a button while the screen is focused; iOS reads
// with "Leolvasás". The screen stays awake, and leaves by itself once the round has closed and it is on top again (a
// scan that completes the round first shows its result).
export default function RoundScreen() {
  const { color, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const info = useRoundInfo(id);
  const focused = useIsFocused();
  const scanner = useScanRecorder('push');
  // Android: what "Leolvasás" says while tags are read anyway.
  const [hint, setHint] = useState(false);
  const [invalidTag, setInvalidTag] = useState(false);

  useKeepAwake();
  useEffect(() => markRoundShown(id), [id]);

  const over = info === null;
  useEffect(() => {
    if (!over || !focused) return;
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, [over, focused]);

  const onTag = (tag: TagReading) => {
    setHint(false);
    const read = tagReadOf(tag);
    setInvalidTag(read === null);
    if (read === null) playFeedback('error');
    else void scanner.record(read);
  };
  const reader = useTagReader(onTag);
  const status = reader.status;

  const openQr = () => router.push('/qr');
  const scan = () => {
    setHint(false);
    if (status?.supported === false) openQr();
    else if (Platform.OS === 'ios') void reader.read();
    else if (status?.enabled === false) openNfcSettings().catch((error: unknown) => __DEV__ && console.warn('Opening the NFC settings failed', error));
    else setHint(true);
  };

  if (info === null) return <View style={[styles.screen, { backgroundColor: color.bg }]} />;

  const message = scanner.failed
    ? { variant: 'error' as const, text: t('round.recordFailed') }
    : invalidTag
      ? { variant: 'error' as const, text: t('round.tagInvalid') }
      : reader.error !== null
        ? { variant: 'error' as const, text: t('round.readFailed') }
        : status?.supported === false
          ? { variant: 'info' as const, text: t('round.nfcMissing') }
          : Platform.OS === 'android' && status?.enabled === false
            ? { variant: 'warn' as const, text: t('round.nfcOff') }
            : hint
              ? { variant: 'info' as const, text: t('round.nfcHint') }
              : null;

  return (
    <View style={[styles.screen, { backgroundColor: color.bg }]}>
      <ScreenHeader title={t('round.title', { time: localTimeOf(parseTimestamp(info.scheduled_at), info.timezone) })} subtitle={info.route_name ?? undefined} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: space.l, paddingBottom: space.m, gap: space.m }}>
        <Card style={[styles.summary, { gap: space.l }]}>
          <ProgressRing done={info.scanned} total={info.points.length} />
          <TimeLeft key={info.deadline} deadline={info.deadline} timezone={info.timezone} />
        </Card>
        {message !== null && <InfoBanner variant={message.variant} text={message.text} />}
      </View>

      <ScrollView style={styles.screen} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s }}>
        {info.points.map((point) => (
          <PointListItem key={point.checkpoint_id} name={point.name} state={pointState(point)} meta={pointMeta(point, info.timezone)} position={info.fixed_order && point.scan === null ? point.position : undefined} />
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: insets.bottom + space.l, gap: space.m }}>
        <View style={[styles.row, { gap: space.s }]}>
          <Button variant="secondary" icon="qr" label={t('round.qr')} onPress={openQr} />
          <Button variant="secondary" label={t('round.tagUnreadable')} onPress={() => router.push({ pathname: '/manual', params: { round_id: id } })} style={[styles.grow, { paddingHorizontal: space.s }]} />
        </View>
        <View style={[styles.row, { gap: space.m }]}>
          <IconButton size="large" icon="flag" iconColor="warn" accessibilityLabel={t('round.recordIncident')} onPress={() => router.push('/incident/new')} />
          <Button hero icon="nfc" label={scanner.recording ? t('round.recording') : t('round.scan')} disabled={scanner.recording || reader.reading} onPress={scan} style={styles.grow} />
        </View>
      </View>
    </View>
  );
}

/** The time left until the deadline: the warning colour and one vibration in the last 5 minutes, the error colour once over. */
function TimeLeft({ deadline, timezone }: { deadline: Timestamp; timezone: string }) {
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
      <Text style={[typography.counter, styles.tabular, { color: timeColor }]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>
        {countdownText(seconds)}
      </Text>
      <Text style={[typography.rowLabel, styles.tabular, { color: color.text2 }]}>{t('round.deadline', { time: localTimeOf(parseTimestamp(deadline), timezone) })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
});
