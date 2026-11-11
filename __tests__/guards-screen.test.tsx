import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';

import SupervisorLayout from '@/app/(supervisor)/_layout';
import SiteScreen from '@/app/(supervisor)/sites/[id]';
import GuardsScreen from '@/app/(supervisor)/sites/[id]/guards';
import { newPinVerifier, pinHash } from '@/auth/pin';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { getKv, setKv, type OutboxRejection } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { outbox, sites, siteUser, users } from '@/db/schema';
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
  '(supervisor)/sites/[id]/guards': GuardsScreen,
};

const AT = '2026-10-27T10:05:12.345Z';
const ME = { id: '019a2b3c-4d5e-7f00-8a00-000000000002', name: 'Kovács Anna', email: 'kovacs.anna@example.com' };
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const OTHER_SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a2';
const PETER = '019a2b3c-4d5e-7f00-8a00-000000000011';
const ESZTER = '019a2b3c-4d5e-7f00-8a00-000000000013';
const ZOLTAN = '019a2b3c-4d5e-7f00-8a00-000000000014';
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
  for (const [id, name] of [
    [SITE, 'Raktár'],
    [OTHER_SITE, 'Iroda'],
  ] as const) {
    db.insert(sites)
      .values({ id, name, timezone: 'Europe/Budapest', no_data_alert_after_min: 120, created_by: ME.id, created_at: AT, updated_at: AT })
      .run();
  }
});

async function addUser(
  id: string,
  name: string,
  siteIds: string[],
  values: { role?: 'guard' | 'supervisor'; active?: boolean; pin?: string } = {},
) {
  const verifier = values.pin === undefined ? { pin_hash: null, pin_salt: null, pin_iterations: null } : await newPinVerifier(values.pin);
  db.insert(users)
    .values({ id, name, role: values.role ?? 'guard', ...verifier, active: values.active ?? true, created_at: AT, updated_at: AT })
    .run();
  for (const site_id of siteIds) db.insert(siteUser).values({ site_id, user_id: id }).run();
}

/** Waits for a PIN drawn or saved: the hashing (PBKDF2) runs outside the press. */
const settled = () => waitFor(() => expect(screen.queryByText(/^(PIN-kód generálása…|Mentés…)$/)).toBeNull(), { timeout: 15_000 });

const press = async (name: string | RegExp) => {
  await act(async () => fireEvent.press(screen.getByRole('button', { name })));
  await settled();
};

const queued = () =>
  db
    .select({ method: outbox.method, path: outbox.path, body: outbox.body })
    .from(outbox)
    .all()
    .map((call) => ({ call: `${call.method} ${call.path}`, body: call.body }));

/** The PIN on the screen, as "731 905" → "731905". */
const shownPin = () => screen.getByText(/^\d{3} \d{3}$/).props.children.replace(' ', '') as string;

const verifies = async (userId: string, pin: string) => {
  const user = db.select().from(users).where(eq(users.id, userId)).get()!;
  return user.pin_hash === (await pinHash(pin, user.pin_salt!, user.pin_iterations!));
};

/** Answers the open confirmation with the button of this text. */
async function answerAlert(text: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as AlertButton[];
  await act(async () => buttons.find((button) => button.text === text)?.onPress?.());
}

