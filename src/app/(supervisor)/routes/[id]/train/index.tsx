import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { InfoBanner, type InfoBannerVariant } from '@/components/info-banner';
import { FinishSheet } from '@/components/training/finish-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { SheetModal } from '@/components/sheet';
import { SegmentedControl } from '@/components/segmented-control';
import { showToast } from '@/components/toast';
import { getDatabase } from '@/db/open';
import {
  elapsedMs,
  pointsBefore,
  removePoint,
  setOrderMode,
  walkTimes,
  type OrderMode,
  type TrainingDraft,
  type TrainingInstant,
  type TrainingPoint,
} from '@/domain/training';
import { tagReadOf } from '@/guard/scan';
import { trainingNow, useTrainingDraft, useTrainingReader } from '@/hooks/use-training';
import { t } from '@/i18n';
import { openNfcSettings } from '@/nfc/reader';
import { useTagReader } from '@/nfc/use-tag-reader';
import { nextVersionNumber } from '@/supervisor/route-version';
import { discardTrainingDraft, saveTraining } from '@/supervisor/training';
import { elapsedText, pointMeta, routeTitle, trainingErrorText, walkText } from '@/supervisor/training-view';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';

const ORDER_MODES: readonly { value: OrderMode; label: string }[] = [
  { value: 'free', label: t('training.free') },
  { value: 'fixed', label: t('training.fixed') },
];

interface Message {
  variant: InfoBannerVariant;
  text: string;
}

