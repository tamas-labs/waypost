import { act, fireEvent, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Text } from 'react-native';

import AuthLayout from '@/app/(auth)/_layout';
import LoginScreen from '@/app/(auth)/login';
import Index from '@/app/index';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { deleteKv, setKv } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { createTestDatabase } from '@/db/testing';
import { getSupervisorToken } from '@/device/credentials';
import { AppStack } from '@/navigation/app-stack';
import { useSyncStatus } from '@/sync/status';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
// The sync itself does not run here; the login only refreshes its counts.
jest.mock('@/sync/runtime', () => ({ refreshPendingCount: jest.fn(), whenSyncIdle: jest.fn(() => Promise.resolve()) }));

const EXAMPLES = join(dirname(require.resolve('@waypost/schema/package.json')), 'examples', 'api');
const LOGGED_IN = JSON.parse(readFileSync(join(EXAMPLES, 'auth-login.response/valid/supervisor.json'), 'utf8')) as { token: string };
const BASE_URL = 'https://waypost.example/api/waypost/v1';
const SERVER_TIME = '2026-10-27T20:00:00.000Z';
const store = (SecureStore as unknown as { store: Map<string, string> }).store;

function RootLayout() {
  return (
    <ThemeProvider>
      <AppStack />
    </ThemeProvider>
  );
}

const ROUTES = {
  _layout: RootLayout,
  index: Index,
  '(auth)/_layout': AuthLayout,
  '(auth)/login': LoginScreen,
  '(auth)/pin': () => null,
  '(guard)/_layout': () => null,
  '(supervisor)/_layout': () => <Slot />,
  '(supervisor)/sites': () => <Text>Telephelylista</Text>,
  'dev/_layout': () => <Slot />,
  'dev/index': () => <Text>Fejlesztői eszközök képernyő</Text>,
  'prototype/_layout': () => null,
};

let db: Database;
let answer: () => Response | Promise<Response>;
const fetchMock = jest.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => answer());

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  // In a development build (as in the tests) the developer enrollment's address is used.
  setKv(db, 'dev.api_base_url', BASE_URL);
  store.clear();
  fetchMock.mockClear();
  answer = () => Response.json(LOGGED_IN);
  global.fetch = fetchMock as typeof fetch;
  useSession.setState({ mode: 'unassigned', deviceId: null, activeUser: null, shiftStart: null });
  useSyncStatus.setState({ online: true, replaced: false });
});

async function start() {
  await renderRouter(ROUTES, { initialUrl: '/' });
  expect(screen).toHavePathname('/login');
}

async function logIn(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('E-mail-cím'), email);
  await fireEvent.changeText(screen.getByLabelText('Jelszó'), password);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Belépés' })));
}

function refusal(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ server_time: SERVER_TIME, error: { code, message } }, { status, headers });
}

it('logs the supervisor in and opens the site list', async () => {
  await start();
  expect(screen.getByText('Supervisor belépés')).toBeOnTheScreen();
  await logIn('  nagy.anna@example.com ', 'titkos jelszo ');

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(String(url)).toBe(`${BASE_URL}/auth/login`);
  // The address without the spaces around it, the password as typed.
  expect(JSON.parse(String(init?.body))).toEqual({
    email: 'nagy.anna@example.com',
    password: 'titkos jelszo ',
    device_name: expect.any(String),
  });
  await expect(getSupervisorToken()).resolves.toBe(LOGGED_IN.token);
  expect(screen).toHavePathname('/sites');
  expect(screen.getByText('Telephelylista')).toBeOnTheScreen();
});

it("shows the server's message of a refused login, and stays", async () => {
  answer = () => refusal(401, 'unauthenticated', 'Hibás e-mail-cím vagy jelszó.');
  await start();
  await logIn('nagy.anna@example.com', 'rossz');

  expect(screen.getByText('Hibás e-mail-cím vagy jelszó.')).toBeOnTheScreen();
  expect(screen).toHavePathname('/login');
  await expect(getSupervisorToken()).resolves.toBeNull();
  // The fields keep what was typed, and the button can be pressed again.
  expect(screen.getByLabelText('E-mail-cím')).toHaveDisplayValue('nagy.anna@example.com');
  expect(screen.getByRole('button', { name: 'Belépés' })).toBeEnabled();
});

it('checks the fields before sending them', async () => {
  await start();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Belépés' })));
  expect(screen.getByText('Add meg az e-mail-címedet.')).toBeOnTheScreen();
  expect(screen.getByText('Add meg a jelszavadat.')).toBeOnTheScreen();

  await logIn('nagy.anna', 'titkos');
  expect(screen.getByText('Ez nem érvényes e-mail-cím.')).toBeOnTheScreen();
  expect(screen.queryByText('Add meg a jelszavadat.')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();

  // Typing clears the field's message.
  await fireEvent.changeText(screen.getByLabelText('E-mail-cím'), 'nagy.anna@');
  expect(screen.queryByText('Ez nem érvényes e-mail-cím.')).toBeNull();
});

it('tells when to try again after too many attempts', async () => {
  answer = () => refusal(429, 'rate_limited', 'Too Many Attempts.', { 'Retry-After': '120' });
  await start();
  await logIn('nagy.anna@example.com', 'rossz');
  expect(screen.getByText('Túl sok sikertelen próbálkozás. Próbáld újra 2 perc múlva.')).toBeOnTheScreen();
});

it('tells when the server cannot be reached', async () => {
  answer = () => {
    throw new TypeError('Network request failed');
  };
  await start();
  await logIn('nagy.anna@example.com', 'titkos');
  expect(screen.getByText('A szerver nem érhető el. Ellenőrizd az internetkapcsolatot, és próbáld újra.')).toBeOnTheScreen();
});

it('shows the button as busy while the login runs', async () => {
  let respond!: (response: Response) => void;
  answer = () => new Promise((resolve) => (respond = resolve));
  await start();
  await logIn('nagy.anna@example.com', 'titkos');
  expect(screen.getByRole('button', { name: 'Belépés…' })).toBeDisabled();
  await act(async () => respond(Response.json(LOGGED_IN)));
  expect(screen).toHavePathname('/sites');
});

it('cannot log in offline', async () => {
  useSyncStatus.setState({ online: false });
  await start();
  expect(screen.getByText('Nincs hálózati kapcsolat. A belépéshez internet kell.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Belépés' })).toBeDisabled();

  await act(() => useSyncStatus.setState({ online: true }));
  expect(screen.queryByText('Nincs hálózati kapcsolat. A belépéshez internet kell.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Belépés' })).toBeEnabled();
});

it('cannot log in without the address of the server', async () => {
  deleteKv(db, 'dev.api_base_url');
  const env = process.env.EXPO_PUBLIC_WAYPOST_API_URL;
  delete process.env.EXPO_PUBLIC_WAYPOST_API_URL;
  try {
    await start();
    expect(screen.getByText('Ebben a buildben nincs megadva a szerver címe, ezért nem lehet belépni.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Belépés' })).toBeDisabled();
  } finally {
    if (env !== undefined) process.env.EXPO_PUBLIC_WAYPOST_API_URL = env;
  }
});

it('explains what to do with a forgotten password', async () => {
  const help = 'Új jelszót a Waypost üzemeltetője tud beállítani: szólj neki.';
  await start();
  expect(screen.queryByText(help)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Elfelejtett jelszó?' }));
  expect(screen.getByText(help)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Elfelejtett jelszó?' }));
  expect(screen.queryByText(help)).toBeNull();
});

it('leads to the developer tools in a development build', async () => {
  await start();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Fejlesztői eszközök' })));
  expect(screen).toHavePathname('/dev');
});
