import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import SupervisorLayout from '@/app/(supervisor)/_layout';
import DeviceSetupScreen from '@/app/(supervisor)/device-setup';
import SitesScreen from '@/app/(supervisor)/sites/index';
import SiteScreen from '@/app/(supervisor)/sites/[id]';
import NewSiteScreen from '@/app/(supervisor)/sites/new';
import Index from '@/app/index';
import { useSession, type SessionState } from '@/auth/session';
import { enrollThisPhone, UnsentActionsError } from '@/auth/supervisor';
import type { Database } from '@/db/database';
import { getKv, setKv, type OutboxRejection } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { getReadiness, type Readiness } from '@/device/readiness';
import { devices, outbox, routes, siteUser, sites, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { AppStack } from '@/navigation/app-stack';
import { useSyncStatus } from '@/sync/status';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ requestSync: jest.fn() }));
// The logout itself is tested in src/auth/supervisor.test.ts and __tests__/navigation.test.tsx.
jest.mock('@/auth/supervisor', () => ({
  ...jest.requireActual<object>('@/auth/supervisor'),
  signOutSupervisor: jest.fn(),
  unsentSupervisorActions: jest.fn(() => 0),
  // The enrollment itself is tested in src/auth/supervisor.test.ts.
  enrollThisPhone: jest.fn(),
}));
// The readiness and its fixes are tested in src/device/readiness.test.ts and __tests__/device-setup-screen.test.tsx.
jest.mock('@/device/readiness', () => ({ ...jest.requireActual<object>('@/device/readiness'), getReadiness: jest.fn() }));
jest.mock('@/alarms/permissions', () => ({}));
jest.mock('@/nfc/reader', () => ({}));
jest.mock('@/photo/camera', () => ({}));
jest.mock('@/location/location', () => ({}));

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
  '(supervisor)/sites/[id]': SiteScreen,
  '(supervisor)/device-setup': DeviceSetupScreen,
  'dev/_layout': () => null,
  'prototype/_layout': () => null,
};

const AT = '2026-10-27T10:05:12.345Z';
const ME = { id: '019a2b3c-4d5e-7f00-8a00-000000000002', name: 'Kovács Anna', email: 'kovacs.anna@example.com' };
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const READY: Readiness = {
  nfc: { supported: true, enabled: true },
  alarms: { notifications: { granted: true, canAskAgain: true }, exactAlarms: true, batteryExempt: true },
  location: { granted: true, canAskAgain: true },
  camera: { granted: true, canAskAgain: true },
};

let db: Database;

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  setKv(db, 'supervisor.account', ME);
  useSyncStatus.setState({ online: true, rejectedCalls: [] });
  jest.mocked(getReadiness).mockResolvedValue(READY);
});

async function start(
  session: Pick<SessionState, 'mode' | 'activeUser'> = { mode: 'supervisor_phone', activeUser: null },
  deviceId: string | null = null,
) {
  useSession.setState({ ...session, deviceId, shiftStart: null });
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

it('shows the account, the device setup and the logout in the account menu', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await start();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Fiók: Kovács Anna' })));
  expect(alert).toHaveBeenCalledWith('Kovács Anna', 'kovacs.anna@example.com', [
    expect.objectContaining({ text: 'Mégse' }),
    expect.objectContaining({ text: 'Telefon beállítása' }),
    expect.objectContaining({ text: 'Kijelentkezés' }),
  ]);

  await act(async () => alert.mock.calls[0]![2]!.find((button) => button.text === 'Telefon beállítása')!.onPress!());
  expect(screen).toHavePathname('/device-setup');
  expect(screen.getByText('Kamera engedélyezve')).toBeOnTheScreen();
  // No alarms on the supervisor's own phone.
  expect(screen.queryByText('Értesítések engedélyezve')).toBeNull();
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
    expect.objectContaining({ text: 'Telefon beállítása' }),
    expect.objectContaining({ text: 'Kilépés a supervisor módból' }),
  ]);
  // A ready phone has nothing to warn about.
  expect(screen.queryByText('A telefon beállítása hiányos')).toBeNull();
  alert.mockRestore();
});

