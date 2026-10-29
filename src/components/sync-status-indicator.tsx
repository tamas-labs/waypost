import type { Timestamp } from '@waypost/schema';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type HostInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { t } from '@/i18n';
import { useSyncStatus, type SyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';
import { parseTimestamp } from '@/time/timestamp';
import { localDateOf, localTimeOf } from '@/time/zone';

import { Button } from './button';
import { Card } from './card';
import { InfoBanner } from './info-banner';
import { SyncIndicator, type SyncState } from './sync-indicator';

export type SyncIndicatorInput = Pick<SyncStatus, 'online' | 'running' | 'pendingCount' | 'lastSuccessAt' | 'lastError'>;

/**
 * The chip state of the sync status: offline wins (the items wait for the network), then an upload in progress, then
 * the error of the last sync, then synced (nothing waits and a sync has succeeded), else online. A sync with nothing
 * to upload (a pull) does not change the chip. Before the first NetInfo report the phone counts as online.
 */
export function syncIndicatorState({ online, running, pendingCount, lastSuccessAt, lastError }: SyncIndicatorInput): SyncState {
  if (online === false) return 'offline';
  if (running && pendingCount > 0) return 'uploading';
  if (lastError !== null) return 'error';
  if (pendingCount === 0 && lastSuccessAt !== null) return 'synced';
  return 'online';
}

/** The time of the last sync in the time zone: HH:MM on the day of now, with the month and day before it otherwise. */
export function formatSyncTime(at: Timestamp, nowMs: number, timeZone: string): string {
  const atMs = parseTimestamp(at);
  const time = localTimeOf(atMs, timeZone);
  const date = localDateOf(atMs, timeZone);
  if (date === localDateOf(nowMs, timeZone)) return time;
  const [, month = '', day = ''] = date.split('-');
  return t('sync.dateTime', { month, day, time });
}

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The sync indicator of the screen headers (specification, Mobilapp: on every screen; DESIGN_HANDOFF 5.3): the chip
 * from the sync status, and on a tap the details below it – the last successful sync, the items waiting for upload,
 * what is wrong, and "Szinkronizálás most".
 */
export function SyncStatusIndicator() {
  const status = useSyncStatus(useShallow(({ online, running, pendingCount, lastSuccessAt, lastError }) => ({ online, running, pendingCount, lastSuccessAt, lastError })));
  const chip = useRef<HostInstance>(null);
  // When the details were opened (device clock): the last sync is shown with its date if it was not on that day.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const show = () => {
    setOpenedAt(Date.now());
    chip.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  };

  return (
    <>
      <SyncIndicator
        ref={chip}
        state={syncIndicatorState(status)}
        count={status.pendingCount}
        onPress={show}
        expanded={openedAt !== null}
        accessibilityHint={t('sync.detailsHint')}
      />
      {openedAt !== null && <SyncDetails status={status} anchor={anchor} now={openedAt} onClose={() => setOpenedAt(null)} />}
    </>
  );
}

interface SyncDetailsProps {
  status: SyncIndicatorInput;
  anchor: Anchor | null;
  now: number;
  onClose: () => void;
}

function SyncDetails({ status, anchor, now, onClose }: SyncDetailsProps) {
  const { color, typography, space, size } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { online, running, pendingCount, lastSuccessAt, lastError } = status;

  // Below the chip, centred on it but within the screen margins: a chip at the right gets a right-aligned panel.
  const width = Math.min(size.syncPanel, window.width - 2 * space.l);
  const maxLeft = window.width - space.l - width;
  const top = anchor === null ? insets.top + size.touchMin : anchor.y + anchor.height + space.s;
  const left = anchor === null ? maxLeft : Math.min(Math.max(anchor.x + anchor.width / 2 - width / 2, space.l), maxLeft);

  const lastSync = lastSuccessAt === null ? t('sync.lastSyncNever') : t('sync.lastSync', { time: formatSyncTime(lastSuccessAt, now, deviceTimeZone()) });
  const pending = pendingCount > 0 ? t('sync.pending', { count: pendingCount }) : t('sync.pendingNone');

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* A tap anywhere outside the panel closes it; for a screen reader it is the close button. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('sync.close')} />
      <View style={[styles.panel, { top, left, width }]}>
        <Card>
          <View style={{ gap: space.xs }}>
            <Text style={[typography.body, styles.tabular, { color: color.text }]}>{lastSync}</Text>
            <Text style={[typography.small, styles.tabular, { color: color.text2 }]}>{pending}</Text>
          </View>
          {online === false ? (
            <InfoBanner variant="offline" icon="cloudOff" text={t('sync.offlineDetail')} />
          ) : (
            lastError !== null && <InfoBanner variant="error" text={t(`sync.errors.${lastError.kind}`)} />
          )}
          <Button
            variant="secondary"
            icon="refresh"
            label={running ? t('sync.running') : t('sync.syncNow')}
            disabled={running}
            onPress={() => void useSyncStatus.getState().syncNow()}
          />
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute' },
  tabular: { fontVariant: ['tabular-nums'] },
});
