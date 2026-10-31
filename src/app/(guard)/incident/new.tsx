import type { IncidentPayload } from '@waypost/schema';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LocationFix } from '@/chain/payloads';
import { Button } from '@/components/button';
import { CategoryTile } from '@/components/category-tile';
import type { IconName } from '@/components/icon';
import { InfoBanner } from '@/components/info-banner';
import { PhotoField } from '@/components/photo-field';
import { ScreenHeader } from '@/components/screen-header';
import { TextArea } from '@/components/text-field';
import { showToast } from '@/components/toast';
import { getDatabase } from '@/db/open';
import { MAX_NOTE_LENGTH } from '@/domain/scan';
import { DomainError } from '@/domain/state';
import { playFeedback } from '@/feedback/feedback';
import { incidentPlace, recordIncident } from '@/guard/scan';
import { t, type TranslationKey } from '@/i18n';
import { currentLocation } from '@/location/location';
import { usePhotoDraft } from '@/photo/use-photo-draft';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';
import { localTimeOf } from '@/time/zone';

type Category = Exclude<IncidentPayload['category'], 'damaged_tag'>;

const CATEGORIES: Record<Category, { icon: IconName; label: TranslationKey }> = {
  vandalism: { icon: 'vandalism', label: 'incident.vandalism' },
  open_door: { icon: 'door', label: 'incident.openDoor' },
  water: { icon: 'water', label: 'incident.water' },
  intruder: { icon: 'person', label: 'incident.stranger' },
  other: { icon: 'more', label: 'incident.other' },
};

/** Two tiles a row (B-Esemeny); "Egyéb" takes a row of its own. */
const CATEGORY_ROWS: readonly (readonly Category[])[] = [
  ['vandalism', 'open_door'],
  ['water', 'intruder'],
];

// Recording an incident (G11, B-Esemeny): the category, up to 5 camera photos, a note, and the line of the time and the
// place. It goes back to where it came from, and a toast tells about the saving. "Esemény ennél a pontnál" gives the point
// (checkpoint_id); otherwise it is the nearest to the location.
export default function NewIncidentScreen() {
  const { color, typography, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { checkpoint_id: checkpointId = null } = useLocalSearchParams<{ checkpoint_id?: string }>();
  const draft = usePhotoDraft();
  const [category, setCategory] = useState<Category | null>(null);
  const [note, setNote] = useState('');
  const [place, setPlace] = useState(() => incidentPlace(getDatabase(), checkpointId, null));
  const [fix, setFix] = useState<LocationFix | null>(null);
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
      setFix(location);
      setPlace(incidentPlace(getDatabase(), checkpointId, location));
    });
    return () => {
      mounted.current = false;
    };
  }, [checkpointId]);

  const save = async (chosen: Category) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setProblem(null);
    try {
      await draft.recording((photos) => recordIncident(getDatabase(), { category: chosen, note, checkpoint_id: checkpointId }, photos, fix));
      playFeedback('success');
      if (useSyncStatus.getState().online === false) showToast(t('incident.savedQueued'), 'offline');
      else showToast(t('incident.saved'));
      if (mounted.current) router.back();
    } catch (error) {
      if (__DEV__) console.warn('Recording an incident failed', error);
      playFeedback('error');
      setProblem(error instanceof DomainError && error.code === 'no_shift' ? 'closed' : 'failed');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const accuracy = fix?.accuracy_m ?? null;
  const gps = fix === null ? (located ? t('incident.noLocation') : null) : accuracy === null ? t('incident.gpsNoAccuracy') : t('incident.gps', { accuracy: Math.round(accuracy) });
  const point = place?.point_name == null ? null : t(checkpointId === null ? 'incident.nearest' : 'incident.point', { point: place.point_name });
  const auto = [place === null ? null : localTimeOf(place.at_ms, place.timezone), point, gps].filter((part) => part !== null).join(' · ');

  const tile = (value: Category, wide = false) => (
    <CategoryTile key={value} icon={CATEGORIES[value].icon} label={t(CATEGORIES[value].label)} wide={wide} selected={category === value} onPress={() => setCategory(value)} style={wide ? undefined : styles.grow} />
  );

  return (
    // As the Expo guide says: padding on iOS; on Android the view alone keeps the field above the keyboard.
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader title={t('incident.title')} onBack={() => router.back()} />
      <ScrollView style={styles.grow} contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.m, gap: space.l }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.s }}>
          <Text style={[typography.label, { color: color.text, paddingLeft: space.xs }]}>{t('incident.what')}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('incident.categories')} style={{ gap: space.s }}>
            {CATEGORY_ROWS.map((row) => (
              <View key={row[0]} style={[styles.row, { gap: space.s }]}>
                {row.map((value) => tile(value))}
              </View>
            ))}
            {tile('other', true)}
          </View>
        </View>
        <PhotoField photos={draft.photos} onAdd={draft.add} onRemove={draft.remove} disabled={saving} />
        <TextArea label={t('common.note')} requirement="optional" value={note} onChangeText={setNote} maxLength={MAX_NOTE_LENGTH} editable={!saving} />
        {auto !== '' && <Text style={[typography.small, styles.tabular, { color: color.text2, paddingHorizontal: space.xs }]}>{auto}</Text>}
        {problem !== null && <InfoBanner variant="error" text={t(problem === 'closed' ? 'incident.shiftClosed' : 'incident.failed')} />}
      </ScrollView>
      <View style={{ paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: insets.bottom + space.l }}>
        <Button label={t(saving ? 'incident.saving' : 'incident.submit')} disabled={category === null || saving || problem === 'closed'} onPress={() => category !== null && void save(category)} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row' },
  tabular: { fontVariant: ['tabular-nums'] },
});