it('opens from the site with the guards, active first, and the supervisor’s own PIN', async () => {
  await addUser(PETER, 'Nagy Péter', [SITE]);
  await addUser(ESZTER, 'Tóth Eszter', [SITE], { active: false });
  await addUser(ME.id, ME.name, [SITE], { role: 'supervisor' });
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}` });
  await press(/Őrök és PIN-kódok/);

  expect(screen).toHavePathname(`/sites/${SITE}/guards`);
  expect(screen.getByText('Raktár')).toBeOnTheScreen();
  expect(screen.getByText('Nagy Péter')).toBeOnTheScreen();
  expect(screen.getByText('Beléphet')).toBeOnTheScreen();
  expect(screen.getByText('Felfüggesztve · nem tud belépni')).toBeOnTheScreen();
  expect(screen.getByRole('switch', { name: 'Tóth Eszter beléphet' })).toBeOnTheScreen();
  expect(screen.getByText('Saját PIN-kód')).toBeOnTheScreen();
  expect(screen.getByText('Kovács Anna')).toBeOnTheScreen();
  // No other site with guards: nobody to assign.
  expect(screen.queryByRole('button', { name: 'Meglévő őr hozzáadása' })).toBeNull();
});

it('a new guard: the name, the PIN shown once, another one drawn, saved with “Kész”', async () => {
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/guards` });
  expect(screen.getByText('Még nincs őr ezen a telephelyen.')).toBeOnTheScreen();

  await press('Új őr');
  await press('Tovább');
  expect(screen.getByText('Add meg az őr nevét.')).toBeOnTheScreen();
  await act(async () => fireEvent.changeText(screen.getByLabelText(/Az őr neve/), '  Kiss Gábor '));
  await press('Tovább');
  expect(screen.getByText('Új PIN-kód – csak most látható')).toBeOnTheScreen();
  expect(screen.getByText('Add át személyesen. Ezzel léphet be a telephelyi telefonon.')).toBeOnTheScreen();
  const first = shownPin();
  expect(screen.getByLabelText(`Kiss Gábor új PIN-kódja: ${[...first].join(' ')}`)).toBeOnTheScreen();
  // Nothing is saved until "Kész".
  expect(queued()).toEqual([]);

  await press('Újat generál');
  const pin = shownPin();
  await press('Kész');

  expect(await screen.findByText('Kiss Gábor felvéve')).toBeOnTheScreen();
  expect(screen.getByText('Kiss Gábor')).toBeOnTheScreen();
  const created = db.select().from(users).get()!;
  expect(queued()).toEqual([
    { call: 'POST /users', body: { id: created.id, name: 'Kiss Gábor', role: 'guard', pin, active: true, site_ids: [SITE] } },
  ]);
  expect(await verifies(created.id, pin)).toBe(true);
});

it('a new supervisor: the name, the login checked, the PIN shown once, saved with “Kész”; listed among the supervisors', async () => {
  await addUser(ME.id, ME.name, [SITE], { role: 'supervisor' });
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/guards` });

  await press('Új supervisor');
  await press('Tovább');
  expect(screen.getByText('Add meg a supervisor nevét.')).toBeOnTheScreen();
  expect(screen.getByText('Adj meg egy érvényes e-mail-címet.')).toBeOnTheScreen();
  expect(screen.getByText('A jelszó legalább 8 karakter legyen.')).toBeOnTheScreen();

  await act(async () => fireEvent.changeText(screen.getByLabelText(/A supervisor neve/), 'Balogh Béla'));
  await act(async () => fireEvent.changeText(screen.getByLabelText(/E-mail-cím/), ' balogh.bela@example.com '));
  await act(async () => fireEvent.changeText(screen.getByLabelText(/^Jelszó, /), 'jelszo-1234'));
  await press('Tovább');
  expect(
    screen.getByText('Add át személyesen. Ezzel léphet be a telephelyi telefonon; a saját telefonján az e-mail-címével és a jelszavával.'),
  ).toBeOnTheScreen();
  const pin = shownPin();
  expect(queued()).toEqual([]);
  await press('Kész');

  expect(await screen.findByText('Balogh Béla felvéve')).toBeOnTheScreen();
  expect(screen.getByText('Supervisorok a telephelyen')).toBeOnTheScreen();
  const created = db.select().from(users).where(eq(users.name, 'Balogh Béla')).get()!;
  expect(created.role).toBe('supervisor');
  expect(queued()).toEqual([
    {
      call: 'POST /users',
      body: {
        id: created.id,
        name: 'Balogh Béla',
        role: 'supervisor',
        email: 'balogh.bela@example.com',
        pin,
        active: true,
        site_ids: [SITE],
      },
    },
  ]);
  expect(await verifies(created.id, pin)).toBe(true);
});

it('another supervisor suspended, and a supervisor of another site assigned here', async () => {
  const BELA = '019a2b3c-4d5e-7f00-8a00-000000000031';
  const DORA = '019a2b3c-4d5e-7f00-8a00-000000000033';
  await addUser(ME.id, ME.name, [SITE, OTHER_SITE], { role: 'supervisor' });
  await addUser(BELA, 'Balogh Béla', [SITE], { role: 'supervisor' });
  await addUser(DORA, 'Fehér Dóra', [OTHER_SITE], { role: 'supervisor' });
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/guards` });

  await press(/Balogh Béla/);
  await press('Felfüggesztés');
  await answerAlert('Felfüggesztés');
  expect(screen.getByRole('switch', { name: 'Balogh Béla beléphet' })).toBeOnTheScreen();

  await press('Meglévő őr vagy supervisor hozzáadása');
  expect(screen.getByText('Ki dolgozik ezen a telephelyen is?')).toBeOnTheScreen();
  expect(within(screen.getByRole('button', { name: /Fehér Dóra/ })).getByText('Supervisor')).toBeOnTheScreen();
  await press(/Fehér Dóra/);
  const pin = shownPin();
  await press('Kész');
  expect(await screen.findByText('Fehér Dóra hozzáadva a telephelyhez')).toBeOnTheScreen();
  expect(queued()).toEqual([
    { call: `PATCH /users/${BELA}`, body: { active: false } },
    { call: `POST /sites/${SITE}/users`, body: { user_id: DORA, pin } },
  ]);
});

