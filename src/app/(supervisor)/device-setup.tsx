import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CheckRow } from '@/components/check-row';
import { ScreenHeader } from '@/components/screen-header';
import { SectionTitle } from '@/components/section-title';
import { SegmentedControl } from '@/components/segmented-control';
import { getDatabase } from '@/db/open';
import { setupRows, type SetupItem, type SetupRow } from '@/setup/readiness';
import { clearErrorLog, ERROR_LOG_SIZE, onErrorLogged, readErrorLog } from '@/diagnostics/error-log';
import { deviceTimeZone, errorLogRows } from '@/diagnostics/error-log-view';
import { useReadiness } from '@/hooks/use-readiness';
import { t, type TranslationKey } from '@/i18n';
import { useTheme, useThemePreference } from '@/theme/theme-provider';
import type { ThemePreference } from '@/theme/tokens';

const ROW_TEXT: Record<SetupItem, { ok: TranslationKey; label: TranslationKey; detail: TranslationKey }> = {
  notifications: { ok: 'deviceSetup.notificationsOn', label: 'deviceSetup.notifications', detail: 'deviceSetup.notificationsOff' },
  exactAlarms: { ok: 'deviceSetup.exactAlarmsOn', label: 'deviceSetup.exactAlarms', detail: 'deviceSetup.exactAlarmsOff' },
  battery: { ok: 'deviceSetup.batteryOn', label: 'deviceSetup.battery', detail: 'deviceSetup.batteryOff' },
  location: { ok: 'deviceSetup.locationOn', label: 'deviceSetup.location', detail: 'deviceSetup.locationOff' },
  camera: { ok: 'deviceSetup.cameraOn', label: 'deviceSetup.camera', detail: 'deviceSetup.cameraOff' },
  nfc: { ok: 'deviceSetup.nfcOn', label: 'deviceSetup.nfc', detail: 'deviceSetup.nfcOff' },
};

const THEME_PREFERENCES: ThemePreference[] = ['system', 'dark', 'light'];

function rowText(row: SetupRow) {
  const text = ROW_TEXT[row.item];
  if (row.ok) return { label: t(text.ok) };
  // Without NFC hardware there is nothing to switch on.
  const detail = row.item === 'nfc' && !row.fixable ? t('deviceSetup.nfcMissing') : t(text.detail);
  return { label: t(text.label), detail, actionLabel: row.fixable ? t('deviceSetup.fix') : undefined };
}

// Device setup (specification: (supervisor)/device-setup; no design screen, it follows the readiness of B-Muszakkezdes):
// the checklist of what the phone needs, each missing item with its fix (the system dialog or settings screen), checked
// again when the app comes back; the theme, which only a supervisor changes; and the phone's error log (audit
// WP-APP-008). On the site phone all items, on a supervisor's own phone those of training and photos.
export default function DeviceSetupScreen() {
  const { color, typography, space } = useTheme();
  const insets = useSafeAreaInsets();
  const sitePhone = useSession((state) => state.mode === 'site_phone');
  const { readiness, fix } = useReadiness();
  const { preference, setPreference } = useThemePreference();

  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader title={t('deviceSetup.title')} onBack={() => router.back()} />
      <ScrollView style={styles.grow} contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.xxl, gap: space.m }}>
        <Text style={[typography.bodyRegular, { color: color.text2, paddingHorizontal: space.xs }]}>
          {t(sitePhone ? 'deviceSetup.introSitePhone' : 'deviceSetup.introOwnPhone')}
        </Text>

        <SectionTitle text={t('deviceSetup.checklist')} />
        {readiness !== null && (
          <Card divided>
            {setupRows(readiness, sitePhone ? 'site_phone' : 'supervisor_phone').map((row) => (
              <CheckRow key={row.item} ok={row.ok} {...rowText(row)} onAction={() => fix(row.item)} />
            ))}
          </Card>
        )}

        <SectionTitle text={t('theme.title')} />
        <SegmentedControl
          accessibilityLabel={t('theme.title')}
          options={THEME_PREFERENCES.map((value) => ({ value, label: t(`theme.${value}`) }))}
          value={preference}
          onChange={setPreference}
        />
        <Text style={[typography.small, { color: color.text2, paddingHorizontal: space.xs }]}>{t('deviceSetup.themeHint')}</Text>

        <ErrorLog />
      </ScrollView>
    </View>
  );
}

/** The last errors of the phone, the newest first, with a clear. */
function ErrorLog() {
  const { color, typography, space } = useTheme();
  const [entries, setEntries] = useState(() => readErrorLog(getDatabase()));
  useEffect(() => onErrorLogged(() => setEntries(readErrorLog(getDatabase()))), []);
  const rows = errorLogRows(entries, deviceTimeZone());
  return (
    <>
      <SectionTitle text={t('errorLog.title')} />
      <Text style={[typography.small, { color: color.text2, paddingHorizontal: space.xs }]}>
        {t('errorLog.hint', { count: ERROR_LOG_SIZE })}
      </Text>
      <Card divided>
        {rows.length === 0 ? (
          <Text style={[typography.bodyRegular, { color: color.text2, padding: space.l }]}>{t('errorLog.empty')}</Text>
        ) : (
          rows.map((row) => (
            <View key={row.key} style={{ padding: space.l, gap: space.xs }}>
              <Text style={[typography.label, { color: color.text }]}>{row.title}</Text>
              <Text style={[typography.small, { color: color.text2 }]} selectable>
                {row.detail}
              </Text>
            </View>
          ))
        )}
      </Card>
      {rows.length > 0 && <Button label={t('errorLog.clear')} variant="dangerText" onPress={() => clearErrorLog(getDatabase())} />}
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
