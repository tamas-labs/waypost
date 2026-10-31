import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NewIncidentScreen from '@/app/(guard)/incident/new';
import type { PhotoFile } from '@/chain/payloads';
import { appendChainEntries } from '@/chain/writer';
import { showToast, ToastHost } from '@/components/toast';
import type { Database } from '@/db/database';
import { getDatabase } from '@/db/open';
import { chainEntries, incidents, media } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { closeShiftByGuard, guardLogin } from '@/domain/shift';
import { C2, C3, GUARD, idSequence, local } from '@/domain/testing';
import { playFeedback } from '@/feedback/feedback';
import { loadGuardState } from '@/guard/state';
import { seedSite } from '@/guard/testing';
import { currentLocation } from '@/location/location';
import { discardPhoto, takePhoto } from '@/photo/photo';
import { useSyncStatus } from '@/sync/status';
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
  router: { back: jest.fn() },
  useLocalSearchParams: jest.fn(),
  useIsFocused: jest.fn(() => true),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const { router } = jest.requireMock<{ router: { back: jest.Mock } }>('expo-router');
/** At the second point's trained place (src/domain/testing.ts). */
const NEAR_C2 = { latitude: 47.4981, longitude: 19.0402, accuracy_m: 6.2, mocked: false, gnss_time: null };

let db: Database;
const newId = idSequence();
let photoCount = 0;

const state = () => loadGuardState(db, nowTimestamp())!;
const write = (drafts: Parameters<typeof appendChainEntries>[1]) => appendChainEntries(db, drafts);
const photo = (): PhotoFile => {
  photoCount += 1;
  return { id: `019a2b3c-4d5e-7f00-8a00-0000000091${String(photoCount).padStart(2, '0')}`, sha256: 'c'.repeat(64), mime: 'image/jpeg', size_bytes: 240_000, local_uri: `file:///documents/media/${photoCount}.jpg`, taken_at: nowTimestamp() };
};

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <NewIncidentScreen />
        <ToastHost />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const choose = (name: string) => act(async () => fireEvent.press(screen.getByRole('radio', { name })));
const submit = () => screen.getByRole('button', { name: 'Esemény mentése' });
const takeOne = async () => {
  await press('Fotó készítése');
  await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Fotó készítése' }).at(-1)!));
};

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('22:16')), doNotFake: ['nextTick', 'setImmediate'] });
  jest.clearAllMocks();
  jest.mocked(currentLocation).mockResolvedValue(null);
  jest.mocked(takePhoto).mockImplementation(() => Promise.resolve(photo()));
  jest.mocked(useCameraPermissions).mockReturnValue([{ granted: true, canAskAgain: true }, jest.fn(), jest.fn()] as unknown as ReturnType<typeof useCameraPermissions>);
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useSyncStatus.setState({ online: true });
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  await seedSite(db);
  await write(guardLogin(state(), GUARD, nowTimestamp(), newId).drafts);
});

afterEach(() => {
  jest.useRealTimers();
});

it('needs a category, and nothing else', async () => {
  await renderScreen();
  expect(screen.getByRole('header', { name: 'Esemény' })).toBeOnTheScreen();
  expect(submit()).toBeDisabled();
  await choose('Csőtörés / víz');
  expect(screen.getByRole('radio', { name: 'Csőtörés / víz' })).toBeChecked();
  expect(submit()).toBeEnabled();
  await press('Esemény mentése');
  expect(db.select().from(incidents).all()).toEqual([expect.objectContaining({ category: 'water', note: null, lat_e7: null, nearest_checkpoint_id: null, scan_id: null })]);
  expect(db.select().from(media).all()).toEqual([]);
});

it('offers the categories of the design, and not the one of a manual entry', async () => {
  await renderScreen();
  expect(screen.getAllByRole('radio').map((tile) => tile.props.accessibilityState.checked)).toEqual([false, false, false, false, false]);
  for (const name of ['Rongálás', 'Nyitott ajtó / ablak', 'Csőtörés / víz', 'Idegen személy', 'Egyéb']) expect(screen.getByRole('radio', { name })).toBeOnTheScreen();
  expect(screen.queryByRole('radio', { name: 'Sérült címke' })).not.toBeOnTheScreen();
});

it.each([
  ['Rongálás', 'vandalism'],
  ['Nyitott ajtó / ablak', 'open_door'],
  ['Idegen személy', 'intruder'],
  ['Egyéb', 'other'],
])('records %s as %s', async (name, category) => {
  await renderScreen();
  await choose(name);
  await press('Esemény mentése');
  expect(db.select().from(incidents).get()).toMatchObject({ category });
});

