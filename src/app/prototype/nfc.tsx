import { Stack } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { playFeedback } from '@/feedback/feedback';
import { t } from '@/i18n';
import { openNfcSettings } from '@/nfc/reader';
import type { TagReading } from '@/nfc/tag';
import { useTagReader } from '@/nfc/use-tag-reader';
import { useTheme } from '@/theme/theme-provider';

interface Reading {
  key: number;
  at: Date;
  tag: TagReading;
}

/** The screen keeps the latest reads only. */
const MAX_READINGS = 20;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** HH:MM:SS, local time. */
function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** android.nfc.tech.NfcA → NfcA */
function techText(tech: string[]): string {
  return tech.map((name) => name.replace(/^android\.nfc\.tech\./, '')).join(', ');
}

// M1-04 device test: UID and raw NDEF of NTAG21x and NTAG 424 DNA tags. Android reads while the screen is open,
// iOS reads one tag per press of the Scan button (useTagReader, M3-22). A tag with a valid UID gives the success
// feedback, one without the error feedback.
export default function NfcScreen() {
  const { color, typography, space, radius, size } = useTheme();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [settingsError, setSettingsError] = useState<unknown>(null);
  const nextKey = useRef(0);

  const addReading = useCallback((tag: TagReading) => {
    const key = nextKey.current++;
    playFeedback(tag.uid !== null ? 'success' : 'error');
    setReadings((previous) => [{ key, at: new Date(), tag }, ...previous].slice(0, MAX_READINGS));
  }, []);
  const { status, reading, read, error: readError } = useTagReader(addReading);
  const failure = readError ?? settingsError;
  const error = failure === null ? null : errorText(failure);

  const label = [typography.label, { color: color.text2 }];
  const body = [typography.bodyRegular, { color: color.text }];
  const small = [typography.small, { color: color.text2 }];
  const card = { backgroundColor: color.surface, borderColor: color.cardBorder, borderRadius: radius.card, padding: space.l, gap: space.s };

  let statusText = t('prototype.nfc.checking');
  let statusColor = color.text2;
  if (status && !status.supported) {
    statusText = t('prototype.nfc.unsupported');
    statusColor = color.miss;
  } else if (status && !status.enabled) {
    statusText = t('prototype.nfc.disabled');
    statusColor = color.miss;
  } else if (status) {
    statusText = t('prototype.nfc.enabled');
    statusColor = color.ok;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, gap: space.l }}>
      <Stack.Screen options={{ title: t('prototype.nfc.title') }} />
      <View style={[styles.card, card]}>
        <Text style={label}>{t('prototype.nfc.status')}</Text>
        <Text style={[typography.body, { color: statusColor }]}>{statusText}</Text>
        {Platform.OS === 'android' && status?.supported && !status.enabled && (
          <Pressable
            accessibilityRole="button"
            onPress={() => openNfcSettings().catch(setSettingsError)}
            style={[styles.button, { backgroundColor: color.bg, borderRadius: radius.pill, minHeight: size.buttonSecondary }]}
          >
            <Text style={[typography.buttonSm, { color: color.text }]}>{t('prototype.nfc.openSettings')}</Text>
          </Pressable>
        )}
        {status?.enabled && <Text style={body}>{t(Platform.OS === 'android' ? 'prototype.nfc.listening' : 'prototype.nfc.pressToRead')}</Text>}
        {error !== null && <Text style={[typography.bodyRegular, { color: color.miss }]}>{t('prototype.nfc.error', { error })}</Text>}
      </View>

      {Platform.OS === 'ios' && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: reading || !status?.enabled }}
          disabled={reading || !status?.enabled}
          onPress={read}
          style={[
            styles.button,
            { backgroundColor: color.accent, borderRadius: radius.pill, minHeight: size.buttonHero, opacity: reading || !status?.enabled ? 0.5 : 1 },
          ]}
        >
          <Text style={[typography.button, { color: color.onAccent }]}>{t('round.scan')}</Text>
        </Pressable>
      )}

      {readings.length === 0 && <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('prototype.nfc.empty')}</Text>}
      {readings.map(({ key, at, tag }) => (
        <View key={key} style={[styles.card, card]}>
          <Text style={[small, styles.tabular]}>{t('prototype.nfc.readAt', { time: formatTime(at), tech: techText(tag.tech) })}</Text>
          <Text style={label}>{t('prototype.nfc.uid')}</Text>
          {tag.uid !== null ? (
            <Text style={[typography.title2, styles.tabular, { color: color.text }]} selectable>
              {tag.uid}
            </Text>
          ) : (
            <Text style={[typography.body, { color: color.miss }]}>
              {tag.rawId !== null ? t('prototype.nfc.uidInvalid', { raw: tag.rawId }) : t('prototype.nfc.uidMissing')}
            </Text>
          )}
          <Text style={label}>{t('prototype.nfc.ndef')}</Text>
          {tag.ndefLength === 0 ? (
            <Text style={body}>{t('prototype.nfc.ndefEmpty')}</Text>
          ) : (
            <>
              <Text style={[body, styles.tabular]}>{t('prototype.nfc.ndefSummary', { bytes: tag.ndefLength, records: tag.records.length })}</Text>
              {tag.records.map((record, index) => (
                <View key={index}>
                  <Text style={[small, styles.tabular]}>{t('prototype.nfc.record', { tnf: record.tnf, type: record.type, bytes: record.payloadLength })}</Text>
                  {record.text !== null && (
                    <Text style={body} selectable>
                      {record.text}
                    </Text>
                  )}
                </View>
              ))}
              {tag.ndefRaw !== null ? (
                <Text style={small} selectable>
                  {tag.ndefRaw}
                </Text>
              ) : (
                <Text style={[typography.small, { color: color.warn }]}>{t('prototype.nfc.ndefTooLong', { bytes: tag.ndefLength })}</Text>
              )}
            </>
          )}
        </View>
      ))}

      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('prototype.nfc.hint')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  button: { alignItems: 'center', justifyContent: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
});
