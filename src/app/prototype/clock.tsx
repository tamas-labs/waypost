import { getBootId, getUptimeMs } from '@modules/waypost-clock';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

interface Reading {
  deviceMs: number;
  uptimeMs: number;
}

function read(): Reading {
  return { deviceMs: Date.now(), uptimeMs: getUptimeMs() };
}

function readBootId(): string {
  try {
    return getBootId();
  } catch (error) {
    return t('prototype.clock.unavailable', { error: error instanceof Error ? error.message : String(error) });
  }
}

/** h:mm:ss */
function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(total / 3600)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

// M1-03 device test: uptime must keep growing while the phone sleeps, and the boot ID must change on restart.
export default function ClockScreen() {
  const { color, typography, space, radius } = useTheme();
  const [first] = useState(read);
  const [now, setNow] = useState(first);
  const [bootId] = useState(readBootId);

  useEffect(() => {
    const timer = setInterval(() => setNow(read()), 1000);
    return () => clearInterval(timer);
  }, []);

  const deviceDelta = now.deviceMs - first.deviceMs;
  const uptimeDelta = now.uptimeMs - first.uptimeMs;
  const numbers = [typography.title2, styles.tabular, { color: color.text }];
  const label = [typography.label, { color: color.text2 }];
  const card = { backgroundColor: color.surface, borderColor: color.cardBorder, borderRadius: radius.card, padding: space.l, gap: space.s };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, gap: space.l }}>
      <Stack.Screen options={{ title: t('prototype.clock.title') }} />
      <View style={[styles.card, card]}>
        <Text style={label}>{t('prototype.clock.uptime')}</Text>
        <Text style={[typography.counter, styles.tabular, { color: color.text }]}>{formatDuration(now.uptimeMs)}</Text>
        <Text style={numbers}>{t('prototype.clock.seconds', { seconds: Math.floor(now.uptimeMs / 1000) })}</Text>
        <Text style={label}>{t('prototype.clock.bootId')}</Text>
        <Text style={[typography.bodyRegular, { color: color.text }]} selectable>
          {bootId}
        </Text>
        <Text style={label}>{t('prototype.clock.deviceTime')}</Text>
        <Text style={numbers}>{new Date(now.deviceMs).toISOString()}</Text>
      </View>
      <View style={[styles.card, card]}>
        <Text style={label}>{t('prototype.clock.sinceOpen')}</Text>
        <Text style={numbers}>{t('prototype.clock.deviceDelta', { seconds: Math.round(deviceDelta / 1000) })}</Text>
        <Text style={numbers}>{t('prototype.clock.uptimeDelta', { seconds: Math.round(uptimeDelta / 1000) })}</Text>
        <Text style={[numbers, { color: Math.abs(deviceDelta - uptimeDelta) < 1000 ? color.ok : color.miss }]}>
          {t('prototype.clock.drift', { ms: deviceDelta - uptimeDelta })}
        </Text>
      </View>
      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('prototype.clock.hint')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
});
