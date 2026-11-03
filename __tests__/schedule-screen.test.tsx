import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';

import SupervisorLayout from '@/app/(supervisor)/_layout';
import ScheduleScreen from '@/app/(supervisor)/routes/[id]/schedule';
import SiteScreen from '@/app/(supervisor)/sites/[id]';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { setKv } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { outbox, routes, routeVersions, schedules, sites } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { useSyncStatus } from '@/sync/status';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 1_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ requestSync: jest.fn() }));

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
  '(supervisor)/routes/[id]/schedule': ScheduleScreen,
};

const AT = '2026-10-27T10:05:12.345Z';
const ME = { id: '019a2b3c-4d5e-7f00-8a00-000000000002', name: 'Kovács Anna', email: 'kovacs.anna@example.com' };
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const ROUTE = '019a2b3c-4d5e-7f00-8a00-0000000000b1';
const DAY_ROUTE = '019a2b3c-4d5e-7f00-8a00-0000000000b2';
const VERSION = '019a2b3c-4d5e-7f00-8a00-0000000000d1';
const NIGHT = '019a2b3c-4d5e-7f00-8a00-0000000000e1';

let db: Database;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  setKv(db, 'supervisor.account', ME);
  useSyncStatus.setState({ online: true, rejectedCalls: [] });
  useSession.setState({ mode: 'supervisor_phone', activeUser: null, deviceId: null, shiftStart: null });
  db.insert(sites)
    .values({
      id: SITE,
      name: 'Raktár',
      timezone: 'Europe/Budapest',
      no_data_alert_after_min: 120,
      created_by: ME.id,
      created_at: AT,
      updated_at: AT,
    })
    .run();
  addRoute(ROUTE, 'Éjszakai kör', VERSION);
  db.insert(routeVersions)
    .values({ id: VERSION, route_id: ROUTE, version: 4, walk_duration_s: 980, created_by: ME.id, created_at: AT })
    .run();
});

function addRoute(id: string, name: string, version: string | null) {
  db.insert(routes)
    .values({ id, site_id: SITE, name, order_mode: 'free', current_version_id: version, active: true, created_at: AT, updated_at: AT })
    .run();
}

function addNightly(values: Partial<typeof schedules.$inferInsert> = {}) {
  db.insert(schedules)
    .values({
      id: NIGHT,
      route_id: ROUTE,
      name: 'Éjszaka',
      weekdays: 31,
      mode: 'interval',
      start_times: null,
      interval_from: '20:00',
      interval_to: '08:00',
      interval_every_min: 60,
      time_limit_min: 25,
      active: true,
      created_at: AT,
      updated_at: AT,
      ...values,
    })
    .run();
}

const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const schedulePath = `/routes/${ROUTE}/schedule`;