it('tells the time, the nearest point and the accuracy', async () => {
  jest.mocked(currentLocation).mockResolvedValue(NEAR_C2);
  await renderScreen();
  expect(screen.getByText('22:16 · Legközelebbi pont: Pont 2 · GPS ±6 m')).toBeOnTheScreen();
});

it('says so without a location', async () => {
  await renderScreen();
  expect(screen.getByText('22:16 · Nincs helyadat')).toBeOnTheScreen();
});

it('tells the location without the accuracy when it is unknown', async () => {
  jest.mocked(currentLocation).mockResolvedValue({ ...NEAR_C2, accuracy_m: null });
  await renderScreen();
  expect(screen.getByText('22:16 · Legközelebbi pont: Pont 2 · GPS rögzítve')).toBeOnTheScreen();
});

it('records the note, the photos and the location, and goes back with a toast', async () => {
  jest.mocked(currentLocation).mockResolvedValue(NEAR_C2);
  await renderScreen();
  await choose('Nyitott ajtó / ablak');
  await takeOne();
  await takeOne();
  await act(async () => fireEvent.changeText(screen.getByLabelText('Megjegyzés, nem kötelező'), '  A hátsó ablak nyitva.  '));
  await press('Esemény mentése');

  const incident = db.select().from(incidents).get()!;
  expect(incident).toMatchObject({ category: 'open_door', note: 'A hátsó ablak nyitva.', lat_e7: 474981000, nearest_checkpoint_id: C2, scan_id: null });
  expect(db.select().from(media).all().map((row) => row.owner_id)).toEqual([incident.id, incident.id]);
  expect(playFeedback).toHaveBeenCalledWith('success');
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Esemény mentve')).toBeOnTheScreen();
  await screen.unmount();
  expect(discardPhoto).not.toHaveBeenCalled();
});

it('tells that it waits for the upload when offline', async () => {
  useSyncStatus.setState({ online: false });
  await renderScreen();
  await choose('Egyéb');
  await press('Esemény mentése');
  expect(screen.getByText('Esemény mentve – feltöltésre vár')).toBeOnTheScreen();
});

it('takes the toast away after a while', async () => {
  await renderScreen();
  await act(async () => showToast('Esemény mentve'));
  expect(screen.getByText('Esemény mentve')).toBeOnTheScreen();
  await act(async () => jest.advanceTimersByTime(3000));
  expect(screen.queryByText('Esemény mentve')).not.toBeOnTheScreen();
});

it('keeps the point it was opened for', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ checkpoint_id: C3 });
  jest.mocked(currentLocation).mockResolvedValue(NEAR_C2);
  await renderScreen();
  expect(screen.getByText('22:16 · Pont: Pont 3 · GPS ±6 m')).toBeOnTheScreen();
  await choose('Egyéb');
  await press('Esemény mentése');
  expect(db.select().from(incidents).get()).toMatchObject({ nearest_checkpoint_id: C3, lat_e7: 474981000 });
});

it('uses the location shown when there is none at the saving', async () => {
  jest.mocked(currentLocation).mockResolvedValueOnce(NEAR_C2).mockResolvedValue(null);
  await renderScreen();
  await choose('Egyéb');
  await press('Esemény mentése');
  expect(db.select().from(incidents).get()).toMatchObject({ lat_e7: 474981000 });
});

it('keeps the form when the saving fails', async () => {
  await renderScreen();
  await choose('Egyéb');
  await takeOne();
  jest.mocked(getDatabase).mockImplementationOnce(() => {
    throw new Error('no database');
  });
  await press('Esemény mentése');
  expect(playFeedback).toHaveBeenCalledWith('error');
  expect(screen.getByText(/Nem sikerült menteni/)).toBeOnTheScreen();
  expect(router.back).not.toHaveBeenCalled();
  expect(discardPhoto).not.toHaveBeenCalled();
  expect(submit()).toBeEnabled();
});

it('tells when the shift closed meanwhile, and does not offer saving again', async () => {
  await renderScreen();
  await choose('Egyéb');
  await write(closeShiftByGuard(state(), nowTimestamp()));
  const written = db.select().from(chainEntries).all().length;
  await press('Esemény mentése');
  expect(screen.getByText(/A műszak közben lezárult/)).toBeOnTheScreen();
  expect(db.select().from(chainEntries).all()).toHaveLength(written);
  expect(submit()).toBeDisabled();
});

it('deletes the photos when the form is left without saving', async () => {
  await renderScreen();
  await takeOne();
  await screen.unmount();
  expect(discardPhoto).toHaveBeenCalledTimes(1);
});

it('takes at most 5 photos', async () => {
  await renderScreen();
  for (let n = 0; n < 5; n += 1) await takeOne();
  expect(screen.getByRole('button', { name: '5. fotó' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Fotó készítése' })).not.toBeOnTheScreen();
});
