import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { IconButton } from '@/components/icon-button';
import { InfoBanner } from '@/components/info-banner';
import { SegmentedControl } from '@/components/segmented-control';
import { StatusBadge } from '@/components/status-badge';
import { StatusDot, type StatusKey } from '@/components/status-dot';
import { Switch } from '@/components/switch';
import { TextArea, TextField } from '@/components/text-field';
import { t, type TranslationKey } from '@/i18n';
import { useTheme, useThemePreference, type ThemePreference } from '@/theme/theme-provider';

const STATUSES: StatusKey[] = ['completed', 'in_progress', 'incomplete', 'missed', 'manual', 'time_suspicious', 'wrong_order', 'pending'];
const THEME_PREFERENCES: ThemePreference[] = ['system', 'dark', 'light'];

// Developer tools: the base components (M3-26) in the current theme, to compare with T-Komponensek.dc.html.
export default function ComponentsScreen() {
  const { color, typography, space } = useTheme();
  const { preference, setPreference } = useThemePreference();
  const [pressed, setPressed] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [switchOn, setSwitchOn] = useState(true);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');

  const section = (key: TranslationKey) => <Text style={[typography.label, { color: color.text2, marginTop: space.l }]}>{t(key)}</Text>;
  const press = (label: string) => () => setPressed(label);

  return (
    <ScrollView style={{ backgroundColor: color.bg }} contentContainerStyle={{ padding: space.l, gap: space.m }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t('dev.screens.components') }} />
      <SegmentedControl
        accessibilityLabel={t('theme.title')}
        options={THEME_PREFERENCES.map((value) => ({ value, label: t(`theme.${value}`) }))}
        value={preference}
        onChange={setPreference}
      />
      {pressed !== null && <Text style={[typography.small, { color: color.text2 }]}>{t('dev.components.pressed', { label: pressed })}</Text>}

      {section('dev.components.buttons')}
      <Button hero icon="nfc" label={t('round.scan')} onPress={press(t('round.scan'))} />
      <Button label={t('incident.submit')} onPress={press(t('incident.submit'))} />
      <View style={[styles.row, { gap: space.s }]}>
        <Button variant="secondary" label={t('common.cancel')} onPress={press(t('common.cancel'))} style={styles.flex} />
        <Button variant="dashed" label={t('dev.components.add')} onPress={press(t('dev.components.add'))} style={styles.flex} />
      </View>
      <View style={[styles.row, styles.center, { gap: space.m }]}>
        <IconButton size="large" icon="flag" iconColor="warn" accessibilityLabel={t('round.recordIncident')} onPress={press(t('round.recordIncident'))} />
        <IconButton icon="back" accessibilityLabel={t('common.back')} onPress={press(t('common.back'))} />
        <IconButton size="map" icon="navigation" accessibilityLabel={t('round.centerMe')} onPress={press(t('round.centerMe'))} />
        <Button variant="warnTonal" label={t('shiftStart.fix')} onPress={press(t('shiftStart.fix'))} />
      </View>
      <View style={[styles.row, styles.center, { gap: space.m }]}>
        <Button variant="dangerText" label={t('scanResult.damaged')} onPress={press(t('scanResult.damaged'))} />
      </View>
      <Button disabled label={t('dev.components.disabled')} onPress={press(t('dev.components.disabled'))} />

      {section('dev.components.statuses')}
      <View style={[styles.row, styles.wrap, { gap: space.s }]}>
        {STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </View>
      <View style={[styles.row, styles.wrap, { gap: space.s }]}>
        {STATUSES.map((status) => (
          <StatusDot key={status} status={status} />
        ))}
        <StatusDot status="missed" filled />
        <StatusDot number={3} />
      </View>

      {section('dev.components.cardsAndBanners')}
      <Card>
        <View style={[styles.row, styles.center, { gap: space.m }]}>
          <StatusDot status="completed" />
          <View style={styles.flex}>
            <Text style={[typography.body, { color: color.text }]}>{t('dev.components.pointName')}</Text>
            <Text style={[typography.small, styles.tabular, { color: color.text2 }]}>{t('dev.components.pointMeta')}</Text>
          </View>
        </View>
      </Card>
      <InfoBanner variant="info" text={t('alarm.timingNote')} />
      <InfoBanner variant="warn" text={t('shiftStart.batteryWarn')} />
      <InfoBanner variant="offline" title={t('shiftEnd.queued', { count: 3 })} text={t('shiftEnd.queuedBody')} />
      <InfoBanner variant="manual" text={t('manual.info')} />
      <InfoBanner variant="success" text={t('incident.saved')} />

      {section('dev.components.fields')}
      <TextField label={t('supervisor.email')} requirement="required" value={name} onChangeText={setName} placeholder={t('dev.components.fieldPlaceholder')} />
      <TextField label={t('supervisor.password')} secret value={password} onChangeText={setPassword} error={password === '' ? t('dev.components.fieldError') : undefined} />
      <TextArea label={t('common.note')} requirement="optional" value={note} onChangeText={setNote} />

      {section('dev.components.controls')}
      <SegmentedControl
        options={[
          { value: 'list', label: t('round.list') },
          { value: 'map', label: t('round.map') },
        ]}
        value={view}
        onChange={setView}
      />
      <View style={[styles.row, styles.center, { gap: space.m }]}>
        <Text style={[typography.body, styles.flex, { color: color.text }]}>{t('dev.components.switchLabel')}</Text>
        <Switch accessibilityLabel={t('dev.components.switchLabel')} value={switchOn} onValueChange={setSwitchOn} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  wrap: { flexWrap: 'wrap' },
  center: { alignItems: 'center' },
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
});
