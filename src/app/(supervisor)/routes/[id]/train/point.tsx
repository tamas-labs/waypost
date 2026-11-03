import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { TextArea, TextField } from '@/components/text-field';
import { showToast } from '@/components/toast';
import { getDatabase } from '@/db/open';
import {
  CHECKPOINT_INSTRUCTION_MAX,
  CHECKPOINT_NAME_MAX,
  TrainingError,
  addExistingPoint,
  addNewPoint,
  checkPointDetails,
  type ExistingScan,
  type NewTagScan,
  type PointDetails,
  type TrainingDraft,
} from '@/domain/training';
import { useTrainingDraft } from '@/hooks/use-training';
import { t } from '@/i18n';
import { uuidv7 } from '@/id/uuidv7';
import { formatTagUid } from '@/nfc/tag';
import { existingScanOf, parsePendingScan } from '@/supervisor/training';
import { gpsText, trainingErrorText } from '@/supervisor/training-view';
import { useTheme } from '@/theme/theme-provider';

/** Adds the point, or tells why it cannot be: a point already added (a tag touched twice) goes back with a note. */
function tryAdd(draft: TrainingDraft, add: () => TrainingDraft, change: (next: TrainingDraft) => void): void {
  try {
    change(add());
  } catch (error) {
    if (!(error instanceof TrainingError) || error.code !== 'in_draft') throw error;
    showToast(trainingErrorText(error, draft), 'warn');
  }
}

// A scanned point of the training (S6, S-PontAdatai): an unknown NFC tag gets the name and instruction of its new
// checkpoint, the tag or QR code of a checkpoint on the site offers that checkpoint (with a warning for a tag, which
// cannot make a second one). "Mentés, jöhet a következő" adds it to the draft, "Pont elvetése" leaves it out; either
// way back to the walk. The photo of the point comes with M5-13.
export default function TrainingPointScreen() {
  const { color, space } = useTheme();
  const { id = '', scan } = useLocalSearchParams<{ id: string; scan?: string }>();
  const { draft, change } = useTrainingDraft(id);
  const pending = useMemo(() => parsePendingScan(scan), [scan]);
  const existing = useMemo(
    () => (draft === null || pending?.kind !== 'existing' ? null : existingScanOf(getDatabase(), draft, pending)),
    [draft, pending],
  );

  const header = (
    <ScreenHeader
      overline={draft === null ? undefined : t('training.pointN', { n: draft.points.length + 1 })}
      title={pending?.kind === 'existing' ? t('training.existingPoint') : t('training.newPoint')}
      onBack={() => router.back()}
    />
  );
  const problem =
    draft === null
      ? t('training.missing')
      : pending === null
        ? t('training.scanMissing')
        : pending.kind === 'existing' && existing === null
          ? t('training.checkpointGone')
          : null;
  if (problem !== null || draft === null || pending === null) {
    return (
      <View style={[styles.grow, { backgroundColor: color.bg }]}>
        {header}
        <View style={{ padding: space.l }}>
          <InfoBanner variant="warn" text={problem ?? ''} />
        </View>
      </View>
    );
  }

  return (
    // As the Expo guide says: padding on iOS; on Android the view alone keeps the field above the keyboard.
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.grow, { backgroundColor: color.bg }]}>
      {header}
      {pending.kind === 'new' ? (
        <NewPoint draft={draft} scan={pending.scan} change={change} />
      ) : (
        existing !== null && <ExistingPoint draft={draft} scan={existing} method={pending.method} change={change} />
      )}
    </KeyboardAvoidingView>
  );
}

interface PointProps<Scan> {
  draft: TrainingDraft;
  scan: Scan;
  change: (next: TrainingDraft) => void;
}

function NewPoint({ draft, scan, change }: PointProps<NewTagScan>) {
  const { space } = useTheme();
  const [details, setDetails] = useState<PointDetails>({ name: '', instruction: '' });
  const [nameMissing, setNameMissing] = useState(false);

  const save = () => {
    if (checkPointDetails(details) !== null) {
      setNameMissing(true);
      return;
    }
    tryAdd(draft, () => addNewPoint(draft, scan, details, uuidv7), change);
    router.back();
  };

  return (
    <>
      <ScrollView style={styles.grow} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.l, gap: space.l }}>
        <InfoBanner
          variant="success"
          title={t('training.tagRead', { method: t('method.nfc') })}
          text={`${formatTagUid(scan.tag_uid)} · ${gpsText(scan.location)}`}
        />
        <TextField
          label={t('training.name')}
          requirement="required"
          value={details.name}
          onChangeText={(name) => {
            setDetails((current) => ({ ...current, name }));
            setNameMissing(false);
          }}
          error={nameMissing ? t('training.nameMissing') : undefined}
          maxLength={CHECKPOINT_NAME_MAX}
          autoCapitalize="sentences"
          returnKeyType="next"
        />
        <TextArea
          label={t('training.instruction')}
          requirement="optional"
          value={details.instruction}
          onChangeText={(instruction) => setDetails((current) => ({ ...current, instruction }))}
          maxLength={CHECKPOINT_INSTRUCTION_MAX}
          autoCapitalize="sentences"
        />
      </ScrollView>
      <PointActions saveLabel={t('training.saveNext')} onSave={save} />
    </>
  );
}

function ExistingPoint({ draft, scan, method, change }: PointProps<ExistingScan> & { method: 'nfc' | 'qr' }) {
  const { color, typography, space } = useTheme();
  const { checkpoint } = scan;
  const add = () => {
    tryAdd(draft, () => addExistingPoint(draft, scan), change);
    router.back();
  };
  return (
    <>
      <ScrollView style={styles.grow} contentContainerStyle={{ padding: space.l, gap: space.l }}>
        {method === 'nfc' ? (
          <InfoBanner variant="warn" text={t('training.tagTakenBy', { name: checkpoint.name })} />
        ) : (
          <InfoBanner variant="success" text={t('training.qrOf', { name: checkpoint.name })} />
        )}
        {!checkpoint.active && <InfoBanner variant="info" text={t('training.inactiveNote')} />}
        <Card style={{ padding: space.l }}>
          <Text style={[typography.title2, { color: color.text }]}>{checkpoint.name}</Text>
        </Card>
      </ScrollView>
      <PointActions saveLabel={t('training.addExisting')} onSave={add} />
    </>
  );
}

function PointActions({ saveLabel, onSave }: { saveLabel: string; onSave: () => void }) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: insets.bottom + space.l, gap: space.s }}>
      <Button label={saveLabel} onPress={onSave} />
      <Button variant="dangerText" label={t('training.discard')} onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
