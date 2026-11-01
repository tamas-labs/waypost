import type { Timestamp } from '@waypost/schema';
import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { InfoBanner } from '@/components/info-banner';
import { PIN_LENGTH, PinDots, PinPad } from '@/components/pin-pad';
import { ScreenHeader } from '@/components/screen-header';
import { ShiftTimeline } from '@/components/shift-timeline';
import { StatusDot } from '@/components/status-dot';
import { getDatabase } from '@/db/open';
import { playFeedback } from '@/feedback/feedback';
import { closeShiftWithPin, loadShiftCloseInfo, type ShiftCloseInfo } from '@/guard/shift-close';
import { useLiveQuery } from '@/hooks/use-live-query';
import { usePinEntry } from '@/hooks/use-pin-entry';
import { t, type TranslationKey } from '@/i18n';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';
import { statusStyle, type ColorTokens } from '@/theme/tokens';
import { parseTimestamp } from '@/time/timestamp';
import { localTimeOf } from '@/time/zone';

const STATS = [
  { status: 'completed', label: 'shiftEnd.completed' },
  { status: 'incomplete', label: 'shiftEnd.incomplete' },
  { status: 'missed', label: 'shiftEnd.missed' },
] as const satisfies readonly { status: keyof ShiftCloseInfo['counts']; label: TranslationKey }[];

const loadInfo = () => loadShiftCloseInfo(getDatabase());

/** The summary, reloaded after a chain entry (a round closed meanwhile) and a pull. */
function useShiftCloseInfo(): ShiftCloseInfo | null {
  return useLiveQuery(loadInfo);
}

function StatTile({ status, label, count }: { status: keyof ShiftCloseInfo['counts']; label: string; count: number }) {
  const { color, typography, space, radius, border } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${count} ${label}`}
      style={[
        styles.grow,
        {
          gap: space.xs,
          padding: space.m,
          borderRadius: radius.item,
          borderWidth: border.thin,
          borderColor: color.cardBorder,
          backgroundColor: color.surface,
        },
      ]}
    >
      <StatusDot status={status} />
      <Text style={[typography.title1, styles.tabular, { color: color.text }]}>{count}</Text>
      <Text style={[typography.small, { color: color.text2 }]}>{label}</Text>
    </View>
  );
}

function SummaryRow({
  icon,
  fg,
  bg,
  label,
  count,
}: {
  icon: IconName;
  fg: keyof ColorTokens;
  bg: keyof ColorTokens;
  label: string;
  count: number;
}) {
  const { color, typography, size, space, iconSize } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${count}`}
      style={[styles.row, { minHeight: size.listItem, gap: space.m, paddingHorizontal: space.l }]}
    >
      <View
        style={[
          styles.dot,
          { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2, backgroundColor: color[bg] },
        ]}
      >
        <Icon name={icon} size={iconSize.dot} color={color[fg]} />
      </View>
      <Text style={[typography.body, styles.grow, { color: color.text }]}>{label}</Text>
      <Text style={[typography.buttonSm, styles.tabular, { color: color.text }]}>{count}</Text>
    </View>
  );
}

/** The sheet with the PIN pad. Only the guard's own PIN closes the shift, and then the navigation leaves for the PIN screen. */
function PinSheet({ guardId, onClose }: { guardId: string; onClose: () => void }) {
  const { color, typography, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { pin, shakeKey, checking, locked, messageText, addDigit, deleteDigit, submit } = usePinEntry(
    (entered) => closeShiftWithPin(getDatabase(), guardId, entered),
    'shiftEnd.failed',
    () => playFeedback('success'),
  );
  const enabled = !locked && !checking;

  return (
    <>
      {/* A tap outside the sheet closes it; for a screen reader it is the close button. */}
      <Pressable
        style={[styles.grow, { backgroundColor: color.scrim }]}
        disabled={checking}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
      />
      <View style={[styles.sheet, { backgroundColor: color.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card }]}>
        <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.l }}>
          <Text accessibilityRole="header" style={[typography.title2, styles.centred, { color: color.text }]}>
            {t('shiftEnd.pinTitle')}
          </Text>
          <PinDots entered={pin.length} shakeKey={shakeKey} />
          {messageText !== null && (
            <Text
              style={[typography.body, styles.centred, styles.tabular, { color: color.miss }]}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {messageText}
            </Text>
          )}
          <PinPad disabled={!enabled} onDigit={addDigit} onDelete={deleteDigit} />
          <Button
            label={t(checking ? 'shiftEnd.closing' : 'shiftEnd.confirm')}
            disabled={!enabled || pin.length < PIN_LENGTH}
            onPress={() => void submit()}
          />
        </ScrollView>
      </View>
    </>
  );
}

