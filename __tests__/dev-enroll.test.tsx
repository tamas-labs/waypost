import { fireEvent, render, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import DevEnrollScreen from '@/app/dev/enroll';
import { getDeviceCredentials } from '@/auth/credentials';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { getKv } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { createTestDatabase } from '@/db/testing';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { replace: jest.fn() } }));

const EXAMPLES = join(dirname(require.resolve('@waypost/schema/package.json')), 'examples', 'api');
const example = (path: string): unknown => JSON.parse(readFileSync(join(EXAMPLES, `${path}.json`), 'utf8'));
const BASE_URL = 'http://192.168.1.10:8000/api/waypost/v1';
const ENROLLED = example('devices-enroll.response/valid/enrolled') as { device: { site_id: string } };
const SITE = {
  id: ENROLLED.device.site_id,
  name: 'Telephely A',
  address: '1051 Budapest, Példa utca 1.',
  timezone: 'Europe/Budapest',
  no_data_alert_after_min: 120,
  created_by: '019a2b3c-4d5e-7f00-8a00-000000000002',
  created_at: '2026-10-20T08:00:00.000Z',
  updated_at: '2026-10-27T10:05:12.345Z',
};
const SITES = {
  server_time: '2026-10-27T10:05:12.345Z',
  sites: [SITE, { ...SITE, id: '019a2b3c-4d5e-7f00-8a00-0000000000b2', name: 'Telephely B', address: null }],
};
const store = (SecureStore as unknown as { store: Map<string, string> }).store;

let db: Database;
const fetchMock = jest.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
  const path = String(url).slice(BASE_URL.length);
  if (path === '/auth/login') return Response.json(example('auth-login.response/valid/supervisor'));
  if (path === '/sites') return Response.json(SITES);
  if (path === '/devices/enroll') return Response.json(ENROLLED);
  if (path === '/auth/logout') return Response.json({ server_time: '2026-10-27T20:00:00.000Z' });
  return new Response('', { status: 404 });
});

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  (getDatabase as jest.Mock).mockReturnValue(db);
  store.clear();
  fetchMock.mockClear();
  global.fetch = fetchMock as typeof fetch;
  useSession.setState({ mode: 'unassigned', deviceId: null, activeUser: null });
});

async function renderScreen() {
  await render(
    <ThemeProvider>
      <DevEnrollScreen />
    </ThemeProvider>,
  );
}

async function logIn() {
  await fireEvent.changeText(screen.getByLabelText('API-cím'), BASE_URL);
  await fireEvent.changeText(screen.getByLabelText('E-mail-cím'), 'anna@example.com');
  await fireEvent.changeText(screen.getByLabelText('Jelszó'), 'secret');
  await fireEvent.press(screen.getByText('Belépés'));
}

test('enrolls the phone to the chosen site', async () => {
  await renderScreen();
  await logIn();
  expect(await screen.findByText('Válaszd ki a telephelyet')).toBeOnTheScreen();
  expect(getKv(db, 'dev.api_base_url')).toBe(BASE_URL);

  expect(screen.getByText('Telephely B')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Telephely A'));
  expect(await screen.findByText('A telefon a(z) Telephely A telephelyhez rendelve.')).toBeOnTheScreen();
  expect(await getDeviceCredentials()).not.toBeNull();
  expect(useSession.getState().mode).toBe('site_phone');
  expect(fetchMock.mock.calls.map(([url]) => String(url).slice(BASE_URL.length))).toEqual(['/auth/login', '/sites', '/devices/enroll', '/auth/logout']);
});

test('shows the server message of a failed login', async () => {
  fetchMock.mockImplementationOnce(async () =>
    Response.json({ server_time: '2026-10-27T20:00:00.000Z', error: { code: 'unauthenticated', message: 'Hibás e-mail-cím vagy jelszó.' } }, { status: 401 }),
  );
  await renderScreen();
  await logIn();
  expect(await screen.findByText('Hibás e-mail-cím vagy jelszó.')).toBeOnTheScreen();
  expect(useSession.getState().mode).toBe('unassigned');
});

test('tells when the server cannot be reached', async () => {
  fetchMock.mockImplementationOnce(async () => {
    throw new TypeError('Network request failed');
  });
  await renderScreen();
  await logIn();
  expect(await screen.findByText(`A szerver nem érhető el (${BASE_URL}).`)).toBeOnTheScreen();
});
