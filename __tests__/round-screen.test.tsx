import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RoundScreen from '@/app/(guard)/round/[id]';
import { useSession } from '@/auth/session';
import { appendChainEntries } from '@/chain/writer';
import * as toast from '@/components/toast';
import type { Database } from '@/db/database';
import { getDatabase } from '@/db/open';
import { checkpoints } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { schedulerStep } from '@/domain/rounds';
import { guardLogin } from '@/domain/shift';
import { C1, C2, C3, GUARD, idSequence, local } from '@/domain/testing';
import { playFeedback, playHaptic } from '@/feedback/feedback';
import { requestSchedulerStep } from '@/guard/scheduler';
import { loadGuardState } from '@/guard/state';
import { currentLocation, watchPosition } from '@/location/location';
import { mapsConfigured } from '@/location/maps';
import { seedSite } from '@/guard/testing';
import { openNfcSettings, type NfcStatus } from '@/nfc/reader';
import type { TagReading } from '@/nfc/tag';
import { useTagReader } from '@/nfc/use-tag-reader';
import { ThemeProvider } from '@/theme/theme-provider';
import { nowTimestamp } from '@/time/timestamp';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));
jest.mock('@/guard/scheduler', () => ({ requestSchedulerStep: jest.fn() }));
jest.mock('@/feedback/feedback', () => ({ playFeedback: jest.fn(), playHaptic: jest.fn() }));
jest.mock('@/location/location', () => ({ currentLocation: jest.fn(() => Promise.resolve(null)), watchPosition: jest.fn(() => jest.fn()) }));
jest.mock('@/location/maps', () => ({ mapsConfigured: jest.fn(() => true) }));
jest.mock('@/nfc/reader', () => ({ openNfcSettings: jest.fn(() => Promise.resolve()) }));
jest.mock('@/nfc/use-tag-reader', () => ({ useTagReader: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
// Named, so requireMock gets the instance the screen uses.
jest.mock('react-native-maps');
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(),
  useIsFocused: jest.fn(() => true),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

let db: Database;
let roundId: string;
let onTag: (tag: TagReading) => void;
const read = jest.fn(() => Promise.resolve());
let nfcStatus: NfcStatus | null;
let readerError: unknown;
const newId = idSequence();
const expoRouter = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock }; useIsFocused: jest.Mock }>('expo-router');
const { router } = expoRouter;

const setNow = (at: string) => jest.setSystemTime(Date.parse(at));
const state = () => loadGuardState(db, nowTimestamp())!;
const write = (drafts: Parameters<typeof appendChainEntries>[1]) => appendChainEntries(db, drafts);
const step = () => write(schedulerStep(state(), nowTimestamp(), newId));
const tagOf = (id: string) => ({ uid: state().checkpoints.find((c) => c.id === id)!.tag_uid, ndefRaw: null }) as TagReading;
const touch = (tag: TagReading) => act(async () => onTag(tag));

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('19:55')), doNotFake: ['nextTick', 'setImmediate'] });
  jest.clearAllMocks();
  expoRouter.useIsFocused.mockReturnValue(true);
  nfcStatus = { supported: true, enabled: true } as NfcStatus;
  readerError = null;
  jest.mocked(useTagReader).mockImplementation((handler) => {
    onTag = handler;
    return { status: nfcStatus, listening: true, reading: false, read, error: readerError };
  });
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  await seedSite(db);
  useSession.setState({ mode: 'site_phone', activeUser: { id: GUARD, role: 'guard' }, shiftStart: null });
  await write(guardLogin(state(), GUARD, nowTimestamp(), newId).drafts);
  setNow(local('20:00'));
  await step();
  roundId = state().rounds[0]!.id;
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: roundId });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const tree = () => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <ThemeProvider>
      <RoundScreen />
    </ThemeProvider>
  </SafeAreaProvider>
);
const renderScreen = () => render(tree());

