import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import QrScreen from '@/app/(guard)/qr';
import { recordTagRead } from '@/guard/scan';
import { ThemeProvider } from '@/theme/theme-provider';

const mockCameraView = jest.fn();
jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('expo-camera', () => ({ useCameraPermissions: jest.fn(), CameraView: (props: unknown) => mockCameraView(props) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useIsFocused: () => true, useLocalSearchParams: () => ({ round_id: 'round-1' }) }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/feedback/feedback', () => ({ playFeedback: jest.fn() }));
jest.mock('@/guard/scan', () => ({ ...jest.requireActual<object>('@/guard/scan'), recordTagRead: jest.fn() }));
// The header's sync indicator is not what this test is about.
jest.mock('@/components/sync-status-indicator', () => ({ SyncStatusIndicator: () => null }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const PAYLOAD = 'waypost:cp:019a2b3c-4d5e-7f00-8a00-000000000051:aB3dE5gH7jK9mN01';
const requestPermission = jest.fn(() => Promise.resolve());

const permission = (fields: { granted: boolean; canAskAgain: boolean } | null) => jest.mocked(useCameraPermissions).mockReturnValue([fields, requestPermission, jest.fn()] as unknown as ReturnType<typeof useCameraPermissions>);

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <QrScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
const scanned = (data: string) => act(async () => mockCameraView.mock.lastCall![0].onBarcodeScanned({ data }));

beforeEach(() => {
  jest.clearAllMocks();
  mockCameraView.mockReturnValue(null);
});

it('asks for the camera, and leads to the settings after a final refusal', async () => {
  permission({ granted: false, canAskAgain: true });
  await renderScreen();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Kamera engedélyezése' })));
  expect(requestPermission).toHaveBeenCalled();
  await screen.unmount();

  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  permission({ granted: false, canAskAgain: false });
  await renderScreen();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Beállítások megnyitása' })));
  expect(openSettings).toHaveBeenCalled();
});

it('records a Waypost code and gives way to its result', async () => {
  const { router } = jest.requireMock<{ router: { replace: jest.Mock } }>('expo-router');
  permission({ granted: true, canAskAgain: true });
  jest.mocked(recordTagRead).mockResolvedValue({ kind: 'unknown_tag', drafts: [] });
  await renderScreen();
  await scanned(PAYLOAD);
  expect(recordTagRead).toHaveBeenCalledWith(undefined, { method: 'qr', qr_payload: PAYLOAD });
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/scan-result', params: { kind: 'unknown_tag', method: 'qr', read_id: PAYLOAD, round_id: 'round-1' } });
});

it('ignores other codes', async () => {
  permission({ granted: true, canAskAgain: true });
  await renderScreen();
  await scanned('https://example.com');
  expect(recordTagRead).not.toHaveBeenCalled();
});

it('says so when the scan fails, and switches the torch', async () => {
  permission({ granted: true, canAskAgain: true });
  jest.mocked(recordTagRead).mockRejectedValue(new Error('no'));
  await renderScreen();
  await scanned(PAYLOAD);
  expect(screen.getByText(/Nem sikerült rögzíteni/)).toBeOnTheScreen();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Lámpa' })));
  expect(mockCameraView.mock.lastCall![0].enableTorch).toBe(true);
});
