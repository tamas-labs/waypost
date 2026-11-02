import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import SupervisorLayout from '@/app/(supervisor)/_layout';
import SitesScreen from '@/app/(supervisor)/sites/index';
import NewSiteScreen from '@/app/(supervisor)/sites/new';
import Index from '@/app/index';
import { useSession, type SessionState } from '@/auth/session';
import type { Database } from '@/db/database';
import { getKv, setKv, type OutboxRejection } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { devices, outbox, sites, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { AppStack } from '@/navigation/app-stack';
import { useSyncStatus } from '@/sync/status';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ requestSync: jest.fn() }));
// The logout itself is tested in src/auth/supervisor.test.ts and __tests__/navigation.test.tsx.
jest.mock('@/auth/supervisor', () => ({ signOutSupervisor: jest.fn(), unsentSupervisorActions: jest.fn(() => 0) }));

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
  '(auth)/_layout': () => null,
  '(guard)/_layout': () => null,
  '(supervisor)/_layout': SupervisorLayout,
  '(supervisor)/sites/index': SitesScreen,
  '(supervisor)/sites/new': NewSiteScreen,
  'dev/_layout': () => null,
  'prototype/_layout': () => null,
};

const AT = '2026-10-27T10:05:12.345Z';
const ME = { id: '019a2b3c-4d5e-7f00-8a00-000000000002', name: 'Kovács Anna', email: 'kovacs.anna@example.com' };
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';

let db: Database;

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  setKv(db, 'supervisor.account', ME);
  useSyncStatus.setState({ online: true, rejectedCalls: [] });
});

async function start(session: Pick<SessionState, 'mode' | 'activeUser'> = { mode: 'supervisor_phone', activeUser: null }) {
  useSession.setState({ ...session, deviceId: null, shiftStart: null });
  await renderRouter(ROUTES, { initialUrl: '/' });
  expect(screen).toHavePathname('/sites');
}

function seedSite(name = 'Raktár') {
  db.insert(sites)
    .values({
      id: SITE,
      name,
      address: null,
      timezone: 'Europe/Budapest',
      no_data_alert_after_min: 120,
      created_by: ME.id,
      created_at: AT,
      updated_at: AT,
    })
    .run();
}

it('lists the sites with what the phone knows of them', async () => {
  seedSite();
  await start();
  expect(screen.getByRole('header', { name: 'Telephelyek' })).toBeOnTheScreen();
  expect(screen.getByText('Raktár')).toBeOnTheScreen();
  expect(screen.getByText('Még nincs útvonal')).toBeOnTheScreen();
  expect(screen.getByText('Nincs telefon')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Fiók: Kovács Anna' })).toHaveTextContent('KA');
});

it('shows the phone of a site', async () => {
  seedSite();
  db.insert(devices)
    .values({
      id: '019a2b3c-4d5e-7f00-8a00-000000000004',
      site_id: SITE,
      name: 'Pixel 8',
      platform: 'android',
      app_version: '0.1.0',
      enrolled_by: ME.id,
      enrolled_at: AT,
    })
    .run();
  await start();
  expect(screen.getByText('Telefon: Pixel 8')).toBeOnTheScreen();
  expect(screen.queryByText('Nincs telefon')).toBeNull();
});

it('creates a site, which waits for the upload in the list', async () => {
  await start();
  expect(screen.getByText('Még nincs telephely. Az Új telephely gombbal hozhatsz létre egyet.')).toBeOnTheScreen();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Új telephely' })));
  expect(screen).toHavePathname('/sites/new');

  // The name is required.
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Mentés' })));
  expect(screen.getByText('Add meg a telephely nevét.')).toBeOnTheScreen();
  expect(db.select().from(outbox).all()).toEqual([]);

  await fireEvent.changeText(screen.getByLabelText('Telephely neve, kötelező'), 'Logisztikai központ');
  expect(screen.queryByText('Add meg a telephely nevét.')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Cím, nem kötelező'), '1051 Budapest, Példa utca 1.');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Mentés' })));

  expect(screen).toHavePathname('/sites');
  expect(screen.getByText('Telephely létrehozva: Logisztikai központ')).toBeOnTheScreen();
  expect(screen.getByText('Logisztikai központ')).toBeOnTheScreen();
  expect(screen.getByText('Feltöltésre vár')).toBeOnTheScreen();
  expect(db.select({ path: outbox.path, body: outbox.body }).from(outbox).all()).toEqual([
    { path: '/sites', body: expect.objectContaining({ name: 'Logisztikai központ', address: '1051 Budapest, Példa utca 1.' }) },
  ]);
});

it('tells offline that the new site is uploaded later', async () => {
  useSyncStatus.setState({ online: false });
  await start();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Új telephely' })));
  expect(screen.getByText('Offline is menthető: a kapcsolat visszatérésekor feltöltődik.')).toBeOnTheScreen();
});

it('shows the account and the logout in the account menu', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await start();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Fiók: Kovács Anna' })));
  expect(alert).toHaveBeenCalledWith('Kovács Anna', 'kovacs.anna@example.com', [
    expect.objectContaining({ text: 'Mégse' }),
    expect.objectContaining({ text: 'Kijelentkezés' }),
  ]);
  alert.mockRestore();
});

it('has no new site on the site phone, and its menu leads back to the PIN login', async () => {
  seedSite();
  db.insert(users).values({ id: ME.id, name: ME.name, role: 'supervisor', active: true, created_at: AT, updated_at: AT }).run();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await start({ mode: 'site_phone', activeUser: { id: ME.id, role: 'supervisor' } });

  expect(screen.getByText('Raktár')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Új telephely' })).toBeNull();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Fiók: Kovács Anna' })));
  expect(alert).toHaveBeenCalledWith('Kovács Anna', 'PIN-kóddal belépve ezen a telephelyi telefonon.', [
    expect.objectContaining({ text: 'Mégse' }),
    expect.objectContaining({ text: 'Kilépés a supervisor módból' }),
  ]);
  alert.mockRestore();
});

it('lists the refused actions until the supervisor has seen them', async () => {
  const rejection = (message: string): OutboxRejection => ({
    call_id: '019a2b3c-4d5e-7f00-8a00-0000000000c1',
    method: 'POST',
    path: '/sites',
    status: 422,
    code: 'validation_failed',
    message,
    details: null,
    at: AT,
  });
  const rejected = [rejection('A név túl hosszú.'), rejection('Ez a címke már egy másik ponté.')];
  setKv(db, 'outbox.rejected', rejected);
  useSyncStatus.setState({ rejectedCalls: rejected });
  await start();

  expect(screen.getByText(/2 módosítást nem fogadott el a szerver\./)).toBeOnTheScreen();
  expect(screen.getByText(/A név túl hosszú\.\s+Ez a címke már egy másik ponté\./)).toBeOnTheScreen();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Rendben' })));
  expect(screen.queryByText(/nem fogadott el a szerver/)).toBeNull();
  expect(getKv(db, 'outbox.rejected')).toBeNull();
});
