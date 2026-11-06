import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { SinglePhotoField } from '@/components/photo-field';
import { Sheet } from '@/components/sheet';
import { TextArea, TextField } from '@/components/text-field';
import type { PhotoFile } from '@/chain/payloads';
import { RouteEditError, editPointDetails, updateEditPoint, type EditPhoto, type EditPoint, type RouteEdit } from '@/domain/route-edit';
import { CHECKPOINT_INSTRUCTION_MAX, CHECKPOINT_NAME_MAX, checkPointDetails } from '@/domain/training';
import { t } from '@/i18n';
import { useSinglePhotoDraft } from '@/photo/use-photo-draft';

/** A saved photo of the sheet: the checkpoint's own, by its media ID. */
interface SavedPhoto {
  id: string;
}

const sheetPhotoOf = (photo: EditPhoto): SavedPhoto | PhotoFile | null =>
  photo === null ? null : photo.kind === 'saved' ? { id: photo.media_id } : photo.photo;

/** The sheet's photo back as the editing has it: the one it started with stays what it was. */
function editPhotoOf(shown: SavedPhoto | PhotoFile | null, started: EditPhoto): EditPhoto {
  if (shown === null) return null;
  if (started !== null && shown.id === (started.kind === 'saved' ? started.media_id : started.photo.id)) return started;
  return { kind: 'new', photo: shown as PhotoFile };
}

/** The name, instruction and photo of a point (S7 → the S6 fields). */
export function PointSheet({
  edit,
  point,
  onChange,
  onClose,
}: {
  edit: RouteEdit;
  point: EditPoint;
  onChange: (next: RouteEdit) => void;
  onClose: () => void;
}) {
  const [started] = useState(() => editPointDetails(edit, point.checkpoint_id));
  const [name, setName] = useState(started.name);
  const [instruction, setInstruction] = useState(started.instruction);
  const [nameMissing, setNameMissing] = useState(false);
  const photo = useSinglePhotoDraft<SavedPhoto>(sheetPhotoOf(started.photo));

  /** Takes the sheet's fields into the editing; false (the name marked) if the name is missing. */
  const apply = (): boolean => {
    const details = { name, instruction, photo: editPhotoOf(photo.photo, started.photo) };
    if (checkPointDetails({ ...details, photo: null }) !== null) {
      setNameMissing(true);
      return false;
    }
    try {
      onChange(updateEditPoint(edit, point.checkpoint_id, details));
    } catch (e) {
      if (!(e instanceof RouteEditError) || e.code !== 'name_required') throw e;
      setNameMissing(true);
      return false;
    }
    photo.keep();
    return true;
  };

  const save = () => {
    if (apply()) onClose();
  };

  // The label leaves the screen: what was typed on the sheet goes into the editing first, so it is not lost.
  const openQr = () => {
    if (!apply()) return;
    onClose();
    router.push({ pathname: '/checkpoints/[id]/qr', params: { id: point.checkpoint_id } });
  };

  return (
    <Sheet title={t('training.editPoint')} onClose={onClose} form gap="l">
      <TextField
        label={t('training.name')}
        requirement="required"
        value={name}
        onChangeText={(value) => {
          setName(value);
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
        value={instruction}
        onChangeText={setInstruction}
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
      <Button variant="secondary" icon="qr" label={t('qrLabel.title')} onPress={openQr} />
      <Button label={t('training.savePoint')} onPress={save} />
      <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
    </Sheet>
  );
}