// Closing the shift (G12, B-Zaras; specification: Műszak 3): how the rounds went, the incidents and unverified points, what
// waits for upload, and a warning about the rounds still open, which close with the shift. The guard's PIN confirms it.
export default function ShiftCloseScreen() {
  const { color, space } = useTheme();
  const insets = useSafeAreaInsets();
  const guardId = useSession(({ activeUser }) => activeUser?.id ?? null);
  const info = useShiftCloseInfo();
  const pending = useSyncStatus(({ pendingCount }) => pendingCount);
  const focused = useIsFocused();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (info === null || guardId === null) {
    // The shift has closed by itself meanwhile: the shift home under this screen logs out.
    return (
      <View style={[styles.grow, { backgroundColor: color.bg }]}>
        <ScreenHeader title={t('shiftEnd.title')} onBack={() => router.back()} />
      </View>
    );
  }

  const time = (at: Timestamp) => localTimeOf(parseTimestamp(at), info.timezone);
  const severalRoutes = new Set(info.rounds.map((round) => round.route_id)).size > 1;

  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader
        title={t('shiftEnd.title')}
        subtitle={t('shiftEnd.subtitle', { name: info.guard_name, from: time(info.started_at), to: time(info.now) })}
        onBack={() => router.back()}
      />
      <ScrollView style={styles.grow} contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.m, gap: space.m }}>
        {info.open_rounds.map((round) => (
          <InfoBanner
            key={`${round.schedule_id}|${round.scheduled_at}`}
            variant="warn"
            title={t('shiftEnd.openRound', {
              round: severalRoutes
                ? `${round.route_name}, ${t('round.title', { time: time(round.scheduled_at) })}`
                : t('round.title', { time: time(round.scheduled_at) }),
            })}
            text={t('shiftEnd.openRoundBody', { done: round.scanned, total: round.total, status: t(statusStyle[round.closes_as].label) })}
          />
        ))}
        <View style={[styles.row, { gap: space.s }]}>
          {STATS.map(({ status, label }) => (
            <StatTile key={status} status={status} label={t(label)} count={info.counts[status]} />
          ))}
        </View>
        {info.rounds.length > 0 && (
          <Card>
            <ShiftTimeline rounds={info.rounds} time={time} variant="compact" />
          </Card>
        )}
        <Card divided>
          <SummaryRow icon="flag" fg="warn" bg="warnBg" label={t('shiftEnd.incidents')} count={info.incidents} />
          <SummaryRow icon="pencil" fg="manual" bg="manualBg" label={t('shiftEnd.manualPoints')} count={info.manual_points} />
        </Card>
        {pending > 0 && <InfoBanner variant="offline" title={t('shiftEnd.queued', { count: pending })} text={t('shiftEnd.queuedBody')} />}
      </ScrollView>
      <View style={{ paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: insets.bottom + space.l }}>
        <Button label={t('shiftEnd.submit')} onPress={() => setSheetOpen(true)} />
      </View>
      {/* It gives way to a screen pushed over this one (an alarm), which it would cover. */}
      <Modal
        visible={sheetOpen && focused}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSheetOpen(false)}
      >
        <PinSheet guardId={guardId} onClose={() => setSheetOpen(false)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
  sheet: { maxHeight: '92%' },
});
