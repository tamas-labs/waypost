import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { deleteKv, setKv } from '@/db/kv';
import { devices, outbox, routes, routeVersionCheckpoints, routeVersions, sites, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';

import { checkNewSite, createSite, loadSiteList, supervisorAccount } from './sites';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const AT = '2026-10-27T10:05:12.345Z';
const ME = { id: '019a2b3c-4d5e-7f00-8a00-000000000002', name: 'Kovács Anna', email: 'kovacs.anna@example.com' };
const SITE_A = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const SITE_B = '019a2b3c-4d5e-7f00-8a00-0000000000a2';
const SITE_C = '019a2b3c-4d5e-7f00-8a00-0000000000a3';

let db: Database;

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  useSession.setState({ mode: 'supervisor_phone', deviceId: null, activeUser: null, shiftStart: null });
});

function site(id: string, name: string) {
  db.insert(sites)
    .values({
      id,
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

let nextId = 0;
const id = () => `019a2b3c-4d5e-7f00-8b00-${String((nextId += 1)).padStart(12, '0')}`;

/** A route of the site with a current version of the given number of checkpoints (null: no version yet). */
function route(siteId: string, name: string, points: number | null, active = true) {
  const routeId = id();
  const versionId = points === null ? null : id();
  db.insert(routes)
    .values({
      id: routeId,
      site_id: siteId,
      name,
      order_mode: 'free',
      current_version_id: versionId,
      active,
      created_at: AT,
      updated_at: AT,
    })
    .run();
  if (versionId === null) return;
  db.insert(routeVersions).values({ id: versionId, route_id: routeId, version: 1, created_by: ME.id, created_at: AT }).run();
  for (let position = 1; position <= (points ?? 0); position += 1) {
    db.insert(routeVersionCheckpoints).values({ route_version_id: versionId, checkpoint_id: id(), position }).run();
  }
}

function phone(siteId: string, name: string) {
  db.insert(devices)
    .values({ id: id(), site_id: siteId, name, platform: 'android', app_version: '0.1.0', enrolled_by: ME.id, enrolled_at: AT })
    .run();
}

describe('loadSiteList', () => {
  it('lists the sites by name, with their active routes, points and phone', () => {
    site(SITE_A, 'Raktár');
    site(SITE_B, 'Irodaház');
    site(SITE_C, 'Áruház');
    route(SITE_A, 'Kerítés', 12);
    route(SITE_A, 'Belső kör', 4);
    route(SITE_A, 'Régi kör', 9, false);
    route(SITE_B, 'Éjszakai kör', null);
    phone(SITE_A, 'Pixel 8');

    expect(loadSiteList(db)).toEqual([
      { id: SITE_C, name: 'Áruház', address: null, routes: [], phone: null, pending: false },
      { id: SITE_B, name: 'Irodaház', address: null, routes: [{ name: 'Éjszakai kör', points: 0 }], phone: null, pending: false },
      {
        id: SITE_A,
        name: 'Raktár',
        address: null,
        routes: [
          { name: 'Belső kör', points: 4 },
          { name: 'Kerítés', points: 12 },
        ],
        phone: { name: 'Pixel 8' },
        pending: false,
      },
    ]);
  });

  it('is empty without sites', () => {
    expect(loadSiteList(db)).toEqual([]);
  });
});

describe('supervisorAccount', () => {
  it("is the login's account on the supervisor's own phone", () => {
    expect(supervisorAccount(db, { mode: 'supervisor_phone', activeUser: null })).toBeNull();
    setKv(db, 'supervisor.account', ME);
    expect(supervisorAccount(db, { mode: 'supervisor_phone', activeUser: null })).toEqual(ME);
  });

  it('is the supervisor of the PIN on the site phone, without an e-mail address', () => {
    db.insert(users).values({ id: ME.id, name: ME.name, role: 'supervisor', active: true, created_at: AT, updated_at: AT }).run();
    expect(supervisorAccount(db, { mode: 'site_phone', activeUser: { id: ME.id, role: 'supervisor' } })).toEqual({ ...ME, email: null });
    expect(supervisorAccount(db, { mode: 'site_phone', activeUser: null })).toBeNull();
  });
});

describe('createSite', () => {
  beforeEach(() => setKv(db, 'supervisor.account', ME));

  it('stores the site at once and queues POST /sites with its id', () => {
    const siteId = createSite(db, { name: '  Logisztikai központ ', address: ' 1051 Budapest, Példa utca 1. ' }, AT);

    expect(db.select().from(sites).all()).toEqual([
      {
        id: siteId,
        name: 'Logisztikai központ',
        address: '1051 Budapest, Példa utca 1.',
        timezone: 'Europe/Budapest',
        no_data_alert_after_min: 120,
        created_by: ME.id,
        created_at: AT,
        updated_at: AT,
      },
    ]);
    expect(db.select().from(outbox).all()).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/sites',
        body: {
          id: siteId,
          name: 'Logisztikai központ',
          address: '1051 Budapest, Példa utca 1.',
          timezone: 'Europe/Budapest',
          no_data_alert_after_min: 120,
        },
        record_ids: [siteId],
        acting_user_id: null,
      }),
    ]);
    // Until the server has it, the list tells so.
    expect(loadSiteList(db)).toEqual([expect.objectContaining({ id: siteId, pending: true })]);
  });

  it('sends an empty address as none', () => {
    createSite(db, { name: 'Raktár', address: '  ' }, AT);
    expect(db.select({ address: sites.address }).from(sites).get()).toEqual({ address: null });
  });

  it('needs a name', () => {
    expect(checkNewSite({ name: ' ', address: '' })).toEqual({ name: 'missing' });
    expect(checkNewSite({ name: 'Raktár', address: '' })).toBeNull();
    expect(() => createSite(db, { name: ' ', address: '' })).toThrow('no name');
    expect(db.select().from(outbox).all()).toEqual([]);
  });

  it("is only for a supervisor's own phone whose account is known", () => {
    useSession.setState({ mode: 'site_phone', activeUser: { id: ME.id, role: 'supervisor' } });
    expect(() => createSite(db, { name: 'Raktár', address: '' })).toThrow("supervisor's own phone");

    useSession.setState({ mode: 'supervisor_phone', activeUser: null });
    deleteKv(db, 'supervisor.account');
    expect(() => createSite(db, { name: 'Raktár', address: '' })).toThrow('not known');
    expect(db.select().from(sites).all()).toEqual([]);
    expect(db.select().from(outbox).all()).toEqual([]);
  });
});
