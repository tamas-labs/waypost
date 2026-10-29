import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useCameraPermissions, type PermissionResponse } from 'expo-camera';

import FieldScreen from '@/app/prototype/field';
import type { PhotoFile } from '@/chain/payloads';
import { playFeedback } from '@/feedback/feedback';
import { currentLocation, hasLocationPermission, requestLocationPermission } from '@/location/location';
import { discardPhoto, takePhoto } from '@/photo/photo';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('expo-camera', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual<typeof import('react')>('react');
  // A camera view whose ref is set, as the native one's is.
  const CameraView = forwardRef((_props, ref) => {
    useImperativeHandle(ref, () => ({}));
    return null;
  });
  return { CameraView, useCameraPermissions: jest.fn() };
});
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@/location/location', () => ({ currentLocation: jest.fn(), hasLocationPermission: jest.fn(), requestLocationPermission: jest.fn() }));
jest.mock('@/photo/photo', () => ({ takePhoto: jest.fn(), discardPhoto: jest.fn() }));
jest.mock('@/feedback/feedback', () => ({ playFeedback: jest.fn() }));

const permission = (granted: boolean) => ({ granted, canAskAgain: true, expires: 'never', status: granted ? 'granted' : 'undetermined' }) as PermissionResponse;
const photo = (id: string): PhotoFile => ({ id, sha256: 'ab'.repeat(32), mime: 'image/jpeg', size_bytes: 312_456, local_uri: `file:///documents/media/${id}.jpg`, taken_at: '2026-10-29T20:00:00.000Z' });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(hasLocationPermission).mockResolvedValue(true);
  jest.mocked(useCameraPermissions).mockReturnValue([permission(true), jest.fn(), jest.fn()]);
});

async function renderScreen() {
  const result = await render(
    <ThemeProvider>
      <FieldScreen />
    </ThemeProvider>,
  );
  await act(async () => {});
  return result;
}

describe('location, photo and feedback test screen', () => {
  test('shows the location a scan would record, or that it would have none', async () => {
    jest.mocked(currentLocation).mockResolvedValueOnce({ latitude: 47.4979, longitude: 19.0402, accuracy_m: 4.2, mocked: true, gnss_time: '2026-10-29T20:03:43.000Z' });
    await renderScreen();
    await act(async () => fireEvent.press(screen.getByText('Helyadat kérése')));
    expect(screen.getByText('47.4979000, 19.0402000')).toBeOnTheScreen();
    expect(screen.getByText(/^Pontosság: ±4\.2 m · \d+ ms$/)).toBeOnTheScreen();
    expect(screen.getByText('Hamisított helyadat (mock_location)')).toBeOnTheScreen();
    expect(screen.getByText('GNSS-idő: 2026-10-29T20:03:43.000Z')).toBeOnTheScreen();

    jest.mocked(currentLocation).mockResolvedValueOnce(null);
    await act(async () => fireEvent.press(screen.getByText('Helyadat kérése')));
    expect(screen.getByText(/^Nincs helyadat \(\d+ ms\)/)).toBeOnTheScreen();
  });

  test('asks for the location permission', async () => {
    jest.mocked(hasLocationPermission).mockResolvedValue(false);
    jest.mocked(requestLocationPermission).mockResolvedValue(true);
    await renderScreen();
    await act(async () => fireEvent.press(screen.getByText('Helymeghatározás engedélyezése')));
    expect(screen.getByText('Helyadat kérése')).toBeOnTheScreen();
  });

  test('takes a photo, shows its size and SHA-256, and deletes the previous one and the last one', async () => {
    jest.mocked(takePhoto).mockResolvedValueOnce(photo('first')).mockResolvedValueOnce(photo('second'));
    const { unmount } = await renderScreen();
    await act(async () => fireEvent.press(screen.getByText('Fotó készítése')));
    expect(screen.getByText('Tömörítve: 305 kB')).toBeOnTheScreen();
    expect(screen.getByText(`SHA-256: ${'ab'.repeat(32)}`)).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByText('Fotó készítése')));
    expect(discardPhoto).toHaveBeenCalledWith(photo('first'));
    await act(async () => unmount());
    expect(discardPhoto).toHaveBeenLastCalledWith(photo('second'));
  });

  test('plays the three feedbacks', async () => {
    await renderScreen();
    for (const label of ['Siker', 'Hiba', 'Figyelmeztetés']) fireEvent.press(screen.getByText(label));
    expect(jest.mocked(playFeedback).mock.calls).toEqual([['success'], ['error'], ['warning']]);
  });
});