it('a new guard cancelled: nothing saved', async () => {
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/guards` });
  await press('Új őr');
  await act(async () => fireEvent.changeText(screen.getByLabelText(/Az őr neve/), 'Kiss Gábor'));
  await press('Tovább');
  expect(screen.getAllByRole('button', { name: 'Mégse' }).length).toBeGreaterThan(0);
  await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Mégse' }).at(-1)!));
  expect(screen.queryByText('Új PIN-kód – csak most látható')).toBeNull();
  expect(queued()).toEqual([]);
  expect(db.select().from(users).all()).toEqual([]);
});

it('on the site phone: who has a PIN, a new PIN for a guard working at once, the old one not', async () => {
  setKv(db, 'device.id', DEVICE);
  useSession.setState({ mode: 'site_phone', deviceId: DEVICE, activeUser: { id: ME.id, role: 'supervisor' } });
  await addUser(PETER, 'Nagy Péter', [SITE], { pin: '482913' });
  await addUser(ZOLTAN, 'Szabó Zoltán', [SITE]);
  await addUser(ME.id, ME.name, [SITE], { role: 'supervisor', pin: '264810' });
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/guards` });

  expect(screen.getByText('PIN beállítva')).toBeOnTheScreen();
  expect(screen.getByText('Nincs PIN-kód')).toBeOnTheScreen();
  expect(screen.getByText('Kovács Anna · beállítva')).toBeOnTheScreen();

  await press(/Nagy Péter/);
  expect(screen.getByRole('button', { name: /Nagy Péter/ })).toBeExpanded();
  await press('Új PIN-kód');
  expect(await screen.findByText('Add át személyesen. A régi PIN már nem érvényes.')).toBeOnTheScreen();
  const pin = shownPin();
  expect(pin).not.toBe('482913');
  await press('Kész');

  expect(await screen.findByText('Az új PIN-kód beállítva')).toBeOnTheScreen();
  expect(queued()).toEqual([{ call: `PUT /users/${PETER}/pin`, body: { pin } }]);
  expect(await verifies(PETER, pin)).toBe(true);
  expect(await verifies(PETER, '482913')).toBe(false);
});

it('the supervisor’s own PIN', async () => {
  setKv(db, 'device.id', DEVICE);
  useSession.setState({ mode: 'site_phone', deviceId: DEVICE, activeUser: { id: ME.id, role: 'supervisor' } });
  await addUser(ME.id, ME.name, [SITE], { role: 'supervisor' });
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/guards` });
  expect(screen.getByText('Kovács Anna · nincs beállítva')).toBeOnTheScreen();

  await press('Módosítás');
  expect(await screen.findByText('Ezzel lépsz be supervisorként a telephelyi telefonon. A régi PIN már nem érvényes.')).toBeOnTheScreen();
  const pin = shownPin();
  await press('Kész');
  expect(await screen.findByText('Kovács Anna · beállítva')).toBeOnTheScreen();
  expect(queued()).toEqual([{ call: `PUT /users/${ME.id}/pin`, body: { pin } }]);
});

it('a guard suspended after the confirmation, and let in again with the switch', async () => {
  await addUser(PETER, 'Nagy Péter', [SITE]);
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/guards` });
  await press(/Nagy Péter/);
  await press('Felfüggesztés');
  expect(Alert.alert).toHaveBeenCalledWith('Felfüggeszted Nagy Péter belépését?', expect.any(String), expect.any(Array));
  await answerAlert('Felfüggesztés');

  expect(screen.getByText('Felfüggesztve · nem tud belépni')).toBeOnTheScreen();
  await act(async () => fireEvent(screen.getByRole('switch', { name: 'Nagy Péter beléphet' }), 'valueChange', true));
  expect(screen.getByText('Beléphet')).toBeOnTheScreen();
  expect(queued()).toEqual([
    { call: `PATCH /users/${PETER}`, body: { active: false } },
    { call: `PATCH /users/${PETER}`, body: { active: true } },
  ]);
});

