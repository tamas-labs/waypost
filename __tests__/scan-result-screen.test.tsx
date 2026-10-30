import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { eq } from 'drizzle-orm';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ScanResultScreen from '@/app/(guard)/scan-result';
import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { getDatabase } from '@/db/open';
import { checkpoints } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { schedulerStep } from '@/domain/rounds';
import { manualScan, type TagRead } from '@/domain/scan';
import { guardLogin } from '@/domain/shift';
import { C1, C2, C3, GUARD, idSequence, local } from '@/domain/testing';
import { recordTagRead } from '@/guard/scan';
import { loadGuardState } from '@/guard/state';
import { seedSite } from '@/guard/testing';
import { pointResultParams, scanResultParams } from '@/navigation/use-scan-recorder';
import { ThemeProvider } from '@/theme/theme-provider';
import { nowTimestamp } from '@/time/timestamp';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));
jest.mock('@/guard/scheduler', () => ({ requestSchedulerStep: jest.fn() }));
jest.mock('@/location/location', () => ({ currentLocation: jest.fn(() => Promise.resolve(null)) }));
jest.mock('@/components/sync-status-indicator', () => ({ SyncStatusIndicator: () => null }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(),
  useIsFocused: jest.fn(() => true),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const { router } = jest.requireMock<{ router: { back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock } }>('expo-router');

let db: Database;
let roundId: string;
const newId = idSequence();

const state = () => loadGuardState(db, nowTimestamp())!;
const write = (drafts: Parameters<typeof appendChainEntries>[1]) => appendChainEntries(db, drafts);
const step = () => write(schedulerStep(state(), nowTimestamp(), newId));
const nfc = (id: string): TagRead => ({ method: 'nfc', tag_uid: state().checkpoints.find((c) => c.id === id)!.tag_uid!, ndef_raw: null });

const tree = () => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <ThemeProvider>
      <ScanResultScreen />
    </ThemeProvider>
  </SafeAreaProvider>
);

/** Records the read, and shows its result as the recorder would. */
async function showResult(read: TagRead) {
  const outcome = await recordTagRead(db, read);
  jest.mocked(useLocalSearchParams).mockReturnValue(scanResultParams(outcome, read, roundId));
  await render(tree());
}
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
/** Second by second, so React runs the effects between them, as it does on a phone. */
const tick = async (ms: number) => {
  for (let left = ms; left > 0; left -= 1000) await act(async () => jest.advanceTimersByTime(1000));
};

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('19:55')), doNotFake: ['nextTick', 'setImmediate'] });
  jest.clearAllMocks();
  jest.mocked(useIsFocused).mockReturnValue(true);
  router.canGoBack.mockReturnValue(true);
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  await seedSite(db);
  await write(guardLogin(state(), GUARD, nowTimestamp(), newId).drafts);
  jest.setSystemTime(Date.parse(local('20:00')));
  await step();
  roundId = state().rounds[0]!.id;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a success', () => {
  it('shows the point, its instruction and the progress', async () => {
    db.update(checkpoints).set({ instruction: 'Ellenőrizd a tetőajtót.' }).where(eq(checkpoints.id, C1)).run();
    await showResult(nfc(C1));
    expect(screen.getByRole('header', { name: 'Pont 1' })).toBeOnTheScreen();
    expect(screen.getByText('Leolvasva · 20:00 · NFC')).toBeOnTheScreen();
    expect(screen.getByText('20:00-s kör · Útvonal 61')).toBeOnTheScreen();
    expect(screen.getByText('1 / 3 pont')).toBeOnTheScreen();
    expect(screen.getByText('még 2 · 20:00 van hátra')).toBeOnTheScreen();
    expect(screen.getByText(/Ellenőrizd a tetőajtót/)).toBeOnTheScreen();
    await tick(1000);
    expect(screen.getByText('még 2 · 19:59 van hátra')).toBeOnTheScreen();
  });

  it('leaves out the instruction when the point has none', async () => {
    await showResult(nfc(C1));
    expect(screen.queryByText(/Utasítás/)).not.toBeOnTheScreen();
  });

  it('counts down and goes back by itself after 3 seconds, once', async () => {
    await showResult(nfc(C1));
    expect(screen.getByRole('button', { name: 'Tovább · 3' })).toBeOnTheScreen();
    await tick(2000);
    expect(screen.getByRole('button', { name: 'Tovább · 1' })).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
    await tick(1000);
    expect(router.back).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('goes back at the press, and the timer does not go back again', async () => {
    await showResult(nfc(C1));
    await press(/Tovább/);
    await press(/Tovább/);
    await tick(5000);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('waits while another screen is on top', async () => {
    await showResult(nfc(C1));
    jest.mocked(useIsFocused).mockReturnValue(false);
    await act(async () => screen.rerender(tree()));
    await tick(10_000);
    expect(router.back).not.toHaveBeenCalled();
    jest.mocked(useIsFocused).mockReturnValue(true);
    await act(async () => screen.rerender(tree()));
    await tick(3000);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('goes home when there is nothing to go back to', async () => {
    router.canGoBack.mockReturnValue(false);
    await showResult(nfc(C1));
    await press(/Tovább/);
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('leads to an incident at this point, without closing by itself', async () => {
    await showResult(nfc(C1));
    await press('Esemény ennél a pontnál');
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/incident/new', params: { checkpoint_id: C1 } });
    await tick(5000);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('tells that the scan completed the round, whose status has closed by then', async () => {
    await recordTagRead(db, nfc(C1));
    await recordTagRead(db, nfc(C2));
    await showResult(nfc(C3));
    expect(state().rounds[0]!.status).toBe('completed');
    expect(screen.getByText('3 / 3 pont')).toBeOnTheScreen();
    expect(screen.getByText('Teljesítve')).toBeOnTheScreen();
    expect(screen.queryByText(/van hátra/)).not.toBeOnTheScreen();
  });
});

describe('an unknown tag', () => {
  const UNKNOWN: TagRead = { method: 'nfc', tag_uid: '04A2196B3C5180', ndef_raw: null };

  it('shows what was read, and tries again on the round', async () => {
    await showResult(UNKNOWN);
    expect(screen.getByRole('header', { name: 'Ismeretlen címke' })).toBeOnTheScreen();
    expect(screen.getByText('Nem rögzítettük')).toBeOnTheScreen();
    expect(screen.getByText('20:00-s kör · Útvonal 61')).toBeOnTheScreen();
    expect(screen.getByText('NFC · 04:A2:19:6B:3C:51:80')).toBeOnTheScreen();
    await tick(5000);
    expect(router.back).not.toHaveBeenCalled();
    await press('Újra próbálom');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('goes on to the manual entry of the round', async () => {
    await showResult(UNKNOWN);
    await press('Sérült címke – kézi rögzítés');
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/manual', params: { round_id: roundId } });
  });

  it('offers no manual entry once the round has closed', async () => {
    jest.setSystemTime(Date.parse(local('20:20')));
    await step();
    await showResult(UNKNOWN);
    expect(screen.queryByRole('button', { name: 'Sérült címke – kézi rögzítés' })).not.toBeOnTheScreen();
  });

  it('opens the QR reader again after a QR read', async () => {
    const payload = 'waypost:cp:unknown:aB3dE5gH7jK9mN01';
    await showResult({ method: 'qr', qr_payload: payload });
    expect(screen.getByText(`QR · ${payload}`)).toBeOnTheScreen();
    await press('Újra próbálom');
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/qr', params: { round_id: roundId } });
  });
});

it('tells that a manual entry is not verified', async () => {
  const location = null;
  const shot = { id: newId(), sha256: 'b'.repeat(64), mime: 'image/jpeg', size_bytes: 240_000, local_uri: 'file:///documents/media/c.jpg', taken_at: nowTimestamp() };
  const outcome = manualScan({ state: state(), now: nowTimestamp(), location, newId }, { round_id: roundId, checkpoint_id: C1, note: 'Letörött.', media: [shot] });
  await appendChainEntries(db, outcome.drafts, { photos: [shot] });
  jest.mocked(useLocalSearchParams).mockReturnValue(pointResultParams(outcome));
  await render(tree());
  expect(screen.getByText('Rögzítve · 20:00 · Kézi – nem igazolt')).toBeOnTheScreen();
  expect(screen.getByText('1 / 3 pont')).toBeOnTheScreen();
});

it('tells when the point is already scanned, and waits', async () => {
  await recordTagRead(db, nfc(C1));
  jest.setSystemTime(Date.parse(local('20:03')));
  await showResult(nfc(C1));
  expect(screen.getByRole('header', { name: 'Pont 1' })).toBeOnTheScreen();
  expect(screen.getByText('Már leolvasva 20:00-kor')).toBeOnTheScreen();
  await tick(5000);
  expect(router.back).not.toHaveBeenCalled();
  await press('Értem, tovább');
  expect(router.back).toHaveBeenCalledTimes(1);
});

it('compares a wrong order with the point expected, and waits', async () => {
  await showResult(nfc(C3));
  expect(screen.getByRole('header', { name: 'Rossz sorrend' })).toBeOnTheScreen();
  expect(screen.getByText('Rögzítve, jelöléssel')).toBeOnTheScreen();
  expect(screen.getByText('Leolvastad')).toBeOnTheScreen();
  expect(screen.getByText('Pont 3')).toBeOnTheScreen();
  expect(screen.getByText('Következő lett volna')).toBeOnTheScreen();
  expect(screen.getByText('Pont 1')).toBeOnTheScreen();
  expect(screen.getByText(/A\(z\) Pont 1 pontot ettől még/)).toBeOnTheScreen();
  await tick(5000);
  expect(router.back).not.toHaveBeenCalled();
  await press('Értem, tovább');
  expect(router.back).toHaveBeenCalledTimes(1);
});

it('tells about a scan out of round, and waits', async () => {
  jest.setSystemTime(Date.parse(local('20:20')));
  await step();
  await showResult(nfc(C1));
  expect(screen.getByRole('header', { name: 'Pont 1' })).toBeOnTheScreen();
  expect(screen.getByText('Rögzítve, jelöléssel')).toBeOnTheScreen();
  expect(screen.getByText(/körön kívüli leolvasásként/)).toBeOnTheScreen();
  await tick(5000);
  expect(router.back).not.toHaveBeenCalled();
});

it('leaves when it has no result to show', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  await render(tree());
  expect(router.back).toHaveBeenCalledTimes(1);
});
