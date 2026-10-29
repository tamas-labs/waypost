import { Stack } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CategoryTile } from '@/components/category-tile';
import type { IconName } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { InfoBanner } from '@/components/info-banner';
import { PhotoAdd, PhotoSlot } from '@/components/photo-tile';
import { PIN_LENGTH, PinDots, PinPad } from '@/components/pin-pad';
import { PointListItem } from '@/components/point-list-item';
import { ProgressRing, ProgressSegments } from '@/components/progress';
import { ResultScreen } from '@/components/result-screen';
import { RoundTimeline, type TimelineRound } from '@/components/round-timeline';
import { SegmentedControl } from '@/components/segmented-control';
import { StatusBadge } from '@/components/status-badge';
import { StatusDot, type StatusKey } from '@/components/status-dot';
import { Switch } from '@/components/switch';
import { SyncIndicator } from '@/components/sync-indicator';
import { TextArea, TextField } from '@/components/text-field';
import { t, type TranslationKey } from '@/i18n';
import { useTheme, useThemePreference, type ThemePreference } from '@/theme/theme-provider';

const STATUSES: StatusKey[] = ['completed', 'in_progress', 'incomplete', 'missed', 'manual', 'time_suspicious', 'wrong_order', 'pending'];
const THEME_PREFERENCES: ThemePreference[] = ['system', 'dark', 'light'];

const HOURS = ['20', '21', '22', '23', '00', '01', '02', '03', '04', '05', '06', '07', '08'];
const NIGHT: TimelineRound[] = HOURS.map((hour, index) => ({
  id: hour,
  time: `${hour}:00`,
  state: index === 0 ? 'completed' : index === 1 ? 'incomplete' : index === 2 ? 'missed' : index === 3 ? 'next' : 'future',
}));

const CATEGORIES: { value: string; icon: IconName; label: TranslationKey }[] = [
  { value: 'vandalism', icon: 'vandalism', label: 'incident.vandalism' },
  { value: 'open_door', icon: 'door', label: 'incident.openDoor' },
  { value: 'water', icon: 'water', label: 'incident.water' },
  { value: 'stranger', icon: 'person', label: 'incident.stranger' },
];

// A picture for the photo tile: the app icon.
const SAMPLE_PHOTO = Image.resolveAssetSource(require('../../../assets/images/icon.png') as number)?.uri ?? '';

type ResultKind = 'success' | 'unknown' | 'order';

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
  const [category, setCategory] = useState('open_door');
  const [photos, setPhotos] = useState(1);
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(0);
  const [result, setResult] = useState<ResultKind | null>(null);

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

      {section('dev.components.sync')}
      <View style={[styles.row, styles.wrap, { gap: space.s }]}>
        <SyncIndicator state="synced" onPress={press(t('sync.synced'))} />
        <SyncIndicator state="online" />
        <SyncIndicator state="offline" count={2} />
        <SyncIndicator state="uploading" count={3} />
        <SyncIndicator state="error" />
      </View>

      {section('dev.components.points')}
      <PointListItem name={t('dev.components.pointName')} state="scanned" meta={t('dev.components.pointMeta')} />
      <PointListItem name={t('dev.components.pointBoiler')} state="manual" meta={t('dev.components.pointMetaManual')} />
      <PointListItem name={t('dev.components.pointStore')} state="suspicious" meta={t('dev.components.pointMetaSuspicious')} />
      <PointListItem name={t('dev.components.pointRoof')} state="pending" />
      <PointListItem name={t('dev.components.pointRoof')} state="pending" position={4} />
      <PointListItem name={t('dev.components.pointYard')} state="missing" />

      {section('dev.components.progress')}
      <Card>
        <View style={[styles.row, styles.center, { gap: space.xl }]}>
          <ProgressRing done={5} total={9} />
          <ProgressRing done={5} total={9} size="small" />
        </View>
        <ProgressSegments segments={['ok', 'ok', 'manual', 'ok', 'time', 'ok', null, null, null]} />
      </Card>

      {section('dev.components.timeline')}
      <Card>
        <RoundTimeline rounds={NIGHT} />
        <RoundTimeline rounds={NIGHT} variant="compact" />
        <RoundTimeline rounds={NIGHT} variant="mini" />
      </Card>

      {section('dev.components.photosAndCategories')}
      <View style={[styles.row, { gap: space.s }]}>
        {Array.from({ length: photos }, (_, index) => (
          <PhotoSlot key={index} uri={SAMPLE_PHOTO} number={index + 1} onPress={() => setPhotos((n) => n - 1)} />
        ))}
        <PhotoAdd disabled={photos >= 2} onPress={() => setPhotos((n) => n + 1)} />
        {photos < 1 && <View style={styles.flex} />}
      </View>
      <View accessibilityRole="radiogroup" style={[styles.row, styles.wrap, { gap: space.s }]}>
        {CATEGORIES.map((item) => (
          <CategoryTile
            key={item.value}
            icon={item.icon}
            label={t(item.label)}
            selected={category === item.value}
            onPress={() => setCategory(item.value)}
            style={styles.half}
          />
        ))}
        <CategoryTile icon="more" label={t('incident.other')} wide selected={category === 'other'} onPress={() => setCategory('other')} style={styles.full} />
      </View>

      {section('dev.components.pin')}
      <PinDots entered={pin.length} shakeKey={shake} />
      <PinPad
        onDigit={(digit) => setPin((current) => (current.length < PIN_LENGTH ? current + digit : current))}
        onDelete={() => setPin((current) => current.slice(0, -1))}
        onSupervisor={press(t('pin.supervisorMode'))}
      />
      <Button
        variant="secondary"
        label={t('dev.components.shake')}
        onPress={() => {
          setPin('');
          setShake((n) => n + 1);
        }}
      />

      {section('dev.components.results')}
      <View style={[styles.row, { gap: space.s }]}>
        <Button variant="secondary" label={t('dev.components.resultSuccess')} onPress={() => setResult('success')} style={styles.flex} />
        <Button variant="secondary" label={t('dev.components.resultUnknown')} onPress={() => setResult('unknown')} style={styles.flex} />
      </View>
      <Button variant="secondary" label={t('dev.components.resultOrder')} onPress={() => setResult('order')} />
      <Modal visible={result !== null} animationType="none" onRequestClose={() => setResult(null)}>
        {result !== null && <SampleResult kind={result} onClose={() => setResult(null)} />}
      </Modal>
    </ScrollView>
  );
}

