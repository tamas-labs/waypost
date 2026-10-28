import { act, render, screen } from '@testing-library/react-native';

import ClockScreen from '@/app/prototype/clock';
import { ThemeProvider } from '@/theme/theme-provider';
import { getBootId, getUptimeMs } from '@modules/waypost-clock';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: jest.fn(), getBootId: jest.fn() }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

const uptime = getUptimeMs as jest.Mock;
const bootId = getBootId as jest.Mock;

const OPENED_AT = new Date('2026-10-27T20:00:00.000Z').getTime();

beforeEach(() => {
  jest.useFakeTimers({ now: OPENED_AT });
  // Uptime 1:02:05 when the screen opens, then advancing together with the device clock.
  uptime.mockImplementation(() => 3_725_000 + (Date.now() - OPENED_AT));
  bootId.mockReturnValue('android-boot:42');
});

afterEach(() => jest.useRealTimers());

async function renderScreen() {
  await render(
    <ThemeProvider>
      <ClockScreen />
    </ThemeProvider>,
  );
}

test('shows uptime, boot ID and device time', async () => {
  await renderScreen();
  expect(screen.getByText('1:02:05')).toBeOnTheScreen();
  expect(screen.getByText('android-boot:42')).toBeOnTheScreen();
  expect(screen.getByText('2026-10-27T20:00:00.000Z')).toBeOnTheScreen();
});

test('compares the two clocks since the screen was opened', async () => {
  await renderScreen();
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getByText('Eszközóra: +5 mp')).toBeOnTheScreen();
  expect(screen.getByText('Uptime: +5 mp')).toBeOnTheScreen();
  expect(screen.getByText('Eltérés: 0 ms')).toBeOnTheScreen();
});

test('shows why the boot ID is not available', async () => {
  bootId.mockImplementation(() => {
    throw new Error('no BOOT_COUNT');
  });
  await renderScreen();
  expect(screen.getByText('Nem érhető el: no BOOT_COUNT')).toBeOnTheScreen();
});

test('shows the drift when uptime does not advance (e.g. not counting during sleep)', async () => {
  uptime.mockReturnValue(3_725_000);
  await renderScreen();
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getByText('Uptime: +0 mp')).toBeOnTheScreen();
  expect(screen.getByText('Eltérés: 5000 ms')).toBeOnTheScreen();
});
