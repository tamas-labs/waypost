import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LocationFix } from '@/chain/payloads';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { InfoBanner } from '@/components/info-banner';
import { PhotoField } from '@/components/photo-field';
import { PointListItem } from '@/components/point-list-item';
import { ScreenHeader } from '@/components/screen-header';
import { StatusBadge } from '@/components/status-badge';
import { TextArea } from '@/components/text-field';
import { getDatabase } from '@/db/open';
import { DomainError } from '@/domain/state';
import { playFeedback } from '@/feedback/feedback';
import { trustedNowMs } from '@/guard/home';
import { loadRoundScreenInfo, type RoundPoint } from '@/guard/round';
import { nearestOf, recordManualEntry, scanFeedback } from '@/guard/scan';
import { t } from '@/i18n';
import { currentLocation } from '@/location/location';
import { pointResultParams } from '@/navigation/use-scan-recorder';
import { usePhotoDraft } from '@/photo/use-photo-draft';
import { useTheme } from '@/theme/theme-provider';
import { localTimeOf } from '@/time/zone';

/** The limit of the note in the chain's payloads (payload-scan, payload-incident). */
const NOTE_MAX_LENGTH = 2000;

function ManualHeader() {
  return <ScreenHeader title={t('manual.title')} onBack={() => router.back()} right={<StatusBadge status="manual" />} />;
}