it('warns on the site phone about a missing setting, and leads to the device setup', async () => {
  db.insert(users).values({ id: ME.id, name: ME.name, role: 'supervisor', active: true, created_at: AT, updated_at: AT }).run();
  jest.mocked(getReadiness).mockResolvedValue({ ...READY, alarms: { ...READY.alarms, batteryExempt: false } });
  await start({ mode: 'site_phone', activeUser: { id: ME.id, role: 'supervisor' } });

  expect(screen.getByText('A telefon beállítása hiányos')).toBeOnTheScreen();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Telefon beállítása' })));
  expect(screen).toHavePathname('/device-setup');
  expect(screen.getByText('A rendszer elhalaszthatja az ébresztést')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Javítás' })).toBeOnTheScreen();
});

it("does not warn about the alarms on a supervisor's own phone", async () => {
  jest.mocked(getReadiness).mockResolvedValue({ ...READY, alarms: { ...READY.alarms, batteryExempt: false } });
  await start();
  expect(screen.queryByText('A telefon beállítása hiányos')).toBeNull();
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

describe('site details', () => {
  const PHONE = '019a2b3c-4d5e-7f00-8a00-000000000004';

  function seedDetails() {
    seedSite();
    db.insert(users).values({ id: ME.id, name: ME.name, role: 'supervisor', active: true, created_at: AT, updated_at: AT }).run();
    db.insert(siteUser).values({ site_id: SITE, user_id: ME.id }).run();
    db.insert(routes)
      .values({
        id: '019a2b3c-4d5e-7f00-8a00-0000000000d1',
        site_id: SITE,
        name: 'Éjszakai kör',
        order_mode: 'free',
        current_version_id: null,
        active: true,
        created_at: AT,
        updated_at: AT,
      })
      .run();
    db.insert(devices)
      .values({ id: PHONE, site_id: SITE, name: 'Porta', platform: 'android', app_version: '0.1.0', enrolled_by: ME.id, enrolled_at: AT })
      .run();
  }

  it('opens from the site list with the routes, the settings and the site phone', async () => {
    seedDetails();
    await start();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: /Raktár/ })));

    expect(screen).toHavePathname(`/sites/${SITE}`);
    expect(screen.getByRole('header', { name: 'Raktár' })).toBeOnTheScreen();
    expect(screen.getByText('1 supervisor · Kovács Anna')).toBeOnTheScreen();
    expect(screen.getByText('Éjszakai kör')).toBeOnTheScreen();
    expect(screen.getByText('Még nincs betanítva · szabad sorrend')).toBeOnTheScreen();
    expect(screen.getByText('Nincs menetrend')).toBeOnTheScreen();
    expect(screen.getByText('Még nincs őr')).toBeOnTheScreen();
    expect(screen.getByText('Nincs feliratkozás')).toBeOnTheScreen();
    expect(screen.getByText('Porta · Android')).toBeOnTheScreen();
    expect(screen.getByText('Hozzárendelve: 2026. 10. 27. · v0.1.0')).toBeOnTheScreen();

    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Vissza' })));
    expect(screen).toHavePathname('/sites');
  });

  it("shows the site phone's own sync state on the site phone", async () => {
    seedDetails();
    useSyncStatus.setState({ online: false, lastSuccessAt: null, pendingCount: 3 });
    await start({ mode: 'site_phone', activeUser: { id: ME.id, role: 'supervisor' } }, PHONE);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: /Raktár/ })));
    expect(screen.getByText('Ez a telefon · Offline · még nem szinkronizált · 3 tétel vár')).toBeOnTheScreen();
  });

  it('tells when the site is no longer on the phone', async () => {
    useSession.setState({ mode: 'supervisor_phone', activeUser: null, deviceId: null, shiftStart: null });
    await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}` });
    expect(screen.getByText('Ez a telephely már nincs meg ezen a telefonon.')).toBeOnTheScreen();
  });

  it('tells how a site without a phone gets one', async () => {
    seedSite();
    await start();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: /Raktár/ })));
    expect(screen.getByText('Nincs hozzárendelt telefon')).toBeOnTheScreen();
    expect(screen.getByText('A telephelyi telefonon, a fiókoddal belépve rendelheted hozzá.')).toBeOnTheScreen();
  });
});

describe('enrolling this phone', () => {
  const PHONE = '019a2b3c-4d5e-7f00-8a00-000000000004';

  beforeEach(() => {
    seedSite();
    setKv(db, 'dev.api_base_url', 'https://waypost.example/api/waypost/v1');
    jest.mocked(enrollThisPhone).mockReset();
  });

  async function openSite(session?: Pick<SessionState, 'mode' | 'activeUser'>) {
    await start(session);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: /Raktár/ })));
  }

  it('enrolls after a confirmation, and the PIN login follows', async () => {
    db.insert(devices)
      .values({ id: PHONE, site_id: SITE, name: 'Porta', platform: 'android', app_version: '0.1.0', enrolled_by: ME.id, enrolled_at: AT })
      .run();
    jest.mocked(enrollThisPhone).mockImplementation(async () => {
      useSession.setState({ mode: 'site_phone', deviceId: PHONE });
      return {} as never;
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await openSite();

    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Telefon hozzárendelése' })));
    expect(enrollThisPhone).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Ez legyen a telephely telefonja?',
      'Ez a telefon lesz a(z) Raktár telephelyi telefonja. A fiókod kijelentkezik róla, a telephely adatai letöltődnek, és utána csak PIN-kóddal lehet belépni. A mostani telefont (Porta) a szerver visszavonja; a még fel nem töltött adatait az még feltölti.',
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => buttons.find((button) => button.text === 'Hozzárendelés')!.onPress!());

    expect(enrollThisPhone).toHaveBeenCalledWith(db, expect.anything(), SITE);
    // The navigation follows the session: the site phone without a user is at the PIN login (a stub here).
    expect(screen).not.toHavePathname(`/sites/${SITE}`);
    alert.mockRestore();
  });

  it('tells what went wrong', async () => {
    jest.mocked(enrollThisPhone).mockRejectedValue(new UnsentActionsError(2));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await openSite();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Telefon hozzárendelése' })));
    await act(async () => alert.mock.calls[0]![2]!.find((button) => button.text === 'Hozzárendelés')!.onPress!());

    expect(
      screen.getByText(
        '2 módosítás még nem jutott el a szerverre. A hozzárendelés előtt el kell küldeni őket: ellenőrizd a kapcsolatot, és próbáld újra.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Telefon hozzárendelése' })).toBeEnabled();
    alert.mockRestore();
  });

  it('needs the network', async () => {
    useSyncStatus.setState({ online: false });
    await openSite();
    expect(screen.getByRole('button', { name: 'Telefon hozzárendelése' })).toBeDisabled();
    expect(screen.getByText('A hozzárendeléshez internet kell.')).toBeOnTheScreen();
  });

  it('is not on the site phone', async () => {
    db.insert(users).values({ id: ME.id, name: ME.name, role: 'supervisor', active: true, created_at: AT, updated_at: AT }).run();
    await openSite({ mode: 'site_phone', activeUser: { id: ME.id, role: 'supervisor' } });
    expect(screen.queryByRole('button', { name: 'Telefon hozzárendelése' })).toBeNull();
  });
});
