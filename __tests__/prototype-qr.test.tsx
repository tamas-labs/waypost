import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type CameraViewProps, type PermissionResponse } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { Linking } from 'react-native';

import QrScreen from '@/app/prototype/qr';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('expo-camera', () => ({ CameraView: jest.fn(() => null), useCameraPermissions: jest.fn() }));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useIsFocused: jest.fn(() => true),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const permissions = jest.mocked(useCameraPermissions);
const camera = jest.mocked(CameraView);
const requestPermission = jest.fn();

const CODE = 'waypost:cp:01935f3a-7c2e-7b41-9f0d-3c5a8e2b6d14:Ab3dEf7hJk9mNp2q';

function permission(granted: boolean, canAskAgain = true): PermissionResponse {
  return { granted, canAskAgain, expires: 'never', status: granted ? 'granted' : 'undetermined' } as PermissionResponse;
}

/** Props of the latest camera view rendered. */
function cameraProps(): CameraViewProps {
  return camera.mock.lastCall![0];
}

/** The camera reports a QR code in view. */
async function show(data: string) {
  await act(async () => cameraProps().onBarcodeScanned!({ type: 'qr', data } as BarcodeScanningResult));
}

async function renderScreen(response: PermissionResponse | null) {
  permissions.mockReturnValue([response, requestPermission, jest.fn()]);
  await render(
    <ThemeProvider>
      <QrScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useIsFocused).mockReturnValue(true);
  requestPermission.mockResolvedValue(permission(true));
});

describe('camera permission', () => {
  test('not asked yet: asks on the button, no camera', async () => {
    await renderScreen(permission(false));
    expect(screen.getByText('A QR-kód olvasásához engedélyezni kell a kamerát.')).toBeOnTheScreen();
    expect(camera).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByText('Kamera engedélyezése')));
    expect(requestPermission).toHaveBeenCalled();
  });

  test('refused for good: the button opens the settings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderScreen(permission(false, false));
    await act(async () => fireEvent.press(screen.getByText('Beállítások megnyitása')));
    expect(openSettings).toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  test('still loading', async () => {
    await renderScreen(null);
    expect(screen.getByText('Kamera-engedély ellenőrzése…')).toBeOnTheScreen();
    expect(screen.queryByText('Kamera engedélyezése')).toBeNull();
  });
});

describe('reading', () => {
  test('a full-screen back camera reading QR codes only', async () => {
    await renderScreen(permission(true));
    expect(cameraProps()).toMatchObject({ facing: 'back', barcodeScannerSettings: { barcodeTypes: ['qr'] }, enableTorch: false });
    expect(screen.getByText(/^Tartsd a kódot a keretbe/)).toBeOnTheScreen();
  });

  test('a waypost:cp: code is listed once while it stays in view', async () => {
    await renderScreen(permission(true));
    await show(CODE);
    await show(CODE);
    await show(CODE);
    expect(screen.getByText(CODE)).toBeOnTheScreen();
    expect(screen.getByText('1 beolvasott kód')).toBeOnTheScreen();
    expect(screen.queryByText('Waypost-előtag, de nem pontkód formátumú')).toBeNull();
  });

  test('a waypost:cp: code that is not a checkpoint code is read but marked', async () => {
    await renderScreen(permission(true));
    await show('waypost:cp:test');
    expect(screen.getByText('waypost:cp:test')).toBeOnTheScreen();
    expect(screen.getByText('Waypost-előtag, de nem pontkód formátumú')).toBeOnTheScreen();
  });

  test('other codes are ignored', async () => {
    await renderScreen(permission(true));
    await show('https://example.com/menu');
    expect(screen.queryByText(/beolvasott kód$/)).toBeNull();
    expect(screen.getByText(/^Figyelmen kívül hagyva \(\d\d:\d\d:\d\d\): https:\/\/example\.com\/menu$/)).toBeOnTheScreen();
  });

  test('the torch switch and the back button', async () => {
    await renderScreen(permission(true));
    await act(async () => fireEvent.press(screen.getByText('Lámpa')));
    expect(cameraProps().enableTorch).toBe(true);
    await act(async () => fireEvent.press(screen.getByText('Lámpa ki')));
    expect(cameraProps().enableTorch).toBe(false);
    await act(async () => fireEvent.press(screen.getByText('Vissza')));
    expect(mockBack).toHaveBeenCalled();
  });

  test('a camera error is shown', async () => {
    await renderScreen(permission(true));
    await act(async () => cameraProps().onMountError!({ message: 'Camera in use' }));
    expect(screen.getByText('Hiba: Camera in use')).toBeOnTheScreen();
  });

  test('no camera while another screen covers this one', async () => {
    jest.mocked(useIsFocused).mockReturnValue(false);
    await renderScreen(permission(true));
    expect(camera).not.toHaveBeenCalled();
  });
});
