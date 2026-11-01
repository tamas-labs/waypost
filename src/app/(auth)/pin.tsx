import { useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { allAlarmPermissionsGranted, getAlarmPermissions, type AlarmPermissions } from '@/alarms/permissions';
import { Button } from '@/components/button';
import { InfoBanner } from '@/components/info-banner';
import { PIN_LENGTH, PinDots, PinPad } from '@/components/pin-pad';
import { SyncStatusIndicator } from '@/components/sync-status-indicator';
import { getDatabase } from '@/db/open';
import { signInWithPin } from '@/guard/login';
import { loadPinScreenInfo, type PinScreenInfo } from '@/guard/login-screens';
import { useLiveQuery } from '@/hooks/use-live-query';
import { usePinEntry } from '@/hooks/use-pin-entry';
import { t, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import { parseTimestamp } from '@/time/timestamp';
import { DAY_MS, localTimeOf, naiveOf } from '@/time/zone';

/** The line above the keypad and below the dots after a try. */

/** The time and the shift change while the screen is open (and the trusted time comes with a sync). */
const INFO_REFRESH_MS = 30_000;

/** Jó reggelt from 4 to 9, Jó napot until 18, Jó estét after (DESIGN_HANDOFF 6, G1), by the site's clock. */
function greeting(info: PinScreenInfo): TranslationKey {
  const hour = Math.floor((naiveOf(parseTimestamp(info.now), info.timezone) % DAY_MS) / 3_600_000);
  if (hour >= 4 && hour < 9) return 'pin.greetingMorning';
  if (hour >= 9 && hour < 18) return 'pin.greetingDay';
  return 'pin.greetingEvening';
}

function shiftLine(info: PinScreenInfo | null): string | null {
  if (info === null) return null;
  if (info.on_shift !== null) return t('pin.onShift', { name: info.on_shift });
  if (info.next_round === null) return null;
  const time = localTimeOf(parseTimestamp(info.next_round.scheduled_at), info.timezone);
  return info.next_round.starts_shift ? t('pin.shiftStartsAt', { time }) : t('pin.nextRoundAt', { time });
}

function missingAlarmSettings(permissions: AlarmPermissions): string {
  const missing: TranslationKey[] = [];
  if (!permissions.notifications.granted) missing.push('pin.alarmNotifications');
  if (permissions.exactAlarms === false) missing.push('pin.alarmExact');
  if (permissions.batteryExempt === false) missing.push('pin.alarmBattery');
  return missing.map((key) => t(key)).join(', ');
}

const loadInfo = () => loadPinScreenInfo(getDatabase());

/** The site's information, reloaded after a pull, a chain entry (e.g. an automatic shift close), and every 30 s. */
function usePinScreenInfo(): PinScreenInfo | null {
  return useLiveQuery(loadInfo, INFO_REFRESH_MS);
}

/** The alarm settings, checked again whenever the app comes back (e.g. from the system settings). */
function useAlarmPermissions(): AlarmPermissions | null {
  const [permissions, setPermissions] = useState<AlarmPermissions | null>(null);
  useEffect(() => {
    let current = true;
    const check = () => {
      getAlarmPermissions().then(
        (result) => current && setPermissions(result),
        (error: unknown) => __DEV__ && console.warn('Checking the alarm permissions failed', error),
      );
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => {
      current = false;
      subscription.remove();
    };
  }, []);
  return permissions;
}

// PIN login (G1, B-PIN): the site, a greeting, the shift, the sync status, and the keypad. A guard's PIN starts or
// continues the shift (or takes it over), a supervisor's opens the supervisor mode; the navigation follows the session.
export default function PinScreen() {
  const { color, typography, space } = useTheme();
  const insets = useSafeAreaInsets();
  const info = usePinScreenInfo();
  const permissions = useAlarmPermissions();
  const entry = usePinEntry((pin) => signInWithPin(getDatabase(), pin), 'pin.failed');
  const { pin, shakeKey, checking, locked, messageText } = entry;
  const [supervisorHint, setSupervisorHint] = useState(false);

  const enabled = info !== null && !locked && !checking;
  const line = shiftLine(info);

  return (
    <ScrollView
      style={{ backgroundColor: color.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl, paddingHorizontal: space.xxl, gap: space.xxl },
      ]}
    >
      {/* The chip sizes itself; this row centres it. */}
      <View style={styles.centre}>
        <SyncStatusIndicator />
      </View>

      {permissions !== null && !allAlarmPermissionsGranted(permissions) && (
        <InfoBanner
          variant="warn"
          title={t('pin.alarmsTitle')}
          text={t('pin.alarmsMissing', { missing: missingAlarmSettings(permissions) })}
          style={styles.wide}
        />
      )}

      <View style={[styles.centre, { gap: space.s }]}>
        {info !== null && info.site_name !== '' && (
          <Text style={[typography.siteName, styles.text, { color: color.text2 }]}>{info.site_name}</Text>
        )}
        <Text style={[typography.title1, styles.text, { color: color.text }]} accessibilityRole="header">
          {/* Before the first pull the site's clock is not known. */}
          {info === null ? t('pin.title') : t(greeting(info))}
        </Text>
        {line !== null && <Text style={[typography.bodyRegular, styles.text, styles.tabular, { color: color.text2 }]}>{line}</Text>}
      </View>

      {info === null && <InfoBanner variant="info" text={t('pin.notPulled')} style={styles.wide} />}

      <View style={[styles.centre, { gap: space.m }]}>
        <PinDots entered={pin.length} shakeKey={shakeKey} />
        {messageText !== null && (
          <Text
            style={[typography.body, styles.text, styles.tabular, { color: color.miss }]}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {messageText}
          </Text>
        )}
        {supervisorHint && <InfoBanner variant="info" text={t('pin.supervisorHint')} style={styles.wide} />}
      </View>

      <View style={[styles.pad, styles.wide]}>
        <PinPad
          disabled={!enabled}
          onDigit={(digit) => {
            setSupervisorHint(false);
            entry.addDigit(digit);
          }}
          onDelete={entry.deleteDigit}
          onSupervisor={() => setSupervisorHint((shown) => !shown)}
        />
      </View>

      <Button
        label={checking ? t('pin.checking') : info !== null && info.on_shift !== null ? t('pin.signIn') : t('pin.startShift')}
        disabled={!enabled || pin.length < PIN_LENGTH}
        onPress={() => {
          setSupervisorHint(false);
          void entry.submit();
        }}
        style={styles.wide}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center' },
  centre: { alignItems: 'center' },
  wide: { alignSelf: 'stretch' },
  // The keypad sits low, near the thumb, on a tall screen.
  pad: { marginTop: 'auto' },
  text: { textAlign: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
});