it('shows the round, the progress, the time left and the points', async () => {
  await renderScreen();
  expect(screen.getByRole('header', { name: '20:00-s kör' })).toBeOnTheScreen();
  expect(screen.getByText('Útvonal 61')).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: '0 / 3 pont kész' })).toBeOnTheScreen();
  expect(screen.getByText('20:00')).toBeOnTheScreen();
  expect(screen.getByText('Határidő 20:20')).toBeOnTheScreen();
  expect(screen.getByLabelText('Pont 1, Hátravan')).toBeOnTheScreen();
  expect(screen.getByLabelText('Pont 3, Hátravan')).toBeOnTheScreen();
  await act(async () => jest.advanceTimersByTime(3000));
  expect(screen.getByText('19:57')).toBeOnTheScreen();
});

it('warns once in the last 5 minutes, and asks for the closing at the deadline', async () => {
  await renderScreen();
  await act(async () => jest.advanceTimersByTime(14 * 60_000 + 59_000));
  expect(playHaptic).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(2000));
  expect(playHaptic).toHaveBeenCalledTimes(1);
  expect(playHaptic).toHaveBeenCalledWith('warning');
  await act(async () => jest.advanceTimersByTime(60_000));
  expect(playHaptic).toHaveBeenCalledTimes(1);
  expect(requestSchedulerStep).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(5 * 60_000));
  expect(screen.getByText('00:00')).toBeOnTheScreen();
  expect(requestSchedulerStep).toHaveBeenCalledWith('round_due');
  expect(playHaptic).toHaveBeenCalledTimes(1);
});

it('records a touched tag, gives feedback, and goes to the result', async () => {
  await renderScreen();
  await touch(tagOf(C1));
  expect(state().rounds[0]!.status).toBe('in_progress');
  expect(playFeedback).toHaveBeenCalledWith('success');
  expect(router.push).toHaveBeenCalledWith({ pathname: '/scan-result', params: { kind: 'recorded', scan_id: expect.any(String), checkpoint_id: C1, round_id: roundId, out_of_order: 'false', completed: 'false' } });
  expect(screen.getByRole('progressbar', { name: '1 / 3 pont kész' })).toBeOnTheScreen();
  expect(screen.getByLabelText('Pont 1, Leolvasva, 20:00 · NFC')).toBeOnTheScreen();
});

it('marks a scan out of order', async () => {
  await renderScreen();
  await touch(tagOf(C2));
  expect(playFeedback).toHaveBeenCalledWith('warning');
  expect(screen.getByText('20:00 · NFC · Rossz sorrend')).toBeOnTheScreen();
});

it('drops a second tag while the first is being recorded', async () => {
  await renderScreen();
  await act(async () => {
    onTag(tagOf(C1));
    onTag(tagOf(C2));
  });
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(state().rounds[0]!.scans.map((scan) => scan.checkpoint_id)).toEqual([C1]);
});

it('says so about a tag without a valid UID, and records nothing', async () => {
  await renderScreen();
  await touch({ uid: null, ndefRaw: null } as TagReading);
  expect(playFeedback).toHaveBeenCalledWith('error');
  expect(screen.getByText(/Ezt a címkét nem lehet leolvasni/)).toBeOnTheScreen();
  expect(state().rounds[0]!.status).toBe('open');
  expect(router.push).not.toHaveBeenCalled();
});

it('says so when a scan cannot be recorded', async () => {
  await renderScreen();
  jest.mocked(getDatabase).mockImplementationOnce(() => {
    throw new Error('no database');
  });
  await touch(tagOf(C1));
  expect(playFeedback).toHaveBeenCalledWith('error');
  expect(screen.getByText(/Nem sikerült rögzíteni/)).toBeOnTheScreen();
});

