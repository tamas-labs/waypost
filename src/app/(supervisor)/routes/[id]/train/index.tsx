import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { InfoBanner, type InfoBannerVariant } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { showToast } from '@/components/toast';
import { getDatabase } from '@/db/open';
import { defaultTimeLimit } from '@/domain/deadline';
import {
  ROUTE_NAME_MAX,
  TrainingError,
  elapsedMs,
  removePoint,
  setOrderMode,
  setRouteName,
  walkDuration,
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
import { formatWalk } from '@/supervisor/site-detail';
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
// cross discards it. The counter and the walk times run on the monotonic clock; the screen stays awake.
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
      <Modal
        visible={finishing}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setFinishing(false)}
      >
        <FinishSheet draft={draft} change={change} onClose={() => setFinishing(false)} />
      </Modal>
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

/** A new point opens its details (S6) to change them or take it out; an existing checkpoint can only be taken out. */
function PointList({ draft, onRemove }: { draft: TrainingDraft; onRemove: (point: TrainingPoint) => void }) {
  const { color, typography, space, size, radius, border } = useTheme();
  const times = walkTimes(draft);
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
          position={index + 1}
          point={point}
          walk={walkText(times[index] ?? null, index)}
          onPress={() => open(point)}
        />
      ))}
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
          <Text style={[typography.badge, tabular, { color: color.text2 }]}>{draft.points.length + 1}</Text>
        </View>
        <Text style={[typography.body, styles.grow, { color: color.text2 }]}>{t('training.goNext')}</Text>
      </View>
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

function TrainingActions({
  scanning,
  canFinish,
  onFinish,
}: {
  scanning: ReturnType<typeof useTrainingScanning>;
  canFinish: boolean;
  onFinish: () => void;
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
        <Button variant="secondary" icon="qr" label={t('training.qr')} onPress={scanning.openQr} />
        <Button variant="secondary" label={t('training.finish')} disabled={!canFinish} onPress={onFinish} style={styles.grow} />
      </View>
    </View>
  );
}

/**
 * The end of the walk: the total time, the time limit it suggests for a schedule (M3-14), the name of a new route, and
 * the save as the route's new version. What stops the save is told here; the draft stays as it was.
 */
function FinishSheet({ draft, change, onClose }: { draft: TrainingDraft; change: (next: TrainingDraft) => void; onClose: () => void }) {
  const { color, typography, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const offline = useSyncStatus((state) => state.online === false);
  const isNew = draft.saved_order_mode === null;
  const [name, setName] = useState(draft.route.name);
  const [nameMissing, setNameMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walk = walkDuration(draft);

  const save = () => {
    const named = isNew ? setRouteName(draft, name) : draft;
    if (named !== draft) change(named);
    try {
      saveTraining(getDatabase(), named);
    } catch (e) {
      if (e instanceof TrainingError && e.code === 'route_name_required') setNameMissing(true);
      else setError(trainingErrorText(e, named));
      return;
    }
    showToast(t('training.saved', { name: routeTitle(named) }));
    onClose();
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.grow}>
      <Pressable
        style={[styles.grow, { backgroundColor: color.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
      />
      <View style={[styles.sheet, { backgroundColor: color.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card }]}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.l }}
        >
          <Text accessibilityRole="header" style={[typography.title2, { color: color.text }]}>
            {t('training.finishTitle')}
          </Text>
          <Card divided>
            <SummaryRow label={t('training.totalTime')} value={walk === null ? t('training.noMeasure') : formatWalk(walk)} />
            <SummaryRow
              label={t('training.suggestedLimit')}
              value={t('training.suggestedLimitValue', { minutes: defaultTimeLimit(walk) })}
              hint={t('training.suggestedHint')}
            />
            <SummaryRow label={t('training.pointsCount')} value={String(draft.points.length)} />
          </Card>
          {isNew && (
            <TextField
              label={t('training.routeName')}
              requirement="required"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setNameMissing(false);
              }}
              error={nameMissing ? t('training.routeNameMissing') : undefined}
              maxLength={ROUTE_NAME_MAX}
              autoCapitalize="sentences"
              returnKeyType="done"
            />
          )}
          {offline && <InfoBanner variant="offline" icon="cloudOff" text={t('training.saveOfflineNote')} />}
          {error !== null && (
            <View accessibilityLiveRegion="polite" accessibilityRole="alert">
              <InfoBanner variant="error" text={error} />
            </View>
          )}
          <Button label={t('training.saveVersion')} onPress={save} />
          <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { color, typography, space, size } = useTheme();
  return (
    <View
      accessible
      style={{ minHeight: size.listItem, paddingHorizontal: space.l, paddingVertical: space.m, gap: space.xs, justifyContent: 'center' }}
    >
      <View style={[styles.row, styles.spread, { gap: space.m }]}>
        <Text style={[typography.body, styles.grow, { color: color.text }]}>{label}</Text>
        <Text style={[typography.buttonSm, tabular, { color: color.text }]}>{value}</Text>
      </View>
      {hint !== undefined && <Text style={[typography.small, { color: color.text2 }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  spread: { justifyContent: 'space-between' },
  end: { alignItems: 'flex-end' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  sheet: { maxHeight: '92%' },
});
