import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { InfoBanner } from '@/components/info-banner';
import { SinglePhotoField } from '@/components/photo-field';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { TextArea, TextField } from '@/components/text-field';
import { showToast } from '@/components/toast';
import type { PhotoFile } from '@/chain/payloads';
import { getDatabase } from '@/db/open';
import {
  RouteEditError,
  editPointDetails,
  removeEditPoint,
  reorderEditPoints,
  setEditOrderMode,
  updateEditPoint,
  type EditPhoto,
  type EditPoint,
  type RouteEdit,
} from '@/domain/route-edit';
import { CHECKPOINT_INSTRUCTION_MAX, CHECKPOINT_NAME_MAX, checkPointDetails, type OrderMode } from '@/domain/training';
import { useRouteEdit } from '@/hooks/use-route-edit';
import { trainingNow, useSupervisorId } from '@/hooks/use-training';
import { t } from '@/i18n';
import { useSinglePhotoDraft } from '@/photo/use-photo-draft';
import { editHeaderLine, editPointMeta, routeEditErrorText } from '@/supervisor/route-edit-view';
import { nextVersionNumber } from '@/supervisor/route-version';
import { beginTraining, storedTrainingDraft } from '@/supervisor/training';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';

const ORDER_MODES: readonly { value: OrderMode; label: string }[] = [
  { value: 'free', label: t('training.free') },
  { value: 'fixed', label: t('training.fixed') },
];

// Editing a route (S7, S-Utvonal; specification: (supervisor)/routes/[id]/edit): its points in order, dragged by the
// handle (or moved up and down by the screen reader's actions), each one's name, instruction and photo on a sheet, a
// point taken out after a confirmation, the order mode; every save is a new version (domain/route-edit.ts). A new point
// needs its tag scanned on the spot: "Új pont felvétele" is a training of one point (S5), added to the end of the
// version. Leaving with changes asks first; the photos taken are deleted then. The sheet leads to the point's QR label.
export default function RouteEditScreen() {
  const { color, space } = useTheme();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const routeEdit = useRouteEdit(id);
  const { edit, changed } = routeEdit;
  const supervisorId = useSupervisorId();
  const [sheet, setSheet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextVersion = useMemo(() => (routeEdit.base === null ? null : nextVersionNumber(getDatabase(), id)), [routeEdit.base, id]);

  usePreventRemove(changed, ({ repeat }) =>
    Alert.alert(t('routeEdit.leaveTitle'), t('routeEdit.leaveConfirm'), [
      { text: t('routeEdit.leaveKeep'), style: 'cancel' },
      {
        text: t('routeEdit.leaveDiscard'),
        style: 'destructive',
        onPress: () => {
          routeEdit.restart();
          repeat();
        },
      },
    ]),
  );

  if (edit === null || nextVersion === null || supervisorId === null) {
    return (
      <View style={[styles.grow, { backgroundColor: color.bg }]}>
        <ScreenHeader onBack={() => router.back()} />
        <View style={{ padding: space.l }}>
          <InfoBanner variant="warn" text={t('routeEdit.missing')} />
        </View>
      </View>
    );
  }

  const change = (next: RouteEdit) => {
    setError(null);
    routeEdit.change(next);
  };

  /** Saves the editing; false (with the reason shown) if it cannot be saved. */
  const store = (): boolean => {
    try {
      routeEdit.save(supervisorId);
    } catch (e) {
      setError(routeEditErrorText(e));
      return false;
    }
    return true;
  };

  const save = () => {
    if (!store()) return;
    showToast(t('routeEdit.saved', { version: nextVersion }));
    router.back();
  };

  const addPoint = () => {
    const begin = () => {
      beginTraining(getDatabase(), { siteId: edit.base.route.site_id, routeId: id, supervisorId, started: trainingNow(), adding: true });
      router.push({ pathname: '/routes/[id]/train', params: { id } });
    };
    const replacing = () => {
      const stored = storedTrainingDraft(getDatabase());
      if (stored === null || stored.points.length === 0) {
        begin();
        return;
      }
      Alert.alert(t('supervisor.replaceTrainingTitle'), t('supervisor.replaceTraining', { count: stored.points.length }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('supervisor.replaceTrainingButton'), style: 'destructive', onPress: begin },
      ]);
    };
    if (!changed) {
      replacing();
      return;
    }
    Alert.alert(t('routeEdit.saveFirstTitle'), t('routeEdit.saveFirst', { version: nextVersion }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('routeEdit.saveFirstButton'), onPress: () => store() && replacing() },
    ]);
  };

  const remove = (point: EditPoint) =>
    Alert.alert(point.name, t('routeEdit.removeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('training.remove'), style: 'destructive', onPress: () => change(removeEditPoint(edit, point.checkpoint_id)) },
    ]);

  const move = (point: EditPoint, by: -1 | 1) => {
    const order = edit.points.map((p) => p.checkpoint_id);
    const from = order.indexOf(point.checkpoint_id);
    const to = from + by;
    if (to < 0 || to >= order.length) return;
    order.splice(from, 1);
    order.splice(to, 0, point.checkpoint_id);
    change(reorderEditPoints(edit, order));
  };

  const tagTypes = new Map(edit.base.points.map((point) => [point.checkpoint_id, point.tag_type]));
  const sheetPoint = sheet === null ? null : (edit.points.find((point) => point.checkpoint_id === sheet) ?? null);

  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader title={edit.base.route.name} subtitle={editHeaderLine(edit)} onBack={() => router.back()} />
      <DraggableFlatList
        data={edit.points}
        keyExtractor={(point) => point.checkpoint_id}
        onDragEnd={({ data }) =>
          change(
            reorderEditPoints(
              edit,
              data.map((point) => point.checkpoint_id),
            ),
          )
        }
        containerStyle={styles.grow}
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.m, gap: space.s }}
        ListHeaderComponent={
          <View style={{ gap: space.m, paddingBottom: space.s }}>
            {routeEdit.stale ? (
              <View style={{ gap: space.s }}>
                <InfoBanner variant="warn" text={t('routeEdit.stale', { version: routeEdit.base?.version ?? '' })} />
                <Button variant="secondary" label={t('routeEdit.restart')} onPress={routeEdit.restart} />
              </View>
            ) : (
              <InfoBanner variant="info" text={t('routeEdit.versionInfo', { version: nextVersion })} />
            )}
            <SegmentedControl
              options={ORDER_MODES}
              value={edit.order_mode}
              onChange={(mode) => change(setEditOrderMode(edit, mode))}
              accessibilityLabel={t('training.order')}
            />
          </View>
        }
        renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<EditPoint>) => (
          <PointRow
            point={item}
            position={(getIndex() ?? 0) + 1}
            meta={editPointMeta(item, tagTypes.get(item.checkpoint_id) ?? 'nfc')}
            dragging={isActive}
            onDrag={drag}
            onMove={(by) => move(item, by)}
            onEdit={() => setSheet(item.checkpoint_id)}
            onRemove={() => remove(item)}
          />
        )}
      />
      <EditActions nextVersion={nextVersion} canSave={changed && !routeEdit.stale} error={error} onAddPoint={addPoint} onSave={save} />
      <Modal
        visible={sheetPoint !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSheet(null)}
      >
        {sheetPoint !== null && (
          <PointSheet edit={edit} point={sheetPoint} onChange={change} onClose={() => setSheet(null)} key={sheetPoint.checkpoint_id} />
        )}
      </Modal>
    </View>
  );
}