it('leaves when the round closes, but only once it is on top again', async () => {
  await renderScreen();
  expoRouter.useIsFocused.mockReturnValue(false);
  await touch(tagOf(C1));
  await touch(tagOf(C2));
  await touch(tagOf(C3));
  expect(state().rounds[0]!.status).toBe('completed');
  expect(router.back).not.toHaveBeenCalled();
  expoRouter.useIsFocused.mockReturnValue(true);
  await act(async () => screen.rerender(tree()));
  expect(router.back).toHaveBeenCalledTimes(1);
});

it('tells with a toast when the deadline closes the round', async () => {
  const shown = jest.spyOn(toast, 'showToast');
  await renderScreen();
  await touch(tagOf(C1));
  jest.setSystemTime(Date.parse(local('20:21')));
  await step();
  await act(async () => screen.rerender(tree()));
  expect(shown).toHaveBeenCalledWith('A kör lezárult: Hiányos', 'warn');
  expect(router.back).toHaveBeenCalledTimes(1);
});

it('has no toast for a round completed by a scan', async () => {
  const shown = jest.spyOn(toast, 'showToast');
  await renderScreen();
  await touch(tagOf(C1));
  await touch(tagOf(C2));
  await touch(tagOf(C3));
  await act(async () => screen.rerender(tree()));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(shown).not.toHaveBeenCalled();
});

describe('the Leolvasás button', () => {
  const press = () => act(async () => fireEvent.press(screen.getByRole('button', { name: 'Leolvasás' })));

  it('opens the NFC sheet on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await renderScreen();
    await press();
    expect(read).toHaveBeenCalled();
  });

  it('tells on Android that tags are read without it', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await renderScreen();
    expect(screen.queryByText(/gomb nélkül is olvas/)).not.toBeOnTheScreen();
    await press();
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByText(/gomb nélkül is olvas/)).toBeOnTheScreen();
  });

  it('opens the NFC settings on Android when NFC is off', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    nfcStatus = { supported: true, enabled: false } as NfcStatus;
    await renderScreen();
    expect(screen.getByText(/Az NFC ki van kapcsolva/)).toBeOnTheScreen();
    await press();
    expect(openNfcSettings).toHaveBeenCalled();
  });

  it('opens the QR reader on a phone without NFC', async () => {
    nfcStatus = { supported: false, enabled: false } as NfcStatus;
    await renderScreen();
    expect(screen.getByText(/nincs NFC/)).toBeOnTheScreen();
    await press();
    expect(router.push).toHaveBeenCalledWith({ pathname: '/qr', params: { round_id: roundId } });
  });

  it('tells when an NFC reading failed', async () => {
    readerError = new Error('session');
    await renderScreen();
    expect(screen.getByText(/Nem sikerült a leolvasás/)).toBeOnTheScreen();
  });
});

