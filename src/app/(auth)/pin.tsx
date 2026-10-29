import { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { allAlarmPermissionsGranted, getAlarmPermissions, type AlarmPermissions } from '@/alarms/permissions';
import { pinLockRemaining } from '@/auth/pin';
import { onChainEntries } from '@/chain/events';
import { Button } from '@/components/button';
import { InfoBanner } from '@/components/info-banner';
import { PIN_LENGTH, PinDots, PinPad } from '@/components/pin-pad';
import { SyncStatusIndicator } from '@/components/sync-status-indicator';
import { getDatabase } from '@/db/open';
import { LOCK_AFTER_FAILURES } from '@/domain/pin-lockout';
import { playFeedback } from '@/feedback/feedback';
import { loadPinScreenInfo, signInWithPin, type PinScreenInfo } from '@/guard/login';
import { t, type TranslationKey } from '@/i18n';
import { onConfigurationPulled } from '@/sync/events';
import { useTheme } from '@/theme/theme-provider';
import { parseTimestamp } from '@/time/timestamp';
import { DAY_MS, localTimeOf, naiveOf } from '@/time/zone';

/** The line above the keypad and below the dots after a try. */
type Message = { kind: 'wrong'; failures: number } | { kind: 'failed' } | { kind: 'supervisor' } | null;

/** The time and the shift change while the screen is open (and the trusted time comes with a sync). */
const INFO_REFRESH_MS = 30_000;
/** A wrong PIN says how many tries are left once this few remain. */
const WARN_ATTEMPTS_LEFT = 2;

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

/** m:ss of a lock, rounded up to the second. */
function lockTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function missingAlarmSettings(permissions: AlarmPermissions): string {
  const missing: TranslationKey[] = [];
  if (!permissions.notifications.granted) missing.push('pin.alarmNotifications');
  if (permissions.exactAlarms === false) missing.push('pin.alarmExact');
  if (permissions.batteryExempt === false) missing.push('pin.alarmBattery');
  return missing.map((key) => t(key)).join(', ');
}

/** The site's information, reloaded after a pull, a chain entry (e.g. an automatic shift close), and every 30 s. */
function usePinScreenInfo(): PinScreenInfo | null {
  const [info, setInfo] = useState(() => loadPinScreenInfo(getDatabase()));
  useEffect(() => {
    const reload = () => setInfo(loadPinScreenInfo(getDatabase()));
    const stops = [onConfigurationPulled(reload), onChainEntries(reload)];
    const interval = setInterval(reload, INFO_REFRESH_MS);
    return () => {
      stops.forEach((stop) => stop());
      clearInterval(interval);
    };
  }, []);
  return info;
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

/** While locked: the time left, counted down every second. */
function usePinLock(): [number, () => void] {
  const [remaining, setRemaining] = useState(() => pinLockRemaining(getDatabase()));
  const refresh = useCallback(() => setRemaining(pinLockRemaining(getDatabase())), []);
  const locked = remaining > 0;
  useEffect(() => {
    if (!locked) return undefined;
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [locked, refresh]);
  return [remaining, refresh];
}

// PIN login (G1, B-PIN): the site, a greeting, the shift, the sync status, and the keypad. A guard's PIN starts or
// continues the shift (or takes it over), a supervisor's opens the supervisor mode; the navigation follows the session.
export default function PinScreen() {
  const { color, typography, space } = useTheme();
  const insets = useSafeAreaInsets();
  const info = usePinScreenInfo();
  const permissions = useAlarmPermissions();
  const [lockRemaining, refreshLock] = usePinLock();
  const [pin, setPin] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [message, setMessage] = useState<Message>(null);
  const [checking, setChecking] = useState(false);

  const locked = lockRemaining > 0;
  const enabled = info !== null && !locked && !checking;
  const line = shiftLine(info);

  const addDigit = (digit: string) => {
    setMessage(null);
    setPin((current) => (current.length < PIN_LENGTH ? current + digit : current));
  };

  const submit = async () => {
    setChecking(true);
    try {
      const result = await signInWithPin(getDatabase(), pin);
      // A successful login leaves the screen (the navigation follows the session).
      if (result.status === 'ok') return;
      setPin('');
      setShakeKey((n) => n + 1);
      playFeedback('error');
      // A lock tells about itself.
      setMessage(result.status === 'wrong' && result.remaining_ms === 0 ? { kind: 'wrong', failures: result.failures } : null);
      refreshLock();
    } catch (error) {
      if (__DEV__) console.warn('PIN login failed', error);
      setPin('');
      playFeedback('error');
      setMessage({ kind: 'failed' });
    } finally {
      setChecking(false);
    }
  };

  let messageText: string | null = null;
  if (locked) messageText = t('pin.locked', { time: lockTime(lockRemaining) });
  else if (message?.kind === 'wrong') {
    const left = LOCK_AFTER_FAILURES - message.failures;
    messageText = left > 0 && left <= WARN_ATTEMPTS_LEFT ? t('pin.attemptsLeft', { count: left }) : t('pin.wrongPin');
  } else if (message?.kind === 'failed') messageText = t('pin.failed');

  return (
    <ScrollView
      style={{ backgroundColor: color.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl, paddingHorizontal: space.xxl, gap: space.xxl }]}
    >
      {/* The chip sizes itself; this row centres it. */}
      <View style={styles.centre}>
        <SyncStatusIndicator />
      </View>

      {permissions !== null && !allAlarmPermissionsGranted(permissions) && (
        <InfoBanner variant="warn" title={t('pin.alarmsTitle')} text={t('pin.alarmsMissing', { missing: missingAlarmSettings(permissions) })} style={styles.wide} />
      )}

      <View style={[styles.centre, { gap: space.s }]}>
        {info !== null && info.site_name !== '' && <Text style={[typography.siteName, styles.text, { color: color.text2 }]}>{info.site_name}</Text>}
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
          <Text style={[typography.body, styles.text, styles.tabular, { color: color.miss }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
            {messageText}
          </Text>
        )}
        {message?.kind === 'supervisor' && <InfoBanner variant="info" text={t('pin.supervisorHint')} style={styles.wide} />}
      </View>

      <View style={[styles.pad, styles.wide]}>
        <PinPad
          disabled={!enabled}
          onDigit={addDigit}
          onDelete={() => setPin((current) => current.slice(0, -1))}
          onSupervisor={() => setMessage((current) => (current?.kind === 'supervisor' ? null : { kind: 'supervisor' }))}
        />
      </View>

      <Button
        label={checking ? t('pin.checking') : info !== null && info.on_shift !== null ? t('pin.signIn') : t('pin.startShift')}
        disabled={!enabled || pin.length < PIN_LENGTH}
        onPress={() => void submit()}
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
