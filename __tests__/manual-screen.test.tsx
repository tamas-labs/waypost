import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { eq } from 'drizzle-orm';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ManualEntryScreen from '@/app/(guard)/manual/index';
import type { PhotoFile } from '@/chain/payloads';
import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { getDatabase } from '@/db/open';
import { incidents, media, scans } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { schedulerStep } from '@/domain/rounds';
import { resolveScan } from '@/domain/scan';
import { guardLogin } from '@/domain/shift';
import { C1, C2, C3, GUARD, idSequence, local } from '@/domain/testing';
import { playFeedback } from '@/feedback/feedback';
import { loadGuardState } from '@/guard/state';
import { seedSite } from '@/guard/testing';
import { currentLocation } from '@/location/location';
import { discardPhoto, takePhoto } from '@/photo/photo';
import { ThemeProvider } from '@/theme/theme-provider';
import { nowTimestamp } from '@/time/timestamp';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));
jest.mock('@/guard/scheduler', () => ({ requestSchedulerStep: jest.fn() }));
jest.mock('@/feedback/feedback', () => ({ playFeedback: jest.fn() }));
jest.mock('@/location/location', () => ({ currentLocation: jest.fn() }));
jest.mock('@/photo/photo', () => ({ takePhoto: jest.fn(), discardPhoto: jest.fn() }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-camera', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual<typeof import('react')>('react');
  // A camera view whose ref is set, as the native one's is.
  const CameraView = forwardRef((_props, ref) => {
    useImperativeHandle(ref, () => ({}));
    return null;
  });
  return { CameraView, useCameraPermissions: jest.fn() };
});
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
  useIsFocused: jest.fn(() => true),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const { router } = jest.requireMock<{ router: { back: jest.Mock; replace: jest.Mock } }>('expo-router');
const requestPermission = jest.fn(() => Promise.resolve());
/** At the second point's trained place (src/domain/testing.ts). */
const NEAR_C2 = { latitude: 47.4981, longitude: 19.0402, accuracy_m: 8.4, mocked: false, gnss_time: null };

let db: Database;
let roundId: string;
const newId = idSequence();
let photoCount = 0;