function RowButton({
  icon,
  label,
  tint,
  onPress,
}: {
  icon: IconName;
  label: string;
  tint: 'text2' | 'miss' | 'pending';
  onPress: () => void;
}) {
  const { color, size, iconSize } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={0}
      style={[styles.centre, { width: size.touchMin, height: size.touchMin }]}
    >
      <Icon name={icon} size={iconSize.banner} color={color[tint]} />
    </Pressable>
  );
}

/** A point of the route (S7): the handle, its position, name and meta, the pencil (its sheet) and the minus (taking it out). */
function PointRow({
  point,
  position,
  meta,
  dragging,
  onDrag,
  onMove,
  onEdit,
  onRemove,
}: {
  point: EditPoint;
  position: number;
  meta: string;
  dragging: boolean;
  onDrag: () => void;
  onMove: (by: -1 | 1) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { color, typography, space, size, radius, border, iconSize } = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          minHeight: size.listItem,
          paddingRight: space.xs,
          gap: space.xs,
          borderRadius: radius.item,
          backgroundColor: dragging ? color.runBg : color.card,
          borderWidth: border.thin,
          borderColor: dragging ? color.accent : color.cardBorder,
        },
      ]}
    >
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={t('routeEdit.move', { name: point.name })}
        accessibilityHint={t('routeEdit.moveHint')}
        accessibilityActions={[
          { name: 'increment', label: t('routeEdit.moveDown') },
          { name: 'decrement', label: t('routeEdit.moveUp') },
        ]}
        onAccessibilityAction={(event) => onMove(event.nativeEvent.actionName === 'decrement' ? -1 : 1)}
        onLongPress={onDrag}
        delayLongPress={150}
        style={[styles.centre, { width: size.touchMin, height: size.touchMin }]}
      >
        <Icon name="grip" size={iconSize.banner} color={color.pending} />
      </Pressable>
      <View
        style={[
          styles.centre,
          { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2, backgroundColor: color.runBg },
        ]}
      >
        <Text style={[typography.badge, tabular, { color: color.run }]}>{position}</Text>
      </View>
      <View accessible style={[styles.grow, { paddingLeft: space.xs, paddingVertical: space.s }]}>
        <Text style={[typography.body, { color: color.text }]}>{point.name}</Text>
        <Text style={[typography.small, { color: color.text2 }]}>{meta}</Text>
      </View>
      <RowButton icon="pencil" label={t('routeEdit.edit', { name: point.name })} tint="text2" onPress={onEdit} />
      <RowButton icon="minusCircle" label={t('routeEdit.remove', { name: point.name })} tint="miss" onPress={onRemove} />
    </View>
  );
}

function EditActions({
  nextVersion,
  canSave,
  error,
  onAddPoint,
  onSave,
}: {
  nextVersion: number;
  canSave: boolean;
  error: string | null;
  onAddPoint: () => void;
  onSave: () => void;
}) {
  const { color, space, border } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingHorizontal: space.l,
        paddingTop: space.m,
        paddingBottom: insets.bottom + space.l,
        gap: space.s,
        borderTopWidth: border.thin,
        borderTopColor: color.line,
      }}
    >
      {error !== null && (
        <View accessibilityLiveRegion="polite" accessibilityRole="alert">
          <InfoBanner variant="error" text={error} />
        </View>
      )}
      <Button variant="dashed" icon="plus" label={`${t('routeEdit.addPoint')} · ${t('routeEdit.needsWalk')}`} onPress={onAddPoint} />
      <Button label={t('routeEdit.saveAs', { version: nextVersion })} disabled={!canSave} onPress={onSave} />
    </View>
  );
}

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
function PointSheet({
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
  const { color, typography, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
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
            {t('training.editPoint')}
          </Text>
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
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  sheet: { maxHeight: '92%' },
});
