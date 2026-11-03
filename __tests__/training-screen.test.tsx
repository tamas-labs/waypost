import { act, fireEvent, screen } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, Platform, type AlertButton } from 'react-native';

import SupervisorLayout from '@/app/(supervisor)/_layout';
import TrainingScreen from '@/app/(supervisor)/routes/[id]/train/index';
import TrainingPointScreen from '@/app/(supervisor)/routes/[id]/train/point';
import TrainingQrScreen from '@/app/(supervisor)/routes/[id]/train/qr';
import SiteScreen from '@/app/(supervisor)/sites/[id]';
import { useSession } from '@/auth/session';
import type { PhotoFile } from '@/chain/payloads';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { checkpoints, outbox, routes, sites } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { playFeedback } from '@/feedback/feedback';
import { currentLocation } from '@/location/location';
import type { NfcStatus } from '@/nfc/reader';
import type { TagReading } from '@/nfc/tag';
import { useTagReader } from '@/nfc/use-tag-reader';
import { photoFile } from '@/photo/files';
import { discardPhoto, takePhoto } from '@/photo/photo';
import { useSyncStatus } from '@/sync/status';
import { ThemeProvider } from '@/theme/theme-provider';

let mockUptime = 1_000_000;
const mockCameraView = jest.fn();
jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => mockUptime, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ requestSync: jest.fn() }));
jest.mock('@/feedback/feedback', () => ({ playFeedback: jest.fn(), playHaptic: jest.fn() }));
jest.mock('@/location/location', () => ({ currentLocation: jest.fn() }));
jest.mock('@/nfc/reader', () => ({ openNfcSettings: jest.fn(() => Promise.resolve()) }));
jest.mock('@/nfc/use-tag-reader', () => ({ useTagReader: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-camera', () => ({ useCameraPermissions: jest.fn(), CameraView: (props: unknown) => mockCameraView(props) }));
jest.mock('@/photo/photo', () => ({ takePhoto: jest.fn(), discardPhoto: jest.fn() }));
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
  '(supervisor)/routes/[id]/train/index': TrainingScreen,
  '(supervisor)/routes/[id]/train/point': TrainingPointScreen,
  '(supervisor)/routes/[id]/train/qr': TrainingQrScreen,
};

const AT = '2026-10-27T10:05:12.345Z';
const ME = { id: '019a2b3c-4d5e-7f00-8a00-000000000002', name: 'Kovács Anna', email: 'kovacs.anna@example.com' };
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const GATE = '019a2b3c-4d5e-7f00-8a00-0000000000c1';
const GATE_TAG = '04A1B2C3D4E501';
const GATE_QR = `waypost:cp:${GATE}:AbCdEfGhIjKlMnOp`;
const NEW_TAG = '04A1B2C3D4E577';
const FIX = { latitude: 47.4979, longitude: 19.0402, accuracy_m: 4.2, mocked: false, gnss_time: null };

let db: Database;
let onTag: (tag: TagReading) => void;
let nfcStatus: NfcStatus;
const read = jest.fn(() => Promise.resolve());

beforeEach(async () => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  mockUptime = 1_000_000;
  nfcStatus = { supported: true, enabled: true } as NfcStatus;
  jest.mocked(useTagReader).mockImplementation((handler) => {
    onTag = handler;
    return { status: nfcStatus, listening: true, reading: false, read, error: null };
  });
  jest.mocked(currentLocation).mockResolvedValue(FIX);
  // The photo camera needs its ref: the mocked view stands for it.
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
  addCheckpoint(GATE, 'Kapu', GATE_TAG, GATE_QR);
});

function addCheckpoint(id: string, name: string, tag_uid: string, qr_payload: string | null = null) {
  db.insert(checkpoints)
    .values({
      id,
      site_id: SITE,
      name,
      instruction: null,
      tag_type: 'nfc',
      tag_uid,
      qr_payload,
      lat_e7: null,
      lng_e7: null,
      accuracy_dm: null,
      photo_media_id: null,
      active: true,
      created_at: AT,
      updated_at: AT,
    })
    .run();
}

const draft = () => getKv(db, 'training.draft');
const trainPath = () => `/routes/${draft()!.route.id}/train`;
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const touch = (uid: string | null) => act(async () => onTag({ uid, ndefRaw: null } as TagReading));
const walkFor = (seconds: number) => {
  mockUptime += seconds * 1000;
};

/** Presses the button of the last alert that has it. */
async function answerAlert(label: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as AlertButton[] | undefined;
  const button = buttons?.find((b) => b.text === label);
  if (button?.onPress === undefined) throw new Error(`No alert button ${label}`);
  await act(async () => button.onPress!());
}

async function startNewTraining() {
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}` });
  await press('Új útvonal betanítása');
  expect(screen).toHavePathname(trainPath());
}

/** An unknown tag, named on the point screen. */
async function addNewPoint(name: string, uid = NEW_TAG) {
  await touch(uid);
  expect(screen).toHavePathname(`${trainPath()}/point`);
  await fireEvent.changeText(screen.getByLabelText(/Pont neve/), name);
  await press('Mentés, jöhet a következő');
  expect(screen).toHavePathname(trainPath());
}

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('trains a new route from the site details: new and existing points, walk times, order, and the save', async () => {
  await startNewTraining();
  expect(screen.getByRole('header', { name: 'Új útvonal' })).toBeOnTheScreen();
  expect(screen.getByText('Betanítás · supervisor')).toBeOnTheScreen();
  expect(screen.getByText('00:00')).toBeOnTheScreen();
  expect(screen.getByText('Menj a következő ponthoz…')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Bejárás befejezése' })).toBeDisabled();

  // An unknown tag: a new point with its name, instruction and location.
  walkFor(30);
  await touch('04:a1:b2:c3:d4:e5:77');
  expect(playFeedback).toHaveBeenCalledWith('success');
  expect(screen).toHavePathname(`${trainPath()}/point`);
  expect(screen.getByText('Betanítás · 1. pont')).toBeOnTheScreen();
  expect(screen.getByText('Címke leolvasva · NFC')).toBeOnTheScreen();
  expect(screen.getByText('Címke leolvasva · NFC 04:A1:B2:C3:D4:E5:77 · GPS ±4 m')).toBeOnTheScreen();
  await press('Mentés, jöhet a következő');
  expect(screen.getByText('Add meg a pont nevét.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText(/Pont neve/), 'Hátsó kapu');
  await fireEvent.changeText(screen.getByLabelText(/Utasítás az őrnek/), 'Zárva van?');
  await press('Mentés, jöhet a következő');

  expect(screen).toHavePathname(trainPath());
  expect(screen.getByRole('button', { name: '1. Hátsó kapu, NFC · utasítás · GPS ±4 m, start' })).toBeOnTheScreen();

  // The tag of a checkpoint of the site: the point screen offers it.
  walkFor(95);
  await touch(GATE_TAG);
  expect(
    screen.getByText('Ez a címke már a(z) „Kapu” ponthoz tartozik ezen a telephelyen. A pontot hozzáadhatod az útvonalhoz.'),
  ).toBeOnTheScreen();
  await press('Pont hozzáadása');
  expect(screen.getByRole('button', { name: '2. Kapu, Meglévő pont, +1:35' })).toBeOnTheScreen();

  // The same tag again is not a second point.
  await touch(GATE_TAG);
  expect(playFeedback).toHaveBeenLastCalledWith('warning');
  expect(screen.getByText('A(z) „Kapu” pont már a bejárásban van, a(z) 2. helyen.')).toBeOnTheScreen();
  expect(screen).toHavePathname(trainPath());

  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Kötött sorrend' })));
  expect(draft()?.route.order_mode).toBe('fixed');

  // The end of the walk: the measured time, the time limit it suggests, the name of the new route.
  await press('Bejárás befejezése');
  expect(screen.getByText('1:35')).toBeOnTheScreen();
  expect(screen.getByText('5 perc')).toBeOnTheScreen();
  await press('Mentés új verzióként');
  expect(screen.getByText('Add meg az útvonal nevét.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText(/Útvonal neve/), 'Hétvégi kör');
  await press('Mentés új verzióként');

  expect(screen).toHavePathname(`/sites/${SITE}`);
  expect(screen.getByText('Az útvonal elmentve: Hétvégi kör')).toBeOnTheScreen();
  expect(screen.getByText('Hétvégi kör')).toBeOnTheScreen();
  expect(db.select({ name: routes.name, order_mode: routes.order_mode }).from(routes).all()).toEqual([
    { name: 'Hétvégi kör', order_mode: 'fixed' },
  ]);
  expect(
    db
      .select({ path: outbox.path })
      .from(outbox)
      .all()
      .map((row) => row.path),
  ).toEqual(['/routes', '/checkpoints', expect.stringMatching(/^\/routes\/[0-9a-f-]{36}\/versions$/)]);
  expect(draft()).toBeNull();
  expect(screen.queryByText('Betanítás folytatása')).toBeNull();
});

it('counts the time since the start', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  try {
    await startNewTraining();
    walkFor(402);
    await act(async () => jest.advanceTimersByTime(1000));
    expect(screen.getByText('06:42')).toBeOnTheScreen();
  } finally {
    jest.useRealTimers();
  }
});

it('does not keep a mocked location, and tells about an unreadable tag', async () => {
  jest.mocked(currentLocation).mockResolvedValue({ ...FIX, mocked: true });
  await startNewTraining();
  await touch(null);
  expect(playFeedback).toHaveBeenCalledWith('error');
  expect(screen.getByText('Ezt a címkét nem lehet leolvasni. Próbáld újra, vagy használj másik címkét.')).toBeOnTheScreen();

  await touch(NEW_TAG);
  expect(screen.getByText('Címke leolvasva · NFC 04:A1:B2:C3:D4:E5:77 · GPS nélkül')).toBeOnTheScreen();
});

it('adds an existing point by its QR code, and makes no point of an unknown one', async () => {
  nfcStatus = { supported: false, enabled: false } as NfcStatus;
  await startNewTraining();
  expect(
    screen.getByText('Ezen a telefonon nincs NFC: QR-kóddal csak a telephely meglévő pontjait veheted fel. Új ponthoz NFC-s telefon kell.'),
  ).toBeOnTheScreen();
  await press('Pont leolvasása');
  expect(screen).toHavePathname(`${trainPath()}/qr`);
  expect(screen.getByText('Tartsd a pont QR-kódját a keretbe. QR-kóddal a telephely meglévő pontjait veheted fel.')).toBeOnTheScreen();

  const scan = (data: string) =>
    act(async () =>
      (mockCameraView.mock.calls.at(-1)![0] as { onBarcodeScanned: (r: { data: string }) => void }).onBarcodeScanned({ data }),
    );
  await scan('waypost:cp:019a2b3c-4d5e-7f00-8a00-0000000000ff:AbCdEfGhIjKlMnOp');
  expect(screen.getByText('Ez a QR-kód nem a telephely egyik pontjáé. Új pontot NFC-címkével vehetsz fel.')).toBeOnTheScreen();

  await scan(GATE_QR);
  expect(screen).toHavePathname(`${trainPath()}/point`);
  expect(screen.getByText('QR-kód leolvasva · Kapu')).toBeOnTheScreen();
  await press('Pont hozzáadása');
  // The QR reader gave way to the point screen: back on the walk.
  expect(screen).toHavePathname(trainPath());
  expect(screen.getByRole('button', { name: '1. Kapu, Meglévő pont, start' })).toBeOnTheScreen();
});

it('leaves a scanned point out, takes a point out, and discards the training after a confirmation', async () => {
  await startNewTraining();
  await touch(GATE_TAG);
  await press('Pont elvetése');
  expect(screen).toHavePathname(trainPath());
  expect(screen.queryByText('Kapu')).toBeNull();

  await addNewPoint('Hátsó kapu');
  // A new point opens its details, where it can be taken out.
  await press(/^1\. Hátsó kapu/);
  expect(screen.getByRole('header', { name: 'Pont adatai' })).toBeOnTheScreen();
  await press('Pont kivétele');
  await answerAlert('Kivétel');
  expect(screen).toHavePathname(trainPath());
  expect(screen.queryByText('Hátsó kapu')).toBeNull();
  expect(draft()?.points).toEqual([]);
  // An existing one only can be.
  await touch(GATE_TAG);
  await press('Pont hozzáadása');
  await press(/^1\. Kapu/);
  await answerAlert('Kivétel');
  expect(draft()?.points).toEqual([]);

  // Without points there is nothing to lose.
  await addNewPoint('Hátsó kapu');
  await press('Betanítás megszakítása');
  expect(Alert.alert).toHaveBeenLastCalledWith('Megszakítod a betanítást?', 'A rögzített pontok elvesznek.', expect.any(Array));
  await answerAlert('Elvetés');
  expect(screen).toHavePathname(`/sites/${SITE}`);
  expect(draft()).toBeNull();
});

it('takes a photo of a new point, changes its details later, and uploads the photo before the checkpoint', async () => {
  await startNewTraining();
  await touch(NEW_TAG);
  await fireEvent.changeText(screen.getByLabelText(/Pont neve/), 'Hátsó kapu');
  expect(screen.getByText('Fotó a pontról · segít megtalálni')).toBeOnTheScreen();
  await press('Fotó készítése');
  // The camera's shutter, over the tile.
  await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Fotó készítése' }).at(-1)!));
  const [first] = await Promise.all(jest.mocked(takePhoto).mock.results.map((result) => result.value as Promise<PhotoFile>));
  expect(screen.getByRole('button', { name: '1. fotó' })).toBeOnTheScreen();
  // Another one instead: the first is deleted at once.
  await press('Új fotó');
  await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Fotó készítése' }).at(-1)!));
  expect(jest.mocked(discardPhoto).mock.calls).toEqual([[first]]);
  await press('Mentés, jöhet a következő');
  expect(screen.getByRole('button', { name: '1. Hátsó kapu, NFC · fotó · GPS ±4 m, start' })).toBeOnTheScreen();
  const PHOTO = '019a2b3c-4d5e-7f00-8a00-0000000000e2';
  expect(draft()?.points[0]).toMatchObject({ photo: { id: PHOTO } });
  expect(discardPhoto).toHaveBeenCalledTimes(1);

  // Its details again: the name changes, the photo stays.
  await press(/^1\. Hátsó kapu/);
  expect(screen.getByLabelText(/Pont neve/)).toHaveDisplayValue('Hátsó kapu');
  await fireEvent.changeText(screen.getByLabelText(/Pont neve/), 'Hátsó kapu 2');
  await press('Mentés');
  expect(screen).toHavePathname(trainPath());
  expect(screen.getByRole('button', { name: '1. Hátsó kapu 2, NFC · fotó · GPS ±4 m, start' })).toBeOnTheScreen();
  expect(mockedFiles.has(photoFile(PHOTO).uri)).toBe(true);

  // A photo of a point left out goes with it.
  walkFor(60);
  await touch('04A1B2C3D4E588');
  await press('Fotó készítése');
  await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Fotó készítése' }).at(-1)!));
  await press('Pont elvetése');
  expect(jest.mocked(discardPhoto).mock.calls.at(-1)).toEqual([expect.objectContaining({ id: '019a2b3c-4d5e-7f00-8a00-0000000000e3' })]);

  await press('Bejárás befejezése');
  await fireEvent.changeText(screen.getByLabelText(/Útvonal neve/), 'Hétvégi kör');
  await press('Mentés új verzióként');
  expect(
    db
      .select({ path: outbox.path, media_id: outbox.media_id })
      .from(outbox)
      .all()
      .map((row) => [row.path, row.media_id]),
  ).toEqual([
    ['/routes', null],
    [`/media/${PHOTO}`, PHOTO],
    ['/checkpoints', null],
    [expect.stringMatching(/\/versions$/), null],
  ]);
  expect(mockedFiles.has(photoFile(PHOTO).uri)).toBe(true);
});

it('keeps the draft when the walk is left, and the site details continue it', async () => {
  await startNewTraining();
  const path = trainPath();
  await addNewPoint('Hátsó kapu');
  await act(async () => router.back());
  expect(screen).toHavePathname(`/sites/${SITE}`);
  expect(screen.getByText('Új útvonal · 1 pont rögzítve')).toBeOnTheScreen();

  await press(/Betanítás folytatása/);
  expect(screen).toHavePathname(path);
  expect(screen.getByText('Hátsó kapu')).toBeOnTheScreen();

  // A new training replaces it, after a confirmation.
  await act(async () => router.back());
  await press('Új útvonal betanítása');
  expect(Alert.alert).toHaveBeenLastCalledWith('Új betanítást kezdesz?', 'A félbehagyott betanítás (1 pont) elvész.', expect.any(Array));
  await answerAlert('Új betanítás');
  expect(screen).toHavePathname(trainPath());
  expect(trainPath()).not.toBe(path);
  expect(draft()?.points).toEqual([]);
});

it('tells which points to take out when their tag went to another checkpoint meanwhile', async () => {
  await startNewTraining();
  await addNewPoint('Hátsó kapu');
  // A pull brought a checkpoint with the same tag.
  addCheckpoint('019a2b3c-4d5e-7f00-8a00-0000000000c9', 'Bejárat', NEW_TAG);

  await press('Bejárás befejezése');
  await fireEvent.changeText(screen.getByLabelText(/Útvonal neve/), 'Hétvégi kör');
  await press('Mentés új verzióként');
  expect(
    screen.getByText(
      'Ezeknek a pontoknak a címkéje közben egy másik ponthoz került a telephelyen: „Hátsó kapu”. Vedd ki őket a bejárásból, és olvass le helyettük másik címkét.',
    ),
  ).toBeOnTheScreen();
  expect(db.select().from(outbox).all()).toEqual([]);
  // The name typed is kept with the draft.
  expect(draft()?.route.name).toBe('Hétvégi kör');
});

it('tells when the training is no longer on the phone', async () => {
  await renderRouter(ROUTES, { initialUrl: '/routes/019a2b3c-4d5e-7f00-8a00-0000000000b9/train' });
  expect(screen.getByText('Ez a betanítás már nincs meg ezen a telefonon.')).toBeOnTheScreen();
});
