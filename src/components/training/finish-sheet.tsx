import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { InfoBanner } from '@/components/info-banner';
import { Sheet } from '@/components/sheet';
import { TextField } from '@/components/text-field';
import { showToast } from '@/components/toast';
import { getDatabase } from '@/db/open';
import { defaultTimeLimit } from '@/domain/deadline';
import { ROUTE_NAME_MAX, TrainingError, setRouteName, walkDuration, type TrainingDraft } from '@/domain/training';
import { t } from '@/i18n';
import { formatWalk } from '@/supervisor/site-detail';
import { saveTraining } from '@/supervisor/training';
import { routeTitle, trainingErrorText } from '@/supervisor/training-view';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';

/**
 * The end of the walk: the total time, the time limit it suggests for a schedule (M3-14), the name of a new route, and
 * the save as the route's new version. What stops the save is told here; the draft stays as it was.
 */
export function FinishSheet({
  draft,
  change,
  onClose,
}: {
  draft: TrainingDraft;
  change: (next: TrainingDraft) => void;
  onClose: () => void;
}) {
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
    <Sheet title={t('training.finishTitle')} onClose={onClose} form gap="l">
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
    </Sheet>
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
});