const state = () => loadGuardState(db, nowTimestamp())!;
const write = (drafts: Parameters<typeof appendChainEntries>[1]) => appendChainEntries(db, drafts);
const step = () => write(schedulerStep(state(), nowTimestamp(), newId));
const photo = (): PhotoFile => {
  photoCount += 1;
  return { id: `019a2b3c-4d5e-7f00-8a00-0000000090${String(photoCount).padStart(2, '0')}`, sha256: 'c'.repeat(64), mime: 'image/jpeg', size_bytes: 240_000, local_uri: `file:///documents/media/${photoCount}.jpg`, taken_at: nowTimestamp() };
};

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ManualEntryScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const submit = () => screen.getByRole('button', { name: 'Rögzítés' });
const takeOne = async () => {
  await press('Fotó készítése');
  await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Fotó készítése' }).at(-1)!));
};
const typeNote = (text: string) => act(async () => fireEvent.changeText(screen.getByLabelText('Megjegyzés, kötelező'), text));

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('19:55')), doNotFake: ['nextTick', 'setImmediate'] });
  jest.clearAllMocks();
  jest.mocked(useIsFocused).mockReturnValue(true);
  jest.mocked(currentLocation).mockResolvedValue(null);
  jest.mocked(takePhoto).mockImplementation(() => Promise.resolve(photo()));
  jest.mocked(useCameraPermissions).mockReturnValue([{ granted: true, canAskAgain: true }, requestPermission, jest.fn()] as unknown as ReturnType<typeof useCameraPermissions>);
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  await seedSite(db);
  await write(guardLogin(state(), GUARD, nowTimestamp(), newId).drafts);
  jest.setSystemTime(Date.parse(local('20:00')));
  await step();
  roundId = state().rounds[0]!.id;
  jest.mocked(useLocalSearchParams).mockReturnValue({ round_id: roundId });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('shows the form, with the first point left chosen until the location comes', async () => {
  await renderScreen();
  expect(screen.getByRole('header', { name: 'Kézi rögzítés' })).toBeOnTheScreen();
  expect(screen.getByText('Nem igazolt')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Pont: Pont 1' })).toBeOnTheScreen();
  expect(screen.getByText(/Nem igazolt pontként/)).toBeOnTheScreen();
  expect(screen.getByText(/Nincs helyadat/)).toBeOnTheScreen();
  expect(submit()).toBeDisabled();
});

it('chooses the nearest point left, and shows the location', async () => {
  jest.mocked(currentLocation).mockResolvedValue(NEAR_C2);
  await renderScreen();
  expect(screen.getByRole('button', { name: 'Pont: Pont 2' })).toBeOnTheScreen();
  expect(screen.getByText(/GPS rögzítve · ±8 m · 20:00/)).toBeOnTheScreen();
});

it('tells without the accuracy when it is unknown', async () => {
  jest.mocked(currentLocation).mockResolvedValue({ ...NEAR_C2, accuracy_m: null });
  await renderScreen();
  expect(screen.getByText(/GPS rögzítve · 20:00/)).toBeOnTheScreen();
});

it('keeps the point the guard chose when the location comes later', async () => {
  let located: (fix: typeof NEAR_C2) => void = () => {};
  jest.mocked(currentLocation).mockImplementation(() => new Promise((resolve) => (located = resolve)));
  await renderScreen();
  await press('Pont: Pont 1');
  await press('Pont 3, Hátravan');
  expect(screen.getByRole('button', { name: 'Pont: Pont 3' })).toBeOnTheScreen();
  await act(async () => located(NEAR_C2));
  expect(screen.getByRole('button', { name: 'Pont: Pont 3' })).toBeOnTheScreen();
});

it('offers only the points left', async () => {
  await write(resolveScan({ state: state(), now: nowTimestamp(), location: null, newId }, { method: 'nfc', tag_uid: state().checkpoints.find((c) => c.id === C1)!.tag_uid!, ndef_raw: null }).drafts);
  await renderScreen();
  await press('Pont: Pont 2');
  expect(screen.getByRole('button', { name: 'Pont 2, Hátravan' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Pont 3, Hátravan' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Pont 1, Hátravan' })).not.toBeOnTheScreen();
});

it('needs both a photo and a note', async () => {
  await renderScreen();
  await typeNote('   ');
  await takeOne();
  expect(submit()).toBeDisabled();
  await typeNote('Letörött a címke.');
  expect(submit()).toBeEnabled();
});

it('records a scan and a damaged-tag incident with the photo, and gives way to the result', async () => {
  jest.mocked(currentLocation).mockResolvedValue(NEAR_C2);
  await renderScreen();
  await takeOne();
  await typeNote('  Letörött a címke.  ');
  await press('Rögzítés');

  const scan = db.select().from(scans).where(eq(scans.checkpoint_id, C2)).get()!;
  expect(scan).toMatchObject({ round_id: roundId, method: 'manual', note: 'Letörött a címke.', lat_e7: 474981000 });
  expect(scan.flags).toEqual(expect.arrayContaining(['manual', 'out_of_order']));
  expect(db.select().from(incidents).all()).toEqual([expect.objectContaining({ category: 'damaged_tag', scan_id: scan.id, nearest_checkpoint_id: C2 })]);
  expect(db.select().from(media).all()).toHaveLength(1);
  expect(playFeedback).toHaveBeenCalledWith('warning');
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/scan-result', params: { kind: 'recorded', scan_id: scan.id, checkpoint_id: C2, round_id: roundId, out_of_order: 'true', completed: 'false' } });

  await screen.unmount();
  expect(discardPhoto).not.toHaveBeenCalled();
});

it('uses the location shown when there is none at the saving', async () => {
  jest.mocked(currentLocation).mockResolvedValueOnce(NEAR_C2).mockResolvedValue(null);
  await renderScreen();
  await takeOne();
  await typeNote('Letörött.');
  await press('Rögzítés');
  expect(db.select().from(scans).get()).toMatchObject({ lat_e7: 474981000 });
});

it('completes the round with the last point', async () => {
  const tag = (id: string) => ({ method: 'nfc' as const, tag_uid: state().checkpoints.find((c) => c.id === id)!.tag_uid!, ndef_raw: null });
  await write(resolveScan({ state: state(), now: nowTimestamp(), location: null, newId }, tag(C1)).drafts);
  await write(resolveScan({ state: state(), now: nowTimestamp(), location: null, newId }, tag(C2)).drafts);
  await renderScreen();
  expect(screen.getByRole('button', { name: 'Pont: Pont 3' })).toBeOnTheScreen();
  await takeOne();
  await typeNote('Letörött.');
  await press('Rögzítés');
  expect(state().rounds[0]!.status).toBe('completed');
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/scan-result', params: expect.objectContaining({ checkpoint_id: C3, completed: 'true' }) });
});

it('keeps the form when the saving fails', async () => {
  await renderScreen();
  await takeOne();
  await typeNote('Letörött.');
  jest.mocked(getDatabase).mockImplementationOnce(() => {
    throw new Error('no database');
  });
  await press('Rögzítés');
  expect(playFeedback).toHaveBeenCalledWith('error');
  expect(screen.getByText(/Nem sikerült rögzíteni/)).toBeOnTheScreen();
  expect(router.replace).not.toHaveBeenCalled();
  expect(discardPhoto).not.toHaveBeenCalled();
  expect(submit()).toBeEnabled();
});

it('tells when the round closed meanwhile, and does not offer saving again', async () => {
  await renderScreen();
  await takeOne();
  await typeNote('Letörött.');
  jest.setSystemTime(Date.parse(local('20:20')));
  await step();
  await press('Rögzítés');
  expect(screen.getByText(/A kör közben lezárult/)).toBeOnTheScreen();
  expect(db.select().from(scans).all()).toEqual([]);
  expect(submit()).toBeDisabled();
});

it('has no form for a round that has closed', async () => {
  jest.setSystemTime(Date.parse(local('20:20')));
  await step();
  await renderScreen();
  expect(screen.getByText(/A kör közben lezárult/)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Rögzítés' })).not.toBeOnTheScreen();
  await press('Vissza');
  expect(router.back).toHaveBeenCalled();
});

describe('the photos', () => {
  it('deletes a photo only after asking', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen();
    await takeOne();
    await press('1. fotó');
    expect(discardPhoto).not.toHaveBeenCalled();
    const buttons = alert.mock.lastCall![2]!;
    await act(async () => buttons[1]!.onPress!());
    expect(discardPhoto).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '1. fotó' })).not.toBeOnTheScreen();
  });

  it('deletes the photos when the form is left without saving', async () => {
    await renderScreen();
    await takeOne();
    await takeOne();
    await screen.unmount();
    expect(discardPhoto).toHaveBeenCalledTimes(2);
  });

  it('stops at 5', async () => {
    await renderScreen();
    for (let n = 0; n < 5; n += 1) await takeOne();
    expect(screen.getByRole('button', { name: '5. fotó' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Fotó készítése' })).not.toBeOnTheScreen();
  });

  it('says so when the camera fails, and stays open', async () => {
    jest.mocked(takePhoto).mockRejectedValueOnce(new Error('camera'));
    await renderScreen();
    await takeOne();
    expect(screen.getByText(/Nem sikerült a fotó/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '1. fotó' })).not.toBeOnTheScreen();
  });

  it('asks for the camera', async () => {
    jest.mocked(useCameraPermissions).mockReturnValue([{ granted: false, canAskAgain: true }, requestPermission, jest.fn()] as unknown as ReturnType<typeof useCameraPermissions>);
    await renderScreen();
    await press('Fotó készítése');
    expect(screen.getByText(/A fotózáshoz engedélyezni kell/)).toBeOnTheScreen();
    await press('Kamera engedélyezése');
    expect(requestPermission).toHaveBeenCalled();
  });

  it('closes the camera for a screen pushed over the form', async () => {
    await renderScreen();
    await press('Fotó készítése');
    expect(screen.getByRole('button', { name: 'Mégse' })).toBeOnTheScreen();
    jest.mocked(useIsFocused).mockReturnValue(false);
    await act(async () => screen.rerender(<SafeAreaProvider initialMetrics={METRICS}><ThemeProvider><ManualEntryScreen /></ThemeProvider></SafeAreaProvider>));
    expect(screen.queryByRole('button', { name: 'Mégse' })).not.toBeOnTheScreen();
  });
});
