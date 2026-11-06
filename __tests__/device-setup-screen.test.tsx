import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DeviceSetupScreen from '@/app/(supervisor)/device-setup';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { getDatabase } from '@/db/open';
import { createTestDatabase } from '@/db/testing';
import { logError, readErrorLog, startErrorLog } from '@/diagnostics/error-log';
import { fixReadiness, getReadiness, type Readiness } from '@/setup/readiness';
import { ThemeProvider } from '@/theme/theme-provider';
import type { ThemePreference } from '@/theme/tokens';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/setup/readiness', () => ({
  ...jest.requireActual<object>('@/setup/readiness'),
  getReadiness: jest.fn(),
  fixReadiness: jest.fn(),
}));
jest.mock('@/alarms/permissions', () => ({}));
jest.mock('@/nfc/reader', () => ({}));
jest.mock('@/photo/camera', () => ({}));
jest.mock('@/location/location', () => ({}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const READY: Readiness = {
  nfc: { supported: true, enabled: true },
  alarms: { notifications: { granted: true, canAskAgain: true }, exactAlarms: true, batteryExempt: true },
  location: { granted: true, canAskAgain: true },
  camera: { granted: true, canAskAgain: true },
};
const SUPERVISOR = { id: '019a2b3c-4d5e-7f00-8a00-000000000020', role: 'supervisor' as const };

let db: Database;
let stopErrorLog: () => void;

beforeEach(async () => {
  jest.clearAllMocks();
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  stopErrorLog = startErrorLog(db);
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(getReadiness).mockResolvedValue(READY);
  jest.mocked(fixReadiness).mockResolvedValue();
  useSession.setState({ mode: 'site_phone', deviceId: '019a2b3c-4d5e-7f00-8a00-000000000004', activeUser: SUPERVISOR });
});

afterEach(() => stopErrorLog());

async function renderScreen(onPreferenceChange?: (preference: ThemePreference) => void) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider onPreferenceChange={onPreferenceChange}>
        <DeviceSetupScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

it('ticks every setting of a ready site phone', async () => {
  await renderScreen();
  for (const label of [
    'Értesítések engedélyezve',
    'Pontos riasztás engedélyezve',
    'Akkumulátorkímélés kikapcsolva',
    'Helymeghatározás engedélyezve',
    'Kamera engedélyezve',
    'NFC bekapcsolva',
  ]) {
    expect(screen.getByText(label)).toBeOnTheScreen();
  }
  expect(screen.queryByRole('button', { name: 'Javítás' })).toBeNull();
});

it('offers the fix of what is missing, and checks again after it', async () => {
  const missing: Readiness = {
    ...READY,
    alarms: { ...READY.alarms, exactAlarms: false },
    camera: { granted: false, canAskAgain: false },
  };
  jest.mocked(getReadiness).mockResolvedValue(missing);
  await renderScreen();

  expect(screen.getByText('Késve szólhat az ébresztő')).toBeOnTheScreen();
  expect(screen.getByText('Nem olvasható QR-kód, és nem készülhet fotó')).toBeOnTheScreen();
  const fixes = screen.getAllByRole('button', { name: 'Javítás' });
  expect(fixes).toHaveLength(2);

  jest.mocked(getReadiness).mockResolvedValue({ ...missing, camera: { granted: true, canAskAgain: false } });
  await act(async () => fireEvent.press(fixes[1]!));
  expect(fixReadiness).toHaveBeenCalledWith('camera', missing);
  expect(screen.getByText('Kamera engedélyezve')).toBeOnTheScreen();
  expect(screen.getAllByRole('button', { name: 'Javítás' })).toHaveLength(1);
});

it('checks again when the app comes back from the settings', async () => {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() };
  });
  jest.mocked(getReadiness).mockResolvedValue({ ...READY, nfc: { supported: true, enabled: false } });
  await renderScreen();
  expect(screen.getByText('Kapcsold be a leolvasáshoz')).toBeOnTheScreen();

  jest.mocked(getReadiness).mockResolvedValue(READY);
  await act(async () => listeners.forEach((listener) => listener('active')));
  expect(screen.getByText('NFC bekapcsolva')).toBeOnTheScreen();
});

it('tells a phone without NFC to use QR, with nothing to fix', async () => {
  jest.mocked(getReadiness).mockResolvedValue({ ...READY, nfc: { supported: false, enabled: false } });
  await renderScreen();
  expect(screen.getByText('Ezen a telefonon nincs NFC: QR-kóddal olvass')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Javítás' })).toBeNull();
});

it("lists only what training and photos need on a supervisor's own phone", async () => {
  useSession.setState({ mode: 'supervisor_phone', deviceId: null, activeUser: null });
  jest.mocked(getReadiness).mockResolvedValue({
    ...READY,
    alarms: { notifications: { granted: false, canAskAgain: true }, exactAlarms: false, batteryExempt: false },
  });
  await renderScreen();
  expect(
    screen.getByText('A saját telefonodon a betanításhoz és a fotókhoz kellenek. Ami hiányzik, azt a „Javítás” megnyitja.'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Értesítések')).toBeNull();
  expect(screen.queryByText('Pontos riasztás')).toBeNull();
  expect(screen.queryByText('Akkumulátorkímélés')).toBeNull();
  expect(screen.getByText('Kamera engedélyezve')).toBeOnTheScreen();
});

it('chooses the theme', async () => {
  const onPreferenceChange = jest.fn();
  await renderScreen(onPreferenceChange);
  expect(screen.getByRole('radio', { name: 'Rendszer' })).toBeChecked();
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Sötét' })));
  expect(onPreferenceChange).toHaveBeenCalledWith('dark');
  expect(screen.getByRole('radio', { name: 'Sötét' })).toBeChecked();
});

it('shows the error log, the newest first, follows new errors, and clears it', async () => {
  jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    ...new Intl.DateTimeFormat().resolvedOptions(),
    timeZone: 'Europe/Budapest',
  });
  jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 3, 19, 0));
  logError('scheduler', new TypeError('x is undefined'), 'interval');
  await renderScreen();
  expect(screen.getByText('2026-11-03 20:00 · Körök ütemezése')).toBeOnTheScreen();
  expect(screen.getByText('interval · TypeError: x is undefined')).toBeOnTheScreen();

  await act(async () => logError('nfc', 'no reader'));
  expect(screen.getByText('2026-11-03 20:00 · NFC-figyelés')).toBeOnTheScreen();
  expect(screen.getByText('no reader')).toBeOnTheScreen();

  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Napló törlése' })));
  expect(screen.getByText('Nincs rögzített hiba.')).toBeOnTheScreen();
  expect(readErrorLog(db)).toEqual([]);
  expect(screen.queryByRole('button', { name: 'Napló törlése' })).toBeNull();
});