async function openFromSite() {
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}` });
  await press(/Menetrend/);
}

const queued = () =>
  db
    .select({ method: outbox.method, path: outbox.path, body: outbox.body })
    .from(outbox)
    .all()
    .map((call) => ({ call: `${call.method} ${call.path}`, body: call.body }));

const dayStates = () =>
  ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'].map(
    (day) => screen.getByRole('togglebutton', { name: day }).props.accessibilityState.checked as boolean,
  );

/** Picks a time on the open time sheet and closes it. */
async function pickTime(hour: string, minute: string) {
  await act(async () => fireEvent.press(screen.getAllByRole('radio', { name: hour })[0]!));
  await act(async () => fireEvent.press(screen.getAllByRole('radio', { name: minute }).at(-1)!));
  await press('Kész');
}

it('opens from the site with the route’s schedule as it is, and saves only what changed', async () => {
  addNightly();
  await openFromSite();
  expect(screen).toHavePathname(schedulePath);
  expect(screen.getByText('Éjszakai kör')).toBeOnTheScreen();
  expect(dayStates()).toEqual([true, true, true, true, true, false, false]);
  expect(screen.getByRole('radio', { name: 'Ismétlődés' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Első kör: 20:00, módosítás' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Utolsó kör: 08:00, módosítás' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Gyakoriság: 60 perc, módosítás' })).toBeOnTheScreen();
  expect(screen.getByText('13 kör éjszakánként · utolsó 08:00-kor')).toBeOnTheScreen();
  expect(screen.getByText('25 perc')).toBeOnTheScreen();
  expect(screen.getByText('javasolt érték')).toBeOnTheScreen();
  expect(screen.getByText('Mért bejárás 16:20 × 1,5 = 24:30 → 5 percre kerekítve.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Menetrend mentése' })).toBeDisabled();

  await act(async () => fireEvent.press(screen.getByRole('togglebutton', { name: 'Szombat' })));
  await press('5 perccel több');
  expect(screen.getByText('30 perc')).toBeOnTheScreen();
  expect(screen.getByText('egyéni érték')).toBeOnTheScreen();
  await press('Első kör: 20:00, módosítás');
  expect(screen.getByRole('header', { name: 'Első kör' })).toBeOnTheScreen();
  await pickTime('22', '30');
  await press('Gyakoriság: 60 perc, módosítás');
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: '90' })));
  expect(screen.getByText('7 kör éjszakánként · utolsó 07:30-kor')).toBeOnTheScreen();

  await press('Menetrend mentése');

  expect(screen).toHavePathname(`/sites/${SITE}`);
  expect(screen.getByText('A menetrend elmentve')).toBeOnTheScreen();
  expect(screen.getByText('H–Szo · 22:30–08:00 90 percenként · 30 perc')).toBeOnTheScreen();
  expect(queued()).toEqual([
    {
      call: `PATCH /schedules/${NIGHT}`,
      body: { weekdays: 63, interval_from: '22:30', interval_to: '08:00', interval_every_min: 90, time_limit_min: 30 },
    },
  ]);
});

it('a list: starts from the window’s times, a time added in its place, never twice, one removed', async () => {
  addNightly({ interval_from: '22:00', interval_to: '02:00', interval_every_min: 120 });
  await openFromSite();
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Lista' })));
  expect(screen.getByRole('button', { name: '22:00, módosítás vagy törlés' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '02:00, módosítás vagy törlés' })).toBeOnTheScreen();

  await press('Időpont hozzáadása');
  await pickTime('01', '00');
  await press('Időpont hozzáadása');
  await pickTime('22', '00');
  expect(screen.getByText('Ez az időpont már szerepel a listán.')).toBeOnTheScreen();

  await press('00:00, módosítás vagy törlés');
  await press('Időpont törlése');
  expect(screen.queryByRole('button', { name: '00:00, módosítás vagy törlés' })).toBeNull();
  expect(screen.getByText('3 kör éjszakánként · utolsó 02:00-kor')).toBeOnTheScreen();

  await press('Menetrend mentése');
  expect(queued()).toEqual([{ call: `PATCH /schedules/${NIGHT}`, body: { mode: 'list', start_times: ['22:00', '01:00', '02:00'] } }]);
  expect(db.select().from(schedules).get()).toEqual(
    expect.objectContaining({ mode: 'list', start_times: ['22:00', '01:00', '02:00'], interval_from: null, interval_every_min: null }),
  );
});

it('no time limit, and the schedule turned off', async () => {
  addNightly();
  await openFromSite();
  await act(async () => fireEvent(screen.getByRole('switch', { name: 'Nincs időkorlát' }), 'valueChange', true));
  expect(screen.getAllByText('Nincs időkorlát').length).toBeGreaterThan(1);
  expect(screen.getByRole('button', { name: '5 perccel több' })).toBeDisabled();
  expect(screen.getByText('A körök és az ébresztések e szerint mennek.')).toBeOnTheScreen();
  await act(async () => fireEvent(screen.getByRole('switch', { name: 'Menetrend bekapcsolva' }), 'valueChange', false));
  expect(screen.getByText(/Kikapcsolva nincs kör és ébresztés/)).toBeOnTheScreen();

  await press('Menetrend mentése');
  expect(queued()).toEqual([{ call: `PATCH /schedules/${NIGHT}`, body: { time_limit_min: null, active: false } }]);
});

it('a route without a schedule gets one at the save, with the default limit without a measured walk', async () => {
  db.update(routeVersions).set({ walk_duration_s: null }).where(eq(routeVersions.id, VERSION)).run();
  await openFromSite();
  expect(screen.getByText('Nincs mérés – alapérték 20 perc.')).toBeOnTheScreen();
  expect(screen.getByText('20 perc')).toBeOnTheScreen();
  expect(dayStates()).toEqual([true, true, true, true, true, true, true]);
  expect(screen.getByRole('button', { name: 'Menetrend mentése' })).toBeEnabled();

  await press('Menetrend mentése');
  expect(queued()).toEqual([
    {
      call: 'POST /schedules',
      body: expect.objectContaining({
        route_id: ROUTE,
        name: 'Éjszakai kör',
        weekdays: 127,
        mode: 'interval',
        interval_from: '20:00',
        interval_to: '08:00',
        interval_every_min: 60,
        time_limit_min: 20,
        active: true,
      }),
    },
  ]);
  expect(screen.getByText('Minden nap · 20:00–08:00 óránként · 20 perc')).toBeOnTheScreen();
});

it('no day cannot be saved', async () => {
  addNightly({ weekdays: 1 });
  await openFromSite();
  await act(async () => fireEvent.press(screen.getByRole('togglebutton', { name: 'Hétfő' })));
  await press('Menetrend mentése');
  expect(screen.getByText('Jelölj ki legalább egy napot.')).toBeOnTheScreen();
  expect(screen).toHavePathname(schedulePath);
  expect(queued()).toEqual([]);
});

it('leaving with changes asks first', async () => {
  addNightly();
  await openFromSite();
  await act(async () => fireEvent.press(screen.getByRole('togglebutton', { name: 'Vasárnap' })));
  await press('Vissza');
  expect(Alert.alert).toHaveBeenCalledWith('Elveted a módosításokat?', expect.any(String), expect.any(Array));
  expect(screen).toHavePathname(schedulePath);
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as AlertButton[];
  await act(async () => buttons.find((b) => b.text === 'Elvetés')!.onPress!());
  expect(screen).toHavePathname(`/sites/${SITE}`);
  expect(queued()).toEqual([]);
});

it('a site with more routes asks whose schedule; more schedules of a route are told', async () => {
  addNightly();
  db.insert(schedules)
    .values({
      id: '019a2b3c-4d5e-7f00-8a00-0000000000e2',
      route_id: ROUTE,
      name: 'Hétvége',
      weekdays: 96,
      mode: 'list',
      start_times: ['12:00'],
      time_limit_min: null,
      active: false,
      created_at: AT,
      updated_at: AT,
    })
    .run();
  addRoute(DAY_ROUTE, 'Nappali kör', null);
  await openFromSite();
  expect(screen.getByRole('header', { name: 'Melyik útvonal menetrendje?' })).toBeOnTheScreen();
  const nappali = screen.getByRole('button', { name: /^Nappali kör/ });
  expect(within(nappali).getByText('Nincs menetrend')).toBeOnTheScreen();
  // The route's row on the choice, with its schedule (the site's own row has its points).
  await press(/^Éjszakai kör H–P/);
  expect(screen).toHavePathname(schedulePath);
  expect(screen.getByText(/Ennek az útvonalnak 2 menetrendje van/)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Első kör: 20:00, módosítás' })).toBeOnTheScreen();
});
