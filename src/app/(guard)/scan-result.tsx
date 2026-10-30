import type { Timestamp } from '@waypost/schema';
import { router, useIsFocused, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { ProgressSegments } from '@/components/progress';
import { ResultScreen } from '@/components/result-screen';
import { StatusDot } from '@/components/status-dot';
import { SyncStatusIndicator } from '@/components/sync-status-indicator';
import { getDatabase } from '@/db/open';
import type { RoundPoint, RoundScreenInfo } from '@/guard/round';
import { loadScanResultInfo, type ScanResultInfo } from '@/guard/scan-result';
import { useCountdown } from '@/guard/use-countdown';
import { t } from '@/i18n';
import { formatTagUid } from '@/nfc/tag';
import { useTheme } from '@/theme/theme-provider';
import type { ColorTokens } from '@/theme/tokens';
import { countdownText } from '@/time/countdown';
import { parseTimestamp } from '@/time/timestamp';
import { localTimeOf } from '@/time/zone';

/** A success closes itself after this long (DESIGN_HANDOFF 5.17). */
const AUTO_CLOSE_SECONDS = 3;

// The params of useScanRecorder (scanResultParams).
type ResultParams = {
  kind: string;
  scan_id: string;
  checkpoint_id: string;
  round_id: string;
  scanned_at: string;
  out_of_order: string;
  completed: string;
  method: string;
  read_id: string;
};

/** Leaves once: a second tap, or the timer in the same moment, must not pop the round's screen as well. */
function useLeave(): (next?: Href) => void {
  const left = useRef(false);
  return useCallback((next?: Href) => {
    if (left.current) return;
    left.current = true;
    if (next !== undefined) router.replace(next);
    else if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, []);
}

/** The seconds until the screen closes itself; they stop while another screen (an alarm) is on top. */
function useAutoClose(onClose: () => void): number {
  const focused = useIsFocused();
  const [seconds, setSeconds] = useState(AUTO_CLOSE_SECONDS);
  useEffect(() => {
    if (!focused) return;
    if (seconds === 0) {
      onClose();
      return;
    }
    const timeout = setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => clearTimeout(timeout);
  }, [focused, seconds, onClose]);
  return seconds;
}

function segmentOf(point: RoundPoint): keyof ColorTokens | null {
  if (point.scan === null) return null;
  if (point.scan.manual) return 'manual';
  return point.scan.out_of_order ? 'warn' : 'ok';
}

/** The round and the sync indicator; a scan out of round has only the latter. */
function ResultHeader({ round }: { round: RoundScreenInfo | null }) {
  const { color, typography, space } = useTheme();
  const title = round === null ? '' : [t('round.title', { time: localTimeOf(parseTimestamp(round.scheduled_at), round.timezone) }), round.route_name].filter((part) => part !== null).join(' · ');
  return (
    <View style={[styles.row, { gap: space.m }]}>
      <Text style={[typography.body, styles.grow, { color: color.text }]} numberOfLines={1}>
        {title}
      </Text>
      <SyncStatusIndicator />
    </View>
  );
}

function TimeLeftText({ deadline, left }: { deadline: Timestamp; left: number }) {
  const { color, typography } = useTheme();
  const seconds = useCountdown(deadline);
  return <Text style={[typography.small, styles.tabular, { color: color.text2 }]}>{t('scanResult.progressRest', { left, time: countdownText(seconds) })}</Text>;
}

/** How far the round is (B-Siker): "6 / 9 pont", what is left, a segment per point. */
function ProgressCard({ round, completed }: { round: RoundScreenInfo; completed: boolean }) {
  const { color, typography, space } = useTheme();
  const total = round.points.length;
  return (
    <Card style={{ gap: space.s }}>
      <View style={[styles.row, styles.wrap, { gap: space.s }]}>
        <Text style={[typography.title2, styles.tabular, styles.grow, { color: color.text }]}>{t('scanResult.progress', { done: round.scanned, total })}</Text>
        {completed ? <Text style={[typography.small, { color: color.ok }]}>{t('status.completed')}</Text> : <TimeLeftText key={round.deadline} deadline={round.deadline} left={total - round.scanned} />}
      </View>
      <ProgressSegments segments={round.points.map(segmentOf)} />
    </Card>
  );
}

function SuccessResult({ info, scan, params, leave }: { info: ScanResultInfo; scan: NonNullable<ScanResultInfo['scan']>; params: Partial<ResultParams>; leave: (next?: Href) => void }) {
  const { color, typography, space, radius, border, iconSize, fontFamily } = useTheme();
  const close = useCallback(() => leave(), [leave]);
  const seconds = useAutoClose(close);
  const instruction = info.point?.instruction ?? null;
  const time = localTimeOf(parseTimestamp(scan.scanned_at), info.timezone);
  return (
    <ResultScreen
      tone="ok"
      icon="check"
      statusLine={scan.method === 'manual' ? t('scanResult.manualLine', { time, method: t('round.manualNotVerified') }) : t('scanResult.successLine', { time, method: t(`method.${scan.method}`) })}
      title={info.point?.name ?? ''}
      header={<ResultHeader round={info.round} />}
      actions={
        <>
          <Button hero label={t('scanResult.next', { seconds })} onPress={close} />
          <Button variant="secondary" icon="flag" iconColor="warn" label={t('scanResult.incidentHere')} onPress={() => leave({ pathname: '/incident/new', params: { checkpoint_id: params.checkpoint_id } })} />
        </>
      }
    >
      {info.round !== null && <ProgressCard round={info.round} completed={params.completed === 'true'} />}
      {instruction !== null && (
        <View style={[styles.instruction, { padding: space.l, gap: space.m, borderRadius: radius.item, borderWidth: border.thick, borderStyle: 'dashed', borderColor: color.dash }]}>
          <Icon name="info" size={iconSize.field} color={color.accent} />
          <Text style={[typography.bodyRegular, styles.grow, { color: color.text }]}>
            <Text style={{ fontFamily: fontFamily.extrabold }}>{`${t('scanResult.instruction')} `}</Text>
            {instruction}
          </Text>
        </View>
      )}
    </ResultScreen>
  );
}

function UnknownResult({ info, params, leave }: { info: ScanResultInfo; params: Partial<ResultParams>; leave: (next?: Href) => void }) {
  const { color, typography, space } = useTheme();
  const qr = params.method === 'qr';
  const readId = params.read_id ?? '';
  const roundId = params.round_id ?? '';
  return (
    <ResultScreen
      tone="miss"
      icon="x"
      statusLine={t('scanResult.unknownLine')}
      title={t('scanResult.unknownTitle')}
      body={t('scanResult.unknownBody')}
      header={<ResultHeader round={info.round} />}
      actions={
        <>
          <Button hero label={t('scanResult.retry')} onPress={() => leave(qr ? { pathname: '/qr', params: { round_id: roundId } } : undefined)} />
          {info.round_open && <Button variant="secondary" icon="pencil" iconColor="manual" label={t('scanResult.damaged')} onPress={() => leave({ pathname: '/manual', params: { round_id: roundId } })} />}
        </>
      }
    >
      <Card style={{ gap: space.xs }}>
        <Text style={[typography.small, { color: color.text2 }]}>{t('scanResult.readId')}</Text>
        <Text style={[typography.body, styles.tabular, { color: color.text }]}>{`${t(qr ? 'method.qr' : 'method.nfc')} · ${qr ? readId : formatTagUid(readId)}`}</Text>
      </Card>
    </ResultScreen>
  );
}

function ComparedPoint({ number, tone, label, name }: { number: number; tone: 'warn' | 'next'; label: string; name: string }) {
  const { color, typography, size, space } = useTheme();
  return (
    <View style={[styles.row, { minHeight: size.listItem, paddingHorizontal: space.l, paddingVertical: space.s, gap: space.m }]}>
      <StatusDot number={number} tone={tone} />
      <View style={styles.grow}>
        <Text style={[typography.small, { color: color.text2 }]}>{label}</Text>
        <Text style={[typography.body, { color: color.text }]}>{name}</Text>
      </View>
    </View>
  );
}

function OrderResult({ info, params, leave }: { info: ScanResultInfo; params: Partial<ResultParams>; leave: () => void }) {
  const { color, typography } = useTheme();
  const scanned = info.round?.points.find((point) => point.checkpoint_id === params.checkpoint_id);
  const next = info.next_point;
  return (
    <ResultScreen tone="warn" icon="swap" statusLine={t('scanResult.orderLine')} title={t('scanResult.orderTitle')} header={<ResultHeader round={info.round} />} actions={<Button hero label={t('scanResult.ok')} onPress={leave} />}>
      {scanned !== undefined && next !== null && (
        <>
          <Card divided>
            <ComparedPoint number={scanned.position} tone="warn" label={t('scanResult.youScanned')} name={scanned.name} />
            <ComparedPoint number={next.position} tone="next" label={t('scanResult.expected')} name={next.name} />
          </Card>
          <Text style={[typography.bodyRegular, styles.centered, { color: color.text2 }]}>{t('scanResult.orderBody', { expected: next.name })}</Text>
        </>
      )}
    </ResultScreen>
  );
}

/** The point in a warning without a screen of its own in the design: already scanned, or out of round. */
function PointNotice({ statusLine, name, body, round, icon, leave }: { statusLine: string; name: string; body: string; round: RoundScreenInfo | null; icon: 'check' | 'mapPin'; leave: () => void }) {
  return <ResultScreen tone="warn" icon={icon} statusLine={statusLine} title={name} body={body} header={<ResultHeader round={round} />} actions={<Button hero label={t('scanResult.ok')} onPress={leave} />} />;
}

// The result of a scan (G7–G9; specification: (guard)/scan-result), over the round's screen. The feedback has already
// played when the scan was recorded (useScanRecorder). A success closes itself, the others wait for the guard.
export default function ScanResultScreen() {
  const { color } = useTheme();
  const params = useLocalSearchParams<ResultParams>() as Partial<ResultParams>;
  const [info] = useState(() => loadScanResultInfo(getDatabase(), params));
  const leave = useLeave();
  const back = useCallback(() => leave(), [leave]);

  const { kind, scanned_at } = params;
  const content = (() => {
    if (info === null) return null;
    const name = info.point?.name ?? '';
    if (kind === 'unknown_tag') return <UnknownResult info={info} params={params} leave={leave} />;
    if (kind === 'already_scanned' && scanned_at !== undefined) {
      return <PointNotice icon="check" statusLine={t('scanResult.alreadyLine', { time: localTimeOf(parseTimestamp(scanned_at), info.timezone) })} name={name} body={t('scanResult.alreadyBody')} round={info.round} leave={back} />;
    }
    if (kind !== 'recorded' || info.scan === null) return null;
    if (params.round_id === undefined) return <PointNotice icon="mapPin" statusLine={t('scanResult.orderLine')} name={name} body={t('scanResult.outOfRoundBody')} round={null} leave={back} />;
    if (params.out_of_order === 'true') return <OrderResult info={info} params={params} leave={back} />;
    return <SuccessResult info={info} scan={info.scan} params={params} leave={leave} />;
  })();

  // Only a link from outside can bring here without a result.
  const empty = content === null;
  useEffect(() => {
    if (empty) back();
  }, [empty, back]);

  return content ?? <View style={[styles.grow, { backgroundColor: color.bg }]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexWrap: 'wrap' },
  grow: { flex: 1 },
  instruction: { flexDirection: 'row', alignItems: 'flex-start' },
  centered: { textAlign: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
});