/** The row that shows the chosen point (B-Kezi), and the sheet with the points left. */
function PointPicker({ points, value, onChange, disabled, fixedOrder }: { points: readonly RoundPoint[]; value: string; onChange: (id: string) => void; disabled: boolean; fixedOrder: boolean }) {
  const { color, typography, size, space, radius, border, iconSize } = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [open, setOpen] = useState(false);
  const name = points.find((point) => point.checkpoint_id === value)?.name ?? '';
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('manual.point')}: ${name}`}
        accessibilityHint={t('manual.pointHint')}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.row, { minHeight: size.listItem, paddingHorizontal: space.l, paddingVertical: space.s, gap: space.m, borderRadius: radius.item, borderWidth: border.thin, borderColor: color.cardBorder, backgroundColor: color.surface }]}
      >
        <View style={styles.grow}>
          <Text style={[typography.small, { color: color.text2 }]}>{t('manual.point')}</Text>
          <Text style={[typography.body, { color: color.text }]}>{name}</Text>
        </View>
        <Icon name="chevronDown" size={iconSize.field} color={color.text2} />
      </Pressable>
      {/* It gives way to a screen pushed over the form (an alarm), which it would cover. */}
      <Modal visible={open && focused} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOpen(false)}>
        {/* A tap outside the sheet closes it; for a screen reader it is the close button. */}
        <Pressable style={[styles.grow, { backgroundColor: color.scrim }]} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.cancel')} />
        <View style={[styles.sheet, { backgroundColor: color.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.m }]}>
          <Text accessibilityRole="header" style={[typography.title2, { color: color.text }]}>
            {t('manual.pointChoose')}
          </Text>
          <ScrollView contentContainerStyle={{ gap: space.s }}>
            {points.map((point) => (
              <PointListItem
                key={point.checkpoint_id}
                name={point.name}
                state="pending"
                position={fixedOrder ? point.position : undefined}
                onPress={() => {
                  onChange(point.checkpoint_id);
                  setOpen(false);
                }}
              />
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function ManualForm({ roundId, points, timezone, fixedOrder }: { roundId: string; points: readonly [RoundPoint, ...RoundPoint[]]; timezone: string; fixedOrder: boolean }) {
  const { color, space } = useTheme();
  const insets = useSafeAreaInsets();
  const draft = usePhotoDraft();
  // By position until the location comes, then the nearest; what the guard chose stays.
  const [pointId, setPointId] = useState(points[0].checkpoint_id);
  const chosen = useRef(false);
  const [note, setNote] = useState('');
  const [fix, setFix] = useState<{ location: LocationFix; at: number } | null>(null);
  const [located, setLocated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<'failed' | 'closed' | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void currentLocation().then((location) => {
      if (!mounted.current) return;
      setLocated(true);
      if (location === null) return;
      setFix({ location, at: trustedNowMs(getDatabase()) });
      const nearest = nearestOf(
        getDatabase(),
        points.map((point) => point.checkpoint_id),
        location,
      );
      if (nearest !== null && !chosen.current) setPointId(nearest);
    });
    return () => {
      mounted.current = false;
    };
  }, [points]);

  const save = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setProblem(null);
    try {
      const outcome = await draft.recording((photos) => recordManualEntry(getDatabase(), { round_id: roundId, checkpoint_id: pointId, note }, photos, fix?.location ?? null));
      playFeedback(scanFeedback(outcome));
      if (mounted.current) router.replace({ pathname: '/scan-result', params: pointResultParams(outcome) });
    } catch (error) {
      if (__DEV__) console.warn('Recording a manual entry failed', error);
      playFeedback('error');
      setProblem(error instanceof DomainError && error.code === 'unknown_round' ? 'closed' : 'failed');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const accuracy = fix?.location.accuracy_m ?? null;
  const time = fix === null ? '' : localTimeOf(fix.at, timezone);
  const gps = fix === null ? (located ? t('manual.noLocation') : undefined) : accuracy === null ? t('common.gpsRecordedAt', { time }) : t('common.gpsRecorded', { accuracy: Math.round(accuracy), time });
  const ready = draft.photos.length > 0 && note.trim() !== '' && problem !== 'closed';

  return (
    // As the Expo guide says: padding on iOS; on Android the view alone keeps the field above the keyboard.
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.grow, { backgroundColor: color.bg }]}>
      <ManualHeader />
      <ScrollView style={styles.grow} contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.m, gap: space.l }} keyboardShouldPersistTaps="handled">
        <PointPicker
          points={points}
          value={pointId}
          disabled={saving}
          fixedOrder={fixedOrder}
          onChange={(id) => {
            chosen.current = true;
            setPointId(id);
          }}
        />
        <PhotoField required photos={draft.photos} onAdd={draft.add} onRemove={draft.remove} disabled={saving} />
        <TextArea label={t('common.note')} requirement="required" value={note} onChangeText={setNote} maxLength={NOTE_MAX_LENGTH} editable={!saving} />
        <InfoBanner variant="manual" icon="mapPin" title={gps} text={t('manual.info')} />
        {problem !== null && <InfoBanner variant="error" text={t(problem === 'closed' ? 'manual.roundClosed' : 'manual.failed')} />}
      </ScrollView>
      <View style={{ paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: insets.bottom + space.l }}>
        <Button label={t(saving ? 'manual.saving' : 'manual.submit')} disabled={!ready || saving} onPress={() => void save()} />
      </View>
    </KeyboardAvoidingView>
  );
}

// The manual entry (G10, B-Kezi; specification: Leolvasás 5.) for "Címke nem olvasható": one of the round's points left,
// a camera photo and a note, recorded as an unverified scan and a damaged-tag incident. It gives way to the scan's result.
export default function ManualEntryScreen() {
  const { color, space } = useTheme();
  const { round_id = '' } = useLocalSearchParams<{ round_id: string }>();
  const [info] = useState(() => loadRoundScreenInfo(getDatabase(), round_id));
  const [first, ...rest] = info?.points.filter((point) => point.scan === null) ?? [];
  const [points] = useState<readonly [RoundPoint, ...RoundPoint[]] | null>(first === undefined ? null : [first, ...rest]);

  if (info === null || points === null) {
    return (
      <View style={[styles.grow, { backgroundColor: color.bg }]}>
        <ManualHeader />
        <View style={{ paddingHorizontal: space.l }}>
          <InfoBanner variant="error" text={t('manual.roundClosed')} />
        </View>
      </View>
    );
  }
  return <ManualForm roundId={round_id} points={points} timezone={info.timezone} fixedOrder={info.fixed_order} />;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  sheet: { maxHeight: '70%' },
});
