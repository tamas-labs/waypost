import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { InfoBanner } from '@/components/info-banner';
import { SinglePhotoField } from '@/components/photo-field';
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
  pointDetailsOf,
  removePoint,
  updatePoint,
  type ExistingScan,
  type NewTagScan,
  type PointDetails,
  type TrainingDraft,
  type TrainingPoint,
} from '@/domain/training';
import { useTrainingDraft } from '@/hooks/use-training';
import { t } from '@/i18n';
import { uuidv7 } from '@/id/uuidv7';
import { formatTagUid } from '@/nfc/tag';
import { useSinglePhotoDraft } from '@/photo/use-photo-draft';
import { existingScanOf, parsePendingScan } from '@/supervisor/training';
import { gpsText, trainingErrorText } from '@/supervisor/training-view';
import { useTheme } from '@/theme/theme-provider';

/** Changes the draft, or tells why it cannot be: a point already added (a tag touched twice) goes back with a note. */
function tryChange(draft: TrainingDraft, next: () => TrainingDraft, change: (next: TrainingDraft) => void): void {
  try {
    change(next());
  } catch (error) {
    if (!(error instanceof TrainingError) || error.code !== 'in_draft') throw error;
    showToast(trainingErrorText(error, draft), 'warn');
  }
}

type NewPoint = Extract<TrainingPoint, { kind: 'new' }>;

// A point of the training (S6, S-PontAdatai): an unknown NFC tag gets the name, instruction and photo of its new
// checkpoint ("Mentés, jöhet a következő" adds it, "Pont elvetése" leaves it out); the tag or QR code of a checkpoint on
// the site offers that checkpoint (with a warning for a tag, which cannot make a second one). A new point of the draft
// opens here again from the walk (edit: its checkpoint ID) to change its details or take it out. Either way back to the
// walk.
export default function TrainingPointScreen() {
  const { color, space } = useTheme();
  const { id = '', scan, edit } = useLocalSearchParams<{ id: string; scan?: string; edit?: string }>();
  const { draft, change } = useTrainingDraft(id);
  const pending = useMemo(() => (edit === undefined ? parsePendingScan(scan) : null), [scan, edit]);
  const existing = useMemo(
    () => (draft === null || pending?.kind !== 'existing' ? null : existingScanOf(getDatabase(), draft, pending)),
    [draft, pending],
  );
  const editIndex = draft === null || edit === undefined ? -1 : draft.points.findIndex((point) => point.checkpoint_id === edit);
  const edited = draft?.points[editIndex];
  const editedPoint = edited?.kind === 'new' ? edited : null;

  const header = (
    <ScreenHeader
      overline={draft === null ? undefined : t('training.pointN', { n: editIndex >= 0 ? editIndex + 1 : draft.points.length + 1 })}
      title={t(edit !== undefined ? 'training.editPoint' : pending?.kind === 'existing' ? 'training.existingPoint' : 'training.newPoint')}
      onBack={() => router.back()}
    />
  );
  const problem =
    draft === null
      ? t('training.missing')
      : edit !== undefined
        ? editedPoint === null
          ? t('training.pointGone')
          : null
        : pending === null
          ? t('training.scanMissing')
          : pending.kind === 'existing' && existing === null
            ? t('training.checkpointGone')
            : null;
  if (problem !== null || draft === null) {
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
      {editedPoint !== null ? (
        <PointForm draft={draft} change={change} edit={editedPoint} />
      ) : pending?.kind === 'new' ? (
        <PointForm draft={draft} change={change} scan={pending.scan} />
      ) : (
        existing !== null &&
        pending?.kind === 'existing' && <ExistingPoint draft={draft} scan={existing} method={pending.method} change={change} />
      )}
    </KeyboardAvoidingView>
  );
}

interface DraftProps {
  draft: TrainingDraft;
  change: (next: TrainingDraft) => void;
}

const NO_DETAILS: PointDetails = { name: '', instruction: '', photo: null };

/** The details of a new checkpoint: of an unknown tag just read (scan), or of a new point of the draft (edit). */
function PointForm({ draft, change, scan, edit }: DraftProps & ({ scan: NewTagScan; edit?: never } | { edit: NewPoint; scan?: never })) {
  const { space } = useTheme();
  const [details, setDetails] = useState(() => (edit === undefined ? NO_DETAILS : (pointDetailsOf(edit) ?? NO_DETAILS)));
  const photo = useSinglePhotoDraft(details.photo);
  const [nameMissing, setNameMissing] = useState(false);

  const save = () => {
    const next = { ...details, photo: photo.photo };
    if (checkPointDetails(next) !== null) {
      setNameMissing(true);
      return;
    }
    tryChange(
      draft,
      () => (edit === undefined ? addNewPoint(draft, scan, next, uuidv7) : updatePoint(draft, edit.checkpoint_id, next)),
      (changed) => {
        change(changed);
        photo.keep();
      },
    );
    router.back();
  };

  const remove = () =>
    Alert.alert(details.name, t('training.removeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('training.remove'),
        style: 'destructive',
        onPress: () => {
          if (edit !== undefined) change(removePoint(draft, edit.checkpoint_id));
          router.back();
        },
      },
    ]);

  return (
    <>
      <ScrollView style={styles.grow} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.l, gap: space.l }}>
        {scan !== undefined && (
          <InfoBanner
            variant="success"
            title={t('training.tagRead', { method: t('method.nfc') })}
            text={`${formatTagUid(scan.tag_uid)} · ${gpsText(scan.location)}`}
          />
        )}
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
        <SinglePhotoField
          label={t('training.pointPhoto')}
          hint={t('training.photoHint')}
          photo={photo.photo}
          onTake={photo.take}
          onRemove={photo.remove}
        />
      </ScrollView>
      {edit === undefined ? (
        <PointActions saveLabel={t('training.saveNext')} onSave={save} dropLabel={t('training.discard')} onDrop={() => router.back()} />
      ) : (
        <PointActions saveLabel={t('training.savePoint')} onSave={save} dropLabel={t('training.removePoint')} onDrop={remove} />
      )}
    </>
  );
}

function ExistingPoint({ draft, scan, method, change }: DraftProps & { scan: ExistingScan; method: 'nfc' | 'qr' }) {
  const { color, typography, space } = useTheme();
  const { checkpoint } = scan;
  const add = () => {
    tryChange(draft, () => addExistingPoint(draft, scan), change);
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
      <PointActions saveLabel={t('training.addExisting')} onSave={add} dropLabel={t('training.discard')} onDrop={() => router.back()} />
    </>
  );
}

function PointActions({
  saveLabel,
  onSave,
  dropLabel,
  onDrop,
}: {
  saveLabel: string;
  onSave: () => void;
  dropLabel: string;
  onDrop: () => void;
}) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: insets.bottom + space.l, gap: space.s }}>
      <Button label={saveLabel} onPress={onSave} />
      <Button variant="dangerText" label={dropLabel} onPress={onDrop} />
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
