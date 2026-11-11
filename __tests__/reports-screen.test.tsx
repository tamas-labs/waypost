import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';

import SupervisorLayout from '@/app/(supervisor)/_layout';
import SiteScreen from '@/app/(supervisor)/sites/[id]';
import ReportsScreen from '@/app/(supervisor)/sites/[id]/reports';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { setKv } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { outbox, reportSubscriptions, sites, siteUser, users } from '@/db/schema';
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
  '(supervisor)/sites/[id]/reports': ReportsScreen,
};

const AT = '2026-10-27T10:05:12.345Z';
const ME = { id: '019a2b3c-4d5e-7f00-8a00-000000000002', name: 'Kovács Anna', email: 'kovacs.anna@example.com' };
const DAVID = '019a2b3c-4d5e-7f00-8a00-000000000003';
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const SHIFT = '019a2b3c-4d5e-7f00-8a00-0000000000c1';
const DEVICE = '019a2b3c-4d5e-7f00-8a00-0000000000f1';

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
  db.insert(users)
    .values({
      id: ME.id,
      name: ME.name,
      role: 'supervisor',
      pin_hash: null,
      pin_salt: null,
      pin_iterations: null,
      active: true,
      created_at: AT,
      updated_at: AT,
    })
    .run();
  db.insert(siteUser).values({ site_id: SITE, user_id: ME.id }).run();
  db.insert(reportSubscriptions).values({ id: SHIFT, user_id: ME.id, site_id: SITE, frequency: 'shift' }).run();
});

const press = async (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const flip = async (name: string, value: boolean) => act(async () => fireEvent(screen.getByRole('switch', { name }), 'valueChange', value));
const switchOn = (name: string) => screen.getByRole('switch', { name }).props.accessibilityState.checked as boolean;

const queued = () =>
  db
    .select({ method: outbox.method, path: outbox.path, body: outbox.body, acting: outbox.acting_user_id })
    .from(outbox)
    .all()
    .map(({ method, path, body, acting }) => ({ call: `${method} ${path}`, body, acting }));

it('opens from the site with the supervisor’s reports, the alert and the retention', async () => {
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}` });
  await press(/Jelentések/);

  expect(screen).toHavePathname(`/sites/${SITE}/reports`);
  expect(screen.getByText('Címzett: kovacs.anna@example.com')).toBeOnTheScreen();
  expect(switchOn('Műszakjelentés')).toBe(true);
  expect(switchOn('Napi összesítő')).toBe(false);
  expect(screen.getByText('Hétfőn 10:00 · HTML e-mail és PDF')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Ha nem jön adat a telephelyről: 2 óra, módosítás' })).toBeOnTheScreen();
  expect(
    screen.getByText(
      /^Nyers adatok megőrzése: 31 nap\. Havi jelentésnél 62 napra nő, és a havi jelentés lemondása után még 62 napig ennyi marad\./,
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Mentés' })).toBeDisabled();
});

it('another supervisor’s monthly report keeps the data for 62 days', async () => {
  db.insert(reportSubscriptions)
    .values({ id: '019a2b3c-4d5e-7f00-8a00-0000000000c3', user_id: DAVID, site_id: SITE, frequency: 'monthly' })
    .run();
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/reports` });
  expect(switchOn('Havi összesítő')).toBe(false);
  expect(screen.getByText(/^Nyers adatok megőrzése: 62 nap, mert a telephelyről havi jelentés is megy\./)).toBeOnTheScreen();
});

it('tells how long the data stays when the supervisor turns off the monthly report', async () => {
  db.insert(reportSubscriptions)
    .values({ id: '019a2b3c-4d5e-7f00-8a00-0000000000c4', user_id: ME.id, site_id: SITE, frequency: 'monthly' })
    .run();
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/reports` });
  expect(screen.getByText(/^Nyers adatok megőrzése: 62 nap, mert/)).toBeOnTheScreen();
  await flip('Havi összesítő', false);
  expect(
    screen.getByText(/^Nyers adatok megőrzése: 31 nap\. A havi jelentés lemondása után még 62 napig a 62 napos megőrzés érvényes/),
  ).toBeOnTheScreen();
});

it('saves the reports turned on and off and the alert, through the outbox, and goes back', async () => {
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}` });
  await press(/Jelentések/);
  await flip('Műszakjelentés', false);
  await flip('Havi összesítő', true);
  expect(screen.getByText(/^Nyers adatok megőrzése: 62 nap/)).toBeOnTheScreen();

  await press(/Ha nem jön adat a telephelyről/);
  expect(screen.getByText('Figyelmeztetés ennyi idő után')).toBeOnTheScreen();
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: '4 óra' })));
  expect(screen.getByRole('button', { name: 'Ha nem jön adat a telephelyről: 4 óra, módosítás' })).toBeOnTheScreen();

  await press('Mentés');
  expect(await screen.findByText('A jelentésbeállítások elmentve')).toBeOnTheScreen();
  expect(screen).toHavePathname(`/sites/${SITE}`);
  expect(screen.getByText('Havi · kovacs.anna@example.com')).toBeOnTheScreen();
  expect(queued()).toEqual([
    {
      call: 'POST /report-subscriptions',
      body: expect.objectContaining({ user_id: ME.id, site_id: SITE, frequency: 'monthly' }),
      acting: null,
    },
    { call: `DELETE /report-subscriptions/${SHIFT}`, body: null, acting: null },
    { call: `PATCH /sites/${SITE}`, body: { no_data_alert_after_min: 240 }, acting: null },
  ]);
});

it('asks before leaving with unsaved changes; turned back, nothing to save', async () => {
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}` });
  await press(/Jelentések/);
  await flip('Napi összesítő', true);
  expect(screen.getByRole('button', { name: 'Mentés' })).toBeEnabled();
  await press('Vissza');
  expect(Alert.alert).toHaveBeenCalledWith('Elveted a módosításokat?', expect.any(String), expect.any(Array), expect.anything());
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as AlertButton[];
  await act(async () => buttons.find((button) => button.style === 'cancel')?.onPress?.());
  expect(screen).toHavePathname(`/sites/${SITE}/reports`);

  await flip('Napi összesítő', false);
  expect(screen.getByRole('button', { name: 'Mentés' })).toBeDisabled();
  jest.mocked(Alert.alert).mockClear();
  await press('Vissza');
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(screen).toHavePathname(`/sites/${SITE}`);
});

it('on the site phone: the supervisor by name, the calls in their name', async () => {
  setKv(db, 'device.id', DEVICE);
  useSession.setState({ mode: 'site_phone', activeUser: { id: ME.id, role: 'supervisor' }, deviceId: DEVICE });
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}` });
  await press(/Jelentések/);
  expect(screen.getByText('Címzett: Kovács Anna')).toBeOnTheScreen();
  await flip('Napi összesítő', true);
  await press('Mentés');
  expect(queued()).toEqual([{ call: 'POST /report-subscriptions', body: expect.objectContaining({ frequency: 'daily' }), acting: ME.id }]);
});

it('a site no longer on the phone', async () => {
  await renderRouter(ROUTES, { initialUrl: '/sites/019a2b3c-4d5e-7f00-8a00-0000000000ff/reports' });
  expect(screen.getByText('Ez a telephely már nincs meg ezen a telefonon.')).toBeOnTheScreen();
});