it('a guard of another site assigned here with a new PIN', async () => {
  await addUser(ZOLTAN, 'Szabó Zoltán', [OTHER_SITE]);
  await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/guards` });
  await press('Meglévő őr hozzáadása');
  expect(screen.getByText('Melyik őr dolgozik ezen a telephelyen is?')).toBeOnTheScreen();
  await press(/Szabó Zoltán/);
  expect(screen.getByText('Add át személyesen. Ez az összes telephelyén az új PIN-kódja, a régi már nem érvényes.')).toBeOnTheScreen();
  const pin = shownPin();
  await press('Kész');

  expect(await screen.findByText('Szabó Zoltán hozzáadva a telephelyhez')).toBeOnTheScreen();
  expect(queued()).toEqual([{ call: `POST /sites/${SITE}/users`, body: { user_id: ZOLTAN, pin } }]);
  expect(screen.queryByRole('button', { name: 'Meglévő őr hozzáadása' })).toBeNull();
});

describe('a PIN the server refused as taken (409)', () => {
  const refusal = (call_id: string, method: string, path: string, record_ids: string[]): OutboxRejection => ({
    call_id,
    method,
    path,
    status: 409,
    code: 'conflict',
    message: 'Ez a PIN-kód már foglalt.',
    details: { pin: ['Egy telephelyen nem lehet két felhasználónak ugyanaz a PIN-kódja.'] },
    record_ids,
    at: AT,
  });

  /** Refused calls as the sync leaves them: stored, and in the sync status. */
  const refused = (rejections: OutboxRejection[]) => {
    setKv(db, 'outbox.rejected', rejections);
    useSyncStatus.setState({ rejectedCalls: rejections });
  };

  it('a new PIN: retried with another one, and the refusal is gone', async () => {
    await addUser(PETER, 'Nagy Péter', [SITE]);
    refused([refusal('c1', 'PUT', `/users/${PETER}/pin`, [PETER])]);
    await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/guards` });
    expect(screen.getByText('Nagy Péter: a PIN-kód foglalt volt')).toBeOnTheScreen();

    await press('Új PIN-kód generálása');
    const pin = shownPin();
    await press('Kész');
    expect(await screen.findByText('Az új PIN-kód beállítva')).toBeOnTheScreen();
    expect(queued()).toEqual([{ call: `PUT /users/${PETER}/pin`, body: { pin } }]);
    expect(getKv(db, 'outbox.rejected')).toBeNull();
    expect(screen.queryByText('Nagy Péter: a PIN-kód foglalt volt')).toBeNull();
  });

  it('a guard not created: created again; another refusal only dismissed', async () => {
    refused([
      refusal('c1', 'POST', '/users', ['019a2b3c-4d5e-7f00-8a00-000000000019']),
      refusal('c2', 'POST', `/sites/${SITE}/users`, [ZOLTAN]),
    ]);
    await renderRouter(ROUTES, { initialUrl: `/sites/${SITE}/guards` });
    expect(screen.getByText('Egy új őr nem jött létre')).toBeOnTheScreen();
    expect(screen.getByText('Egy őr: a PIN-kód foglalt volt')).toBeOnTheScreen();

    await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Rendben' }).at(-1)!));
    expect(screen.queryByText('Egy őr: a PIN-kód foglalt volt')).toBeNull();

    await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Új őr' })[0]!));
    await act(async () => fireEvent.changeText(screen.getByLabelText(/Az őr neve/), 'Kiss Gábor'));
    await press('Tovább');
    await press('Kész');
    expect(await screen.findByText('Kiss Gábor felvéve')).toBeOnTheScreen();
    expect(queued()).toEqual([expect.objectContaining({ call: 'POST /users' })]);
    expect(getKv(db, 'outbox.rejected')).toBeNull();
    expect(screen.queryByText('Egy új őr nem jött létre')).toBeNull();
  });
});