/** The monotonic clock, read every second for the counter. */
function useNow(): TrainingInstant {
  const [now, setNow] = useState(trainingNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(trainingNow()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The ways to scan: Android reads tags while the screen is focused, iOS with "Pont leolvasása"; QR by its button. */
function useTrainingScanning(routeId: string) {
  const reader = useTrainingReader(routeId, 'push');
  // Android: what "Pont leolvasása" says while tags are read anyway.
  const [hint, setHint] = useState(false);
  const tags = useTagReader((tag) => {
    setHint(false);
    void reader.handle(tagReadOf(tag));
  });

  const openQr = () => router.push({ pathname: '/routes/[id]/train/qr', params: { id: routeId } });
  const scan = () => {
    setHint(false);
    if (tags.status?.supported === false) openQr();
    else if (Platform.OS === 'ios') void tags.read();
    else if (tags.status?.enabled === false)
      openNfcSettings().catch((error: unknown) => __DEV__ && console.warn('Opening the NFC settings failed', error));
    else setHint(true);
  };

  let message: Message | null = reader.message;
  if (message === null) {
    if (tags.error !== null) message = { variant: 'error', text: t('training.readFailed') };
    else if (tags.status?.supported === false) message = { variant: 'info', text: t('training.nfcMissing') };
    else if (Platform.OS === 'android' && tags.status?.enabled === false) message = { variant: 'warn', text: t('training.nfcOff') };
    else if (hint) message = { variant: 'info', text: t('training.nfcHint') };
  }
  return { message, locating: reader.locating, busy: reader.locating || tags.reading, openQr, scan };
}

// Training a route (S5, S-Betanitas; specification: (supervisor)/routes/[id]/train): the supervisor walks the route and
// scans its tags; a point goes through the point screen (S6) into the draft, which stays on the phone until it is saved
// as a new route version or discarded. Leaving by the back gesture keeps the draft (the site details continue it); the
// cross discards it. The counter and the walk times run on the monotonic clock; the screen stays awake. A training of
// one point (S7 "Új pont felvétele") scans only the new point, which goes to the end of the route's current version:
// no counter, no order, and its save is at once the new version.
export default function TrainingScreen() {
  const { color, space } = useTheme();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { draft, change } = useTrainingDraft(id);
  const scanning = useTrainingScanning(id);
  const [finishing, setFinishing] = useState(false);
  useKeepAwake();

  if (draft === null) {
    return (
      <View style={[styles.grow, { backgroundColor: color.bg }]}>
        <ScreenHeader onBack={() => router.back()} />
        <View style={{ padding: space.l }}>
          <InfoBanner variant="warn" text={t('training.missing')} />
        </View>
      </View>
    );
  }

  const cancel = () => {
    const leave = () => {
      discardTrainingDraft(getDatabase());
      router.back();
    };
    if (draft.points.length === 0) {
      leave();
      return;
    }
    Alert.alert(t('training.cancelTitle'), t('training.cancelConfirm'), [
      { text: t('training.cancelKeep'), style: 'cancel' },
      { text: t('training.cancelDiscard'), style: 'destructive', onPress: leave },
    ]);
  };

  if (draft.adding != null) return <AddPoint draft={draft} change={change} scanning={scanning} onCancel={cancel} />;

  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader
        overline={t('training.label')}
        title={routeTitle(draft)}
        onBack={cancel}
        backIcon="x"
        backLabel={t('training.cancel')}
      />
      <View style={{ paddingHorizontal: space.l, paddingBottom: space.m, gap: space.m }}>
        <TrainingSummary draft={draft} />
        <SegmentedControl
          options={ORDER_MODES}
          value={draft.route.order_mode}
          onChange={(mode) => change(setOrderMode(draft, mode))}
          accessibilityLabel={t('training.order')}
        />
        {scanning.message !== null && (
          <View accessibilityLiveRegion="polite">
            <InfoBanner variant={scanning.message.variant} text={scanning.message.text} />
          </View>
        )}
      </View>
      <PointList draft={draft} onRemove={(point) => change(removePoint(draft, point.checkpoint_id))} />
      <TrainingActions scanning={scanning} canFinish={draft.points.length > 0} onFinish={() => setFinishing(true)} />
      <SheetModal visible={finishing} onClose={() => setFinishing(false)}>
        <FinishSheet
          draft={draft}
          change={change}
          onSave={(named) => saveTraining(getDatabase(), named)}
          onClose={() => setFinishing(false)}
        />
      </SheetModal>
    </View>
  );
}

function TrainingSummary({ draft }: { draft: TrainingDraft }) {
  const { color, typography, space } = useTheme();
  const now = useNow();
  return (
    <Card style={[styles.row, styles.spread, { gap: space.m }]}>
      <View accessible style={{ gap: space.xs }}>
        <Text style={[typography.rowLabel, { color: color.text2 }]}>{t('training.elapsed')}</Text>
        <Text style={[typography.counter, tabular, { color: color.text }]} maxFontSizeMultiplier={1.2}>
          {elapsedText(elapsedMs(draft, now))}
        </Text>
      </View>
      <View accessible style={[styles.end, { gap: space.xs }]}>
        <Text style={[typography.rowLabel, { color: color.text2 }]}>{t('training.recorded')}</Text>
        <Text style={[typography.title1, tabular, { color: color.text }]} maxFontSizeMultiplier={1.2}>
          {draft.points.length}
        </Text>
      </View>
    </Card>
  );
}

/**
 * The point of a training of one point (S7 → S5): the route's points stay as they are, the new one goes after them.
 * The tag is read like on the walk; once the point is there, its save is the new version.
 */
function AddPoint({
  draft,
  change,
  scanning,
  onCancel,
}: {
  draft: TrainingDraft;
  change: (next: TrainingDraft) => void;
  scanning: ReturnType<typeof useTrainingScanning>;
  onCancel: () => void;
}) {
  const { color, space } = useTheme();
  const insets = useSafeAreaInsets();
  const offline = useSyncStatus((state) => state.online === false);
  const [error, setError] = useState<string | null>(null);
  const version = nextVersionNumber(getDatabase(), draft.route.id);
  const added = draft.points[0];

  const save = () => {
    try {
      saveTraining(getDatabase(), draft);
    } catch (e) {
      setError(trainingErrorText(e, draft));
      return;
    }
    showToast(t('training.addSaved', { name: added?.name ?? '', version }));
    router.back();
  };

  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader
        overline={t('training.addLabel')}
        title={routeTitle(draft)}
        onBack={onCancel}
        backIcon="x"
        backLabel={t('training.cancel')}
      />
      <View style={{ paddingHorizontal: space.l, paddingBottom: space.m, gap: space.m }}>
        <InfoBanner variant="info" text={t('training.addInfo', { position: pointsBefore(draft) + 1 })} />
        {added === undefined && scanning.message !== null && (
          <View accessibilityLiveRegion="polite">
            <InfoBanner variant={scanning.message.variant} text={scanning.message.text} />
          </View>
        )}
      </View>
      <PointList draft={draft} onRemove={(point) => change(removePoint(draft, point.checkpoint_id))} />
      {added === undefined ? (
        <TrainingActions scanning={scanning} />
      ) : (
        <View style={{ paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: insets.bottom + space.l, gap: space.m }}>
          {offline && <InfoBanner variant="offline" icon="cloudOff" text={t('training.saveOfflineNote')} />}
          {error !== null && (
            <View accessibilityLiveRegion="polite" accessibilityRole="alert">
              <InfoBanner variant="error" text={error} />
            </View>
          )}
          <Button label={t('routeEdit.saveAs', { version })} onPress={save} />
        </View>
      )}
    </View>
  );
}

/** A new point opens its details (S6) to change them or take it out; an existing checkpoint can only be taken out. */
function PointList({ draft, onRemove }: { draft: TrainingDraft; onRemove: (point: TrainingPoint) => void }) {
  const { color, typography, space, size, radius, border } = useTheme();
  const times = walkTimes(draft);
  // A training of one point: after the route's points, and its walk from them was not measured.
  const before = pointsBefore(draft);
  const open = (point: TrainingPoint) =>
    point.kind === 'new'
      ? router.push({ pathname: '/routes/[id]/train/point', params: { id: draft.route.id, edit: point.checkpoint_id } })
      : Alert.alert(point.name, t('training.removeConfirm'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('training.remove'), style: 'destructive', onPress: () => onRemove(point) },
        ]);
  return (
    <ScrollView style={styles.grow} contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.s, gap: space.s }}>
      {draft.points.map((point, index) => (
        <TrainingPointRow
          key={point.checkpoint_id}
          position={before + index + 1}
          point={point}
          walk={walkText(times[index] ?? null, before + index)}
          onPress={() => open(point)}
        />
      ))}
      {(draft.adding == null || draft.points.length === 0) && (
        <View
          style={[
            styles.row,
            {
              minHeight: size.listItem,
              paddingHorizontal: space.l,
              gap: space.m,
              borderRadius: radius.item,
              borderWidth: border.thick,
              borderStyle: 'dashed',
              borderColor: color.dash,
            },
          ]}
        >
          <View
            style={[
              styles.centre,
              {
                width: size.statusDot,
                height: size.statusDot,
                borderRadius: size.statusDot / 2,
                borderWidth: border.ring,
                borderColor: color.pending,
              },
            ]}
          >
            <Text style={[typography.badge, tabular, { color: color.text2 }]}>{before + draft.points.length + 1}</Text>
          </View>
          <Text style={[typography.body, styles.grow, { color: color.text2 }]}>
            {t(draft.adding == null ? 'training.goNext' : 'training.goNew')}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

/** A recorded point: its position, name, "NFC · utasítás · GPS ±4 m", and the walk from the previous one. A press offers taking it out. */
function TrainingPointRow({
  position,
  point,
  walk,
  onPress,
}: {
  position: number;
  point: TrainingPoint;
  walk: string;
  onPress: () => void;
}) {
  const { color, typography, space, size, radius, border } = useTheme();
  const meta = pointMeta(point);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('training.pointLabel', { n: position, name: point.name, meta, walk })}
      accessibilityHint={t(point.kind === 'new' ? 'training.editHint' : 'training.removeHint')}
      onPress={onPress}
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
      <View
        style={[
          styles.centre,
          { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2, backgroundColor: color.runBg },
        ]}
      >
        <Text style={[typography.badge, tabular, { color: color.run }]}>{position}</Text>
      </View>
      <View style={styles.grow}>
        <Text style={[typography.body, { color: color.text }]}>{point.name}</Text>
        <Text style={[typography.small, tabular, { color: color.text2 }]}>{meta}</Text>
      </View>
      <Text style={[typography.buttonSm, tabular, { color: color.text2 }]}>{walk}</Text>
    </Pressable>
  );
}

/** Scanning, and the end of the walk; a training of one point has no end of its own: its point is saved. */
function TrainingActions({
  scanning,
  canFinish = false,
  onFinish,
}: {
  scanning: ReturnType<typeof useTrainingScanning>;
  canFinish?: boolean;
  onFinish?: () => void;
}) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: insets.bottom + space.l, gap: space.m }}>
      <Button
        hero
        icon="nfc"
        label={scanning.locating ? t('training.locating') : t('training.scanPoint')}
        disabled={scanning.busy}
        onPress={scanning.scan}
      />
      <View style={[styles.row, { gap: space.s }]}>
        <Button
          variant="secondary"
          icon="qr"
          label={t('training.qr')}
          onPress={scanning.openQr}
          style={onFinish === undefined ? styles.grow : undefined}
        />
        {onFinish !== undefined && (
          <Button variant="secondary" label={t('training.finish')} disabled={!canFinish} onPress={onFinish} style={styles.grow} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  spread: { justifyContent: 'space-between' },
  end: { alignItems: 'flex-end' },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
