import { act, fireEvent, screen } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';
import { useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, Platform, type AlertButton } from 'react-native';

import SupervisorLayout from '@/app/(supervisor)/_layout';
import CheckpointQrScreen from '@/app/(supervisor)/checkpoints/[id]/qr';
import RouteEditScreen from '@/app/(supervisor)/routes/[id]/edit';
import TrainingScreen from '@/app/(supervisor)/routes/[id]/train/index';
import TrainingPointScreen from '@/app/(supervisor)/routes/[id]/train/point';
import SiteScreen from '@/app/(supervisor)/sites/[id]';
import { useSession } from '@/auth/session';
import type { PhotoFile } from '@/chain/payloads';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { checkpoints, outbox, routes, routeVersionCheckpoints, routeVersions, sites } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { currentLocation } from '@/location/location';
import type { NfcStatus } from '@/nfc/reader';
import type { TagReading } from '@/nfc/tag';
import { useTagReader } from '@/nfc/use-tag-reader';
import { photoFile } from '@/photo/files';
import { discardPhoto, takePhoto } from '@/photo/photo';
import { useSyncStatus } from '@/sync/status';
import { ThemeProvider } from '@/theme/theme-provider';

const mockCameraView = jest.fn();
jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 1_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ requestSync: jest.fn() }));
jest.mock('@/feedback/feedback', () => ({ playFeedback: jest.fn(), playHaptic: jest.fn() }));
jest.mock('@/location/location', () => ({ currentLocation: jest.fn() }));
jest.mock('@/nfc/reader', () => ({ openNfcSettings: jest.fn(() => Promise.resolve()) }));
jest.mock('@/nfc/use-tag-reader', () => ({ useTagReader: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-camera', () => ({ useCameraPermissions: jest.fn(), CameraView: (props: unknown) => mockCameraView(props) }));
jest.mock('@/photo/photo', () => ({ takePhoto: jest.fn(), discardPhoto: jest.fn() }));
jest.mock('expo-print', () => ({ printAsync: jest.fn(), printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
// The app's files and the test's are the same in-memory ones (__mocks__/expo-file-system.ts).
jest.mock('expo-file-system');
jest.mock('react-native-draggable-flatlist');
const { renderedList } = jest.requireMock<typeof import('../__mocks__/react-native-draggable-flatlist')>('react-native-draggable-flatlist');
const { files: mockedFiles } = jest.requireMock<typeof import('../__mocks__/expo-file-system')>('expo-file-system');

function RootLayout() {
  const { Stack } = jest.requireActual<typeof import('expo-router')>('expo-router');
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

const ROUTES = {
  _layout: RootLayout,
  '(supervisor)/_layout': SupervisorLayout,
  '(supervisor)/sites/[id]': SiteScreen,
  '(supervisor)/routes/[id]/edit': RouteEditScreen,
  '(supervisor)/routes/[id]/train/index': TrainingScreen,
  '(supervisor)/routes/[id]/train/point': TrainingPointScreen,
  '(supervisor)/checkpoints/[id]/qr': CheckpointQrScreen,
};

const AT = '2026-10-27T10:05:12.345Z';
const ME = { id: '019a2b3c-4d5e-7f00-8a00-000000000002', name: 'Kovács Anna', email: 'kovacs.anna@example.com' };
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const ROUTE = '019a2b3c-4d5e-7f00-8a00-0000000000b1';
const VERSION = '019a2b3c-4d5e-7f00-8a00-0000000000d1';
const GATE = '019a2b3c-4d5e-7f00-8a00-0000000000c1';
const STORE = '019a2b3c-4d5e-7f00-8a00-0000000000c2';
const BOILER = '019a2b3c-4d5e-7f00-8a00-0000000000c3';
/** The store's photo, uploaded from another phone: its file is not on this one. */
const STORE_PHOTO = '019a2b3c-4d5e-7f00-8a00-0000000000f1';
const FIX = { latitude: 47.4979, longitude: 19.0402, accuracy_m: 4.2, mocked: false, gnss_time: null };

let db: Database;
let onTag: (tag: TagReading) => void;

function addCheckpoint(id: string, name: string, tag_uid: string, extra: { photo_media_id?: string; instruction?: string } = {}) {
  db.insert(checkpoints)
    .values({
      id,
      site_id: SITE,
      name,
      instruction: extra.instruction ?? null,
      tag_type: 'nfc',
      tag_uid,
      qr_payload: null,
      lat_e7: null,
      lng_e7: null,
      accuracy_dm: null,
      photo_media_id: extra.photo_media_id ?? null,
      active: true,
      created_at: AT,
      updated_at: AT,
    })
    .run();
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(useTagReader).mockImplementation((handler) => {
    onTag = handler;
    return { status: { supported: true, enabled: true } as NfcStatus, listening: true, reading: false, read: jest.fn(), error: null };
  });
  jest.mocked(currentLocation).mockResolvedValue(FIX);
  mockCameraView.mockImplementation(({ ref }: { ref?: { current: unknown } }) => {
    if (ref !== undefined) ref.current = {};
    return null;
  });
  mockedFiles.clear();
  let photos = 0;
  jest.mocked(takePhoto).mockImplementation(async () => {
    photos += 1;
    const id = `019a2b3c-4d5e-7f00-8a00-0000000000e${photos}`;
    mockedFiles.set(photoFile(id).uri, { size: 1234, modifiedAtMs: 0 });
    return { id, sha256: 'ab'.repeat(32), mime: 'image/jpeg', size_bytes: 1234, local_uri: photoFile(id).uri, taken_at: AT } as PhotoFile;
  });
  jest
    .mocked(useCameraPermissions)
    .mockReturnValue([{ granted: true, canAskAgain: true }, jest.fn(), jest.fn()] as unknown as ReturnType<typeof useCameraPermissions>);
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  setKv(db, 'supervisor.account', ME);
  useSyncStatus.setState({ online: true, rejectedCalls: [] });
  useSession.setState({ mode: 'supervisor_phone', activeUser: null, deviceId: null, shiftStart: null });
  db.insert(sites)
    .values({
      id: SITE,
      name: 'Raktár',
      address: null,
      timezone: 'Europe/Budapest',
      no_data_alert_after_min: 120,
      created_by: ME.id,
      created_at: AT,
      updated_at: AT,
    })
    .run();
  addCheckpoint(GATE, 'Kapu', '04A1B2C3D4E501');
  addCheckpoint(STORE, 'Raktár', '04A1B2C3D4E502', { photo_media_id: STORE_PHOTO, instruction: 'Zárva van?' });
  addCheckpoint(BOILER, 'Kazánház', '04A1B2C3D4E503');
  db.insert(routes)
    .values({
      id: ROUTE,
      site_id: SITE,
      name: 'Éjszakai kör',
      order_mode: 'free',
      current_version_id: VERSION,
      active: true,
      created_at: AT,
      updated_at: AT,
    })
    .run();
  db.insert(routeVersions)
    .values({ id: VERSION, route_id: ROUTE, version: 4, walk_duration_s: 300, created_by: ME.id, created_at: AT })
    .run();
  db.insert(routeVersionCheckpoints)
    .values([
      { route_version_id: VERSION, checkpoint_id: GATE, position: 1, walk_time_from_prev_s: null },
      { route_version_id: VERSION, checkpoint_id: STORE, position: 2, walk_time_from_prev_s: 120 },
      { route_version_id: VERSION, checkpoint_id: BOILER, position: 3, walk_time_from_prev_s: 180 },
    ])
    .run();
});

const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const editPath = `/routes/${ROUTE}/edit`;

async function answerAlert(label: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as AlertButton[] | undefined;
  const button = buttons?.find((b) => b.text === label);
  if (button?.onPress === undefined) throw new Error(`No alert button ${label}`);
  await act(async () => button.onPress!());
}

async function openEdit() {
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}` });
  await press(/^Éjszakai kör/);
  expect(screen).toHavePathname(editPath);
}

/** The names of the points in their order on the list. */
const pointNames = () => screen.getAllByRole('adjustable').map((handle) => handle.props.accessibilityLabel as string);

function queued() {
  return db
    .select({ method: outbox.method, path: outbox.path, body: outbox.body })
    .from(outbox)
    .all()
    .map((call) => ({ call: `${call.method} ${call.path}`, body: call.body }));
}

it('opens from the site details with the version it makes, and saves the changes as a new version', async () => {
  await openEdit();
  expect(screen.getByText('v4 szerkesztése · szabad sorrend')).toBeOnTheScreen();
  expect(screen.getByText(/Mentéskor új verzió \(v5\) készül/)).toBeOnTheScreen();
  expect(pointNames()).toEqual(['Áthelyezés: Kapu', 'Áthelyezés: Raktár', 'Áthelyezés: Kazánház']);
  expect(screen.getByText('NFC · fotó · utasítás')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Mentés v5-ként' })).toBeDisabled();

  // The name of a point, on its sheet.
  await press('Szerkesztés: Kapu');
  expect(screen.getByRole('header', { name: 'Pont adatai' })).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText(/Pont neve/), 'Főkapu');
  await press('Mentés');
  expect(pointNames()).toEqual(['Áthelyezés: Főkapu', 'Áthelyezés: Raktár', 'Áthelyezés: Kazánház']);

  // Moved by the screen reader's action, and by a drag.
  await act(async () =>
    fireEvent(screen.getByRole('adjustable', { name: 'Áthelyezés: Kazánház' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    }),
  );
  expect(pointNames()).toEqual(['Áthelyezés: Főkapu', 'Áthelyezés: Kazánház', 'Áthelyezés: Raktár']);
  const list = renderedList.mock.lastCall![0] as { data: { checkpoint_id: string }[]; onDragEnd: (p: object) => void };
  await act(async () => list.onDragEnd({ data: [list.data[1], list.data[0], list.data[2]], from: 1, to: 0 }));
  expect(pointNames()).toEqual(['Áthelyezés: Kazánház', 'Áthelyezés: Főkapu', 'Áthelyezés: Raktár']);

  // Taken out after a confirmation; the order mode.
  await press('Kivétel az útvonalból: Raktár');
  await answerAlert('Kivétel');
  expect(pointNames()).toEqual(['Áthelyezés: Kazánház', 'Áthelyezés: Főkapu']);
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Kötött sorrend' })));
  expect(screen.getByText('v4 szerkesztése · kötött sorrend')).toBeOnTheScreen();

  await press('Mentés v5-ként');

  expect(screen).toHavePathname(`/sites/${SITE}`);
  expect(screen.getByText('Az útvonal elmentve: v5')).toBeOnTheScreen();
  expect(queued()).toEqual([
    { call: `PATCH /checkpoints/${GATE}`, body: { name: 'Főkapu' } },
    { call: `PATCH /routes/${ROUTE}`, body: { order_mode: 'fixed' } },
    {
      call: `POST /routes/${ROUTE}/versions`,
      body: expect.objectContaining({
        walk_duration_s: 300,
        checkpoints: [
          { checkpoint_id: BOILER, walk_time_from_prev_s: null },
          { checkpoint_id: GATE, walk_time_from_prev_s: null },
        ],
      }),
    },
  ]);
  expect(db.select({ version: routeVersions.version }).from(routeVersions).all()).toHaveLength(2);
});

it('the sheet leads to the point’s QR label, keeping what was typed on it', async () => {
  db.update(checkpoints)
    .set({ qr_payload: `waypost:cp:${GATE}:Ab3dEf6hIj9kLm2n` })
    .where(eq(checkpoints.id, GATE))
    .run();
  await openEdit();
  await press('Szerkesztés: Kapu');
  await fireEvent.changeText(screen.getByLabelText(/Pont neve/), 'Főkapu');
  await press('QR-címke');

  expect(screen).toHavePathname(`/checkpoints/${GATE}/qr`);
  expect(screen.getByRole('image', { name: 'QR-kód: Kapu' })).toBeOnTheScreen();

  await act(async () => router.back());
  expect(screen).toHavePathname(editPath);
  expect(pointNames()).toEqual(['Áthelyezés: Főkapu', 'Áthelyezés: Raktár', 'Áthelyezés: Kazánház']);
  expect(screen.getByRole('button', { name: 'Mentés v5-ként' })).toBeEnabled();
});

it('the sheet does not leave for the label without a name', async () => {
  await openEdit();
  await press('Szerkesztés: Kapu');
  await fireEvent.changeText(screen.getByLabelText(/Pont neve/), '  ');
  await press('QR-címke');
  expect(screen).toHavePathname(editPath);
  expect(screen.getByText('Add meg a pont nevét.')).toBeOnTheScreen();
});

it('changes the photo of a point: the saved one is on the server, the new one goes up with the save', async () => {
  await openEdit();
  await press('Szerkesztés: Raktár');
  // Uploaded from another phone: there is no file here to show.
  expect(screen.getByText('Nincs a telefonon')).toBeOnTheScreen();
  await press('Új fotó');
  await press('Fotó készítése');
  await press('Mentés');
  expect(screen.getByText('NFC · fotó · utasítás')).toBeOnTheScreen();

  await press('Mentés v5-ként');

  const PHOTO = '019a2b3c-4d5e-7f00-8a00-0000000000e1';
  expect(queued().map((call) => call.call)).toEqual([
    `PUT /media/${PHOTO}`,
    `PATCH /checkpoints/${STORE}`,
    `POST /routes/${ROUTE}/versions`,
  ]);
  expect(queued()[1]!.body).toEqual({ photo_media_id: PHOTO });
  // Saved: the file is device data now.
  expect(discardPhoto).not.toHaveBeenCalled();
});

it('asks before leaving with changes, and deletes the photos taken then', async () => {
  await openEdit();
  await press('Szerkesztés: Kapu');
  await press('Fotó készítése');
  // The camera's shutter, over the tile.
  await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Fotó készítése' }).at(-1)!));
  await press('Mentés');
  await press('Vissza');
  expect(Alert.alert).toHaveBeenLastCalledWith('Elveted a módosításokat?', 'A nem mentett módosítások elvesznek.', expect.any(Array));
  expect(screen).toHavePathname(editPath);

  await answerAlert('Elvetés');

  expect(screen).toHavePathname(`/sites/${SITE}`);
  expect(mockedFiles.has(photoFile('019a2b3c-4d5e-7f00-8a00-0000000000e1').uri)).toBe(false);
  expect(queued()).toEqual([]);
});

it('adds a new point on the spot: one scan, at the end of the route, then the editing goes on from that version', async () => {
  await openEdit();
  await press('Új pont felvétele · bejárást igényel');

  expect(screen).toHavePathname(`/routes/${ROUTE}/train`);
  expect(screen.getByText('Új pont felvétele')).toBeOnTheScreen();
  expect(screen.getByText(/A pont az útvonal végére kerül \(4\. pont\)/)).toBeOnTheScreen();
  expect(getKv(db, 'training.draft')?.adding?.version_id).toBe(VERSION);

  // A point of the route already: it says where it is.
  await act(async () => onTag({ uid: '04A1B2C3D4E502', ndefRaw: null } as TagReading));
  expect(screen.getByText('A(z) „Raktár” pont már a bejárásban van, a(z) 2. helyen.')).toBeOnTheScreen();

  await act(async () => onTag({ uid: '04A1B2C3D4E577', ndefRaw: null } as TagReading));
  expect(screen).toHavePathname(`/routes/${ROUTE}/train/point`);
  expect(screen.getByText('Betanítás · 4. pont')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText(/Pont neve/), 'Tetőfeljáró');
  await press('Mentés');

  expect(screen).toHavePathname(`/routes/${ROUTE}/train`);
  expect(screen.getByRole('button', { name: '4. Tetőfeljáró, NFC · GPS ±4 m, –' })).toBeOnTheScreen();
  // One point: another tag waits for this one's save.
  await act(async () => onTag({ uid: '04A1B2C3D4E578', ndefRaw: null } as TagReading));
  expect(screen).toHavePathname(`/routes/${ROUTE}/train`);

  await press('Mentés v5-ként');

  expect(screen).toHavePathname(editPath);
  expect(screen.getByText('v5 szerkesztése · szabad sorrend')).toBeOnTheScreen();
  expect(pointNames()).toEqual(['Áthelyezés: Kapu', 'Áthelyezés: Raktár', 'Áthelyezés: Kazánház', 'Áthelyezés: Tetőfeljáró']);
  expect(screen.getByText(/Mentéskor új verzió \(v6\) készül/)).toBeOnTheScreen();
  expect(getKv(db, 'training.draft')).toBeNull();
  expect(queued().map((call) => call.call)).toEqual(['POST /checkpoints', `POST /routes/${ROUTE}/versions`]);
});

it('saves the changes first when a point is added', async () => {
  await openEdit();
  await press('Kivétel az útvonalból: Kazánház');
  await answerAlert('Kivétel');
  await press('Új pont felvétele · bejárást igényel');
  expect(Alert.alert).toHaveBeenLastCalledWith('Előbb mentés', expect.stringContaining('(v5)'), expect.any(Array));
  expect(screen).toHavePathname(editPath);

  await answerAlert('Mentés és tovább');

  expect(screen).toHavePathname(`/routes/${ROUTE}/train`);
  expect(screen.getByText(/A pont az útvonal végére kerül \(3\. pont\)/)).toBeOnTheScreen();
  expect(queued().map((call) => call.call)).toEqual([`POST /routes/${ROUTE}/versions`]);
});

it('starts again from a version that came meanwhile', async () => {
  await openEdit();
  await press('Kivétel az útvonalból: Kazánház');
  await answerAlert('Kivétel');
  // A pull brings another supervisor's version 5.
  const THEIRS = '019a2b3c-4d5e-7f00-8a00-0000000000d5';
  await act(async () => {
    db.insert(routeVersions)
      .values({ id: THEIRS, route_id: ROUTE, version: 5, walk_duration_s: 60, created_by: ME.id, created_at: AT })
      .run();
    db.insert(routeVersionCheckpoints)
      .values({ route_version_id: THEIRS, checkpoint_id: STORE, position: 1, walk_time_from_prev_s: null })
      .run();
    db.update(routes).set({ current_version_id: THEIRS }).run();
    const { emitConfigurationPulled } = jest.requireActual<typeof import('@/sync/events')>('@/sync/events');
    emitConfigurationPulled({ pages: 1, reset: false, changed: {}, deleted: {}, server_time: AT } as never);
  });
  expect(screen.getByText(/Közben új verzió készült \(v5\)/)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Mentés v6-ként' })).toBeDisabled();

  await press('Újrakezdés az új verzióból');

  expect(screen.getByText('v5 szerkesztése · szabad sorrend')).toBeOnTheScreen();
  expect(pointNames()).toEqual(['Áthelyezés: Raktár']);
});