describe('the map', () => {
  const FIX = { latitude: 47.6, longitude: 19.1, accuracy_m: 8, mocked: false, gnss_time: null };
  const showMap = () => act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Térkép' })));
  const { animateCamera } = jest.requireMock<{ animateCamera: jest.Mock }>('react-native-maps');
  const center = () => screen.getByRole('button', { name: 'Saját helyzet középre' });

  beforeEach(() => {
    jest.mocked(mapsConfigured).mockReturnValue(true);
    jest.mocked(watchPosition).mockImplementation(() => jest.fn());
  });

  it('opens on the list, and the view can be chosen', async () => {
    await renderScreen();
    expect(screen.queryByTestId('map')).not.toBeOnTheScreen();
    await showMap();
    expect(screen.getByTestId('map')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Lista' })));
    expect(screen.queryByTestId('map')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Címke nem olvasható' })).toBeOnTheScreen();
  });

  it('has the smaller header and bottom bar of the design', async () => {
    await renderScreen();
    await showMap();
    expect(screen.queryByText('Határidő 20:20')).not.toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: '0 / 3 pont kész' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Címke nem olvasható' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Leolvasás' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Esemény rögzítése' })).toBeOnTheScreen();
  });

  it('shows the points left, and no way walked yet', async () => {
    await renderScreen();
    await showMap();
    expect(screen.getByTestId('map').props.accessibilityLabel).toBe('Telephely térképe a megtett úttal: 0 leolvasott pont, 3 hátralévő');
    expect(screen.getAllByTestId('map-marker').map((marker) => marker.props.accessibilityLabel)).toEqual(['Pont 1, Hátravan', 'Pont 2, Hátravan', 'Pont 3, Hátravan']);
    expect(screen.queryByTestId('map-polyline')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Megtett út/)).not.toBeOnTheScreen();
  });

  it('connects the scans, and a new scan shows without leaving the map', async () => {
    jest.mocked(currentLocation).mockResolvedValue(FIX);
    await renderScreen();
    await showMap();
    await touch(tagOf(C1));
    expect(screen.getByLabelText('Pont 1, Leolvasva')).toBeOnTheScreen();
    expect(screen.getByText('Megtett út · 20:00–20:00')).toBeOnTheScreen();
    expect(screen.queryByTestId('map-polyline')).not.toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(3 * 60_000));
    await touch(tagOf(C2));
    expect(screen.getByTestId('map-polyline').props.coordinates).toHaveLength(2);
    expect(screen.getByText('Megtett út · 20:00–20:03')).toBeOnTheScreen();
    expect(screen.getByTestId('map').props.accessibilityLabel).toContain('2 leolvasott pont, 1 hátralévő');
  });

  it('follows the position only on the map and on top, and centres on it', async () => {
    const stop = jest.fn();
    let report: (position: { latitude: number; longitude: number }) => void = () => undefined;
    jest.mocked(watchPosition).mockImplementation((onPosition) => {
      report = onPosition;
      return stop;
    });
    await renderScreen();
    expect(watchPosition).not.toHaveBeenCalled();
    await showMap();
    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(center()).toBeDisabled();

    await act(async () => report({ latitude: 47.5, longitude: 19 }));
    expect(screen.getByLabelText('Itt vagy')).toBeOnTheScreen();
    await act(async () => fireEvent.press(center()));
    expect(animateCamera).toHaveBeenCalledWith({ center: { latitude: 47.5, longitude: 19 } }, { duration: 300 });

    expoRouter.useIsFocused.mockReturnValue(false);
    await act(async () => screen.rerender(tree()));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('draws a dashed line from the last scan to the position', async () => {
    jest.mocked(currentLocation).mockResolvedValue(FIX);
    jest.mocked(watchPosition).mockImplementation((onPosition) => {
      onPosition({ latitude: 47.5, longitude: 19 });
      return jest.fn();
    });
    await renderScreen();
    await showMap();
    await touch(tagOf(C1));
    expect(screen.getByTestId('map-polyline').props.coordinates).toEqual([
      { latitude: 47.6, longitude: 19.1 },
      { latitude: 47.5, longitude: 19 },
    ]);
  });

  it('does not vibrate again when the view changes in the last 5 minutes', async () => {
    await renderScreen();
    await act(async () => jest.advanceTimersByTime(15 * 60_000 + 1000));
    expect(playHaptic).toHaveBeenCalledTimes(1);
    await showMap();
    expect(playHaptic).toHaveBeenCalledTimes(1);
  });

  it('says so when no point has a location', async () => {
    db.update(checkpoints).set({ lat_e7: null, lng_e7: null }).run();
    await renderScreen();
    await showMap();
    expect(screen.queryByTestId('map')).not.toBeOnTheScreen();
    expect(screen.getByText(/A pontok helye még nincs rögzítve/)).toBeOnTheScreen();
  });

  it('says so in a build without a map', async () => {
    jest.mocked(mapsConfigured).mockReturnValue(false);
    await renderScreen();
    await showMap();
    expect(screen.queryByTestId('map')).not.toBeOnTheScreen();
    expect(screen.getByText(/A térkép ezen a telefonon nem érhető el/)).toBeOnTheScreen();
  });
});
