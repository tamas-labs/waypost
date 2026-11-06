import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { Sheet, SheetModal } from '@/components/sheet';
import { SectionTitle } from '@/components/section-title';
import { Switch } from '@/components/switch';
import { showToast } from '@/components/toast';
import { alertOptions, REPORT_FREQUENCIES, setAlertAfter, setReport } from '@/domain/report-settings';
import { useReportSettings } from '@/hooks/use-report-settings';
import { t } from '@/i18n';
import { alertDelayText, reportText, retentionText } from '@/supervisor/report-settings-view';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';

// The report settings of a site (S10, S-Jelentesek; the design's sites/[id]/reports, decisions: "Jelentésbeállítások"):
// the four reports the supervisor using the phone gets by e-mail, the site's no-data alert (for all its supervisors),
// and the retention that follows from everyone's reports. The save is local at once and goes through the outbox.
export default function ReportsScreen() {
  const { color, typography, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { base, recipient, draft, changed, change, save } = useReportSettings(id);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  usePreventRemove(changed, ({ repeat }) =>
    Alert.alert(t('routeEdit.leaveTitle'), t('routeEdit.leaveConfirm'), [
      { text: t('routeEdit.leaveKeep'), style: 'cancel' },
      { text: t('routeEdit.leaveDiscard'), style: 'destructive', onPress: repeat },
    ]),
  );

  if (base === null || draft === null) {
    return (
      <View style={[styles.grow, { backgroundColor: color.bg }]}>
        <ScreenHeader title={t('supervisor.reports')} onBack={() => router.back()} />
        <View style={{ padding: space.l }}>
          <InfoBanner variant="warn" text={t('supervisor.siteMissing')} />
        </View>
      </View>
    );
  }

  const onSave = () => {
    try {
      save();
    } catch (e) {
      setError(t('reports.failed', { message: e instanceof Error ? e.message : String(e) }));
      return;
    }
    showToast(t('reports.saved'));
    router.back();
  };

  const alertValue = alertDelayText(draft.alert_after_min);

  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader
        title={t('supervisor.reports')}
        subtitle={recipient === null ? base.site.name : t('reports.recipient', { who: recipient })}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.m }}>
        <SectionTitle text={t('reports.subscriptions')} />
        <Card divided>
          {REPORT_FREQUENCIES.map((frequency) => {
            const { title, sub } = reportText(frequency);
            const on = draft.frequencies.includes(frequency);
            return (
              <View key={frequency} style={[styles.row, { padding: space.l, gap: space.m }]}>
                <View style={styles.grow}>
                  <Text style={[typography.body, { color: color.text }]}>{title}</Text>
                  <Text style={[typography.small, { color: color.text2 }]}>{sub}</Text>
                </View>
                <Switch value={on} onValueChange={(value) => change(setReport(draft, frequency, value))} accessibilityLabel={title} />
              </View>
            );
          })}
        </Card>

        <SectionTitle text={t('reports.alert')} />
        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('reports.change', { label: t('reports.noDataTitle'), value: alertValue })}
            onPress={() => setPicking(true)}
            style={[styles.row, { padding: space.l, gap: space.m }]}
          >
            <View style={styles.grow}>
              <Text style={[typography.body, { color: color.text }]}>{t('reports.noDataTitle')}</Text>
              <Text style={[typography.small, { color: color.text2 }]}>{t('reports.afterSchedule')}</Text>
            </View>
            <Text style={[typography.button, tabular, { color: color.accent }]}>{alertValue}</Text>
          </Pressable>
        </Card>

        <InfoBanner variant="info" text={retentionText([...base.others, ...draft.frequencies])} />

        {error !== null && (
          <View accessibilityLiveRegion="polite" accessibilityRole="alert">
            <InfoBanner variant="error" text={error} />
          </View>
        )}
        <Button label={t('common.save')} disabled={!changed} onPress={onSave} />
      </ScrollView>

      <SheetModal visible={picking} onClose={() => setPicking(false)}>
        <AlertSheet
          value={draft.alert_after_min}
          onPick={(minutes) => {
            setPicking(false);
            change(setAlertAfter(draft, minutes));
          }}
          onClose={() => setPicking(false)}
        />
      </SheetModal>
    </View>
  );
}

/** The delay of the alert: the choices, one set on the web among them; the scrim closes it. */
function AlertSheet({ value, onPick, onClose }: { value: number; onPick: (minutes: number) => void; onClose: () => void }) {
  const { color, typography, space, size, iconSize } = useTheme();
  return (
    <Sheet title={t('reports.alertSheet')} onClose={onClose}>
      <Card divided>
        {alertOptions(value).map((minutes) => {
          const on = minutes === value;
          return (
            <Pressable
              key={minutes}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onPick(minutes)}
              style={[styles.row, { minHeight: size.touchMin, paddingHorizontal: space.l, gap: space.m }]}
            >
              <Text style={[typography.body, tabular, styles.grow, { color: on ? color.accent : color.text }]}>
                {alertDelayText(minutes)}
              </Text>
              {on && <Icon name="check" size={iconSize.banner} color={color.accent} />}
            </Pressable>
          );
        })}
      </Card>
      <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
