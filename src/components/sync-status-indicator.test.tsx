import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setSyncNowHandler, useSyncStatus } from '@/sync/status';
import { ThemeProvider } from '@/theme/theme-provider';

import { ScreenHeader } from './screen-header';
import { formatSyncTime, syncIndicatorState, SyncStatusIndicator, type SyncIndicatorInput } from './sync-status-indicator';

const IDLE: SyncIndicatorInput = { online: true, running: false, pendingCount: 0, lastSuccessAt: null, lastError: null };
const NETWORK_ERROR = { kind: 'network' as const, step: 'pull' as const, message: 'offline', at: '2026-10-29T20:00:00.000Z' };
const initial = useSyncStatus.getState();
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

afterEach(() => {
  useSyncStatus.setState(initial, true);
  setSyncNowHandler(() => Promise.resolve({ status: 'skipped' }));
});

describe('the chip state', () => {
  it('is synced once a sync succeeded and nothing waits, online before the first one or while items wait', () => {
    expect(syncIndicatorState({ ...IDLE, lastSuccessAt: '2026-10-29T20:00:00.000Z' })).toBe('synced');
    expect(syncIndicatorState(IDLE)).toBe('online');
    expect(syncIndicatorState({ ...IDLE, lastSuccessAt: '2026-10-29T20:00:00.000Z', pendingCount: 2 })).toBe('online');
    // Before the first NetInfo report.
    expect(syncIndicatorState({ ...IDLE, online: null })).toBe('online');
  });

  it('is offline without network, whatever else is going on', () => {
    expect(syncIndicatorState({ ...IDLE, online: false, running: true, pendingCount: 3, lastError: NETWORK_ERROR })).toBe('offline');
  });

  it('is uploading while a sync runs with items waiting; a sync with nothing to upload keeps the state', () => {
    expect(syncIndicatorState({ ...IDLE, running: true, pendingCount: 3, lastError: NETWORK_ERROR })).toBe('uploading');
    expect(syncIndicatorState({ ...IDLE, running: true, lastSuccessAt: '2026-10-29T20:00:00.000Z' })).toBe('synced');
    expect(syncIndicatorState({ ...IDLE, running: true, lastError: NETWORK_ERROR })).toBe('error');
  });

  it('shows the error of the last sync until a successful one', () => {
    expect(syncIndicatorState({ ...IDLE, lastSuccessAt: '2026-10-29T19:00:00.000Z', lastError: NETWORK_ERROR })).toBe('error');
  });
});

describe('the time of the last sync', () => {
  const now = Date.parse('2026-10-29T21:30:00.000Z');

  it('is HH:MM on the same local day, with the month and day otherwise', () => {
    expect(formatSyncTime('2026-10-29T21:14:00.000Z', now, 'Europe/Budapest')).toBe('22:14');
    expect(formatSyncTime('2026-10-28T21:14:00.000Z', now, 'Europe/Budapest')).toBe('10. 28. 22:14');
  });

  it('counts the day in the time zone, not in UTC', () => {
    // 23:30 UTC on the 28th is already the 29th in Budapest.
    expect(formatSyncTime('2026-10-28T23:30:00.000Z', now, 'Europe/Budapest')).toBe('00:30');
  });
});

async function renderIndicator() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <SyncStatusIndicator />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('the indicator', () => {
  it('follows the sync status', async () => {
    useSyncStatus.setState({ online: true, pendingCount: 0, lastSuccessAt: '2026-10-29T20:00:00.000Z' });
    await renderIndicator();
    expect(screen.getByRole('button', { name: 'Szinkronizálva' })).toBeOnTheScreen();
    await act(() => useSyncStatus.setState({ online: false, pendingCount: 2 }));
    expect(screen.getByRole('button', { name: 'Offline · 2 vár' })).toBeOnTheScreen();
    await act(() => useSyncStatus.setState({ online: true, running: true }));
    expect(screen.getByRole('button', { name: 'Feltöltés… 2' })).toBeOnTheScreen();
  });

  it('opens the details on a tap: last sync, what waits, "Sync now"', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-10-29T21:30:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
    try {
      useSyncStatus.setState({ online: true, pendingCount: 3, lastSuccessAt: '2026-10-29T21:14:00.000Z' });
      const syncNow = jest.fn(async () => ({ status: 'ok' as const }));
      setSyncNowHandler(syncNow);
      await renderIndicator();
      expect(screen.queryByText('Szinkronizálás most')).toBeNull();

      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Online · 3 vár' })));
      expect(screen.getByRole('button', { name: 'Online · 3 vár' })).toBeExpanded();
      // In the time zone of the device.
      expect(screen.getByText(`Utolsó szinkron: ${formatSyncTime('2026-10-29T21:14:00.000Z', Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone)}`)).toBeOnTheScreen();
      expect(screen.getByText('3 tétel vár feltöltésre')).toBeOnTheScreen();

      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Szinkronizálás most' })));
      expect(syncNow).toHaveBeenCalledTimes(1);

      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Szinkron részleteinek bezárása' })));
      expect(screen.queryByText('Szinkronizálás most')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('tells what is wrong, and cannot start a second sync while one runs', async () => {
    useSyncStatus.setState({ online: true, lastError: { ...NETWORK_ERROR, kind: 'device_revoked' } });
    await renderIndicator();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Szinkronhiba · újra' })));
    expect(screen.getByText('Még nem volt szinkron')).toBeOnTheScreen();
    expect(screen.getByText('Nincs feltöltésre váró tétel')).toBeOnTheScreen();
    expect(screen.getByText('Ezt a telefont egy másik váltotta fel a telephelyen.')).toBeOnTheScreen();

    await act(() => useSyncStatus.setState({ running: true }));
    expect(screen.getByRole('button', { name: 'Szinkronizálás…' })).toBeDisabled();
  });

  it('explains offline instead of the network error', async () => {
    useSyncStatus.setState({ online: false, pendingCount: 1, lastError: NETWORK_ERROR });
    await renderIndicator();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Offline · 1 vár' })));
    expect(screen.getByText(/^Nincs hálózati kapcsolat/)).toBeOnTheScreen();
    expect(screen.queryByText('A szerver nem érhető el.')).toBeNull();
  });
});

describe('the screen header', () => {
  it('has the title, the back button and the sync indicator at the right', async () => {
    const onBack = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <ScreenHeader title="22:00-s kör" subtitle="Telephely" onBack={onBack} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByRole('header', { name: '22:00-s kör' })).toBeOnTheScreen();
    expect(screen.getByText('Telephely')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Online' })).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Vissza' })));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