function SampleResult({ kind, onClose }: { kind: ResultKind; onClose: () => void }) {
  const { color, typography, space, radius, border, fontFamily } = useTheme();
  const header = (
    <View style={[styles.row, styles.center, styles.between]}>
      <Text style={[typography.body, { color: color.text }]}>{t('round.title', { time: '22:00' })}</Text>
      <SyncIndicator state="offline" count={3} />
    </View>
  );
  const box = { padding: space.l, borderRadius: radius.card, backgroundColor: color.surface, borderWidth: border.thin, borderColor: color.cardBorder, gap: space.s };
  switch (kind) {
    case 'success':
      return (
        <ResultScreen
          tone="ok"
          icon="check"
          statusLine={t('scanResult.successLine', { time: '22:14', method: t('method.nfc') })}
          title={t('dev.components.pointRoof')}
          header={header}
          actions={
            <>
              <Button hero label={t('scanResult.next', { seconds: 3 })} onPress={onClose} />
              <Button variant="secondary" icon="flag" iconColor="warn" label={t('scanResult.incidentHere')} onPress={onClose} />
            </>
          }
        >
          <View style={box}>
            <View style={[styles.row, styles.between]}>
              <Text style={[typography.title2, styles.tabular, { color: color.text }]}>{t('scanResult.progress', { done: 6, total: 9 })}</Text>
              <Text style={[typography.small, styles.tabular, { color: color.text2 }]}>{t('scanResult.progressRest', { left: 3, time: '12:10' })}</Text>
            </View>
            <ProgressSegments segments={['ok', 'ok', 'ok', 'manual', 'ok', 'ok', null, null, null]} />
          </View>
          <View style={[styles.row, { padding: space.l, gap: space.m, borderRadius: radius.item, borderWidth: border.thick, borderStyle: 'dashed', borderColor: color.dash }]}>
            <Text style={[typography.bodyRegular, styles.flex, { color: color.text }]}>
              <Text style={{ fontFamily: fontFamily.extrabold }}>{`${t('scanResult.instruction')} `}</Text>
              {t('dev.components.instruction')}
            </Text>
          </View>
        </ResultScreen>
      );
    case 'unknown':
      return (
        <ResultScreen
          tone="miss"
          icon="x"
          statusLine={t('scanResult.unknownLine')}
          title={t('scanResult.unknownTitle')}
          body={t('scanResult.unknownBody')}
          header={header}
          actions={
            <>
              <Button hero label={t('scanResult.retry')} onPress={onClose} />
              <Button variant="secondary" icon="pencil" iconColor="manual" label={t('scanResult.damaged')} onPress={onClose} />
            </>
          }
        >
          <View style={box}>
            <Text style={[typography.small, { color: color.text2 }]}>{t('scanResult.readId')}</Text>
            <Text style={[typography.body, styles.tabular, { color: color.text }]}>{t('dev.components.tagId')}</Text>
          </View>
        </ResultScreen>
      );
    case 'order':
      return (
        <ResultScreen
          tone="warn"
          icon="swap"
          statusLine={t('scanResult.orderLine')}
          title={t('scanResult.orderTitle')}
          body={t('scanResult.orderBody', { expected: t('dev.components.pointBoiler') })}
          header={header}
          actions={<Button hero label={t('scanResult.ok')} onPress={onClose} />}
        />
      );
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  wrap: { flexWrap: 'wrap' },
  center: { alignItems: 'center' },
  flex: { flex: 1 },
  between: { justifyContent: 'space-between' },
  half: { flexBasis: '48%', flexGrow: 1 },
  full: { flexBasis: '100%' },
  tabular: { fontVariant: ['tabular-nums'] },
});
