import type { Database } from '@/db/database';
import {
  devices,
  reportSubscriptions,
  routes,
  routeVersionCheckpoints,
  routeVersions,
  schedules,
  sites,
  siteUser,
  users,
} from '@/db/schema';
import { createTestDatabase } from '@/db/testing';

import {
  formatWalk,
  guardsSummary,
  loadSiteDetail,
  reportsSummary,
  routeSummary,
  schedulesSummary,
  supervisorsSummary,
  type SiteRoute,
  type SiteSchedule,
} from './site-detail';

const AT = '2026-10-27T10:05:12.345Z';
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const OTHER_SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a2';
const ME = '019a2b3c-4d5e-7f00-8a00-000000000002';

let db: Database;
let nextId = 0;
const id = () => `019a2b3c-4d5e-7f00-8b00-${String((nextId += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  ({ db } = await createTestDatabase());
});

function site(siteId: string) {
  db.insert(sites)
    .values({
      id: siteId,
      name: 'Raktár',
      timezone: 'Europe/Budapest',
      no_data_alert_after_min: 120,
      created_by: ME,
      created_at: AT,
      updated_at: AT,
    })
    .run();
}

function user(name: string, role: 'supervisor' | 'guard', siteIds: string[], active = true, userId = id()) {
  db.insert(users).values({ id: userId, name, role, active, created_at: AT, updated_at: AT }).run();
  for (const siteId of siteIds) db.insert(siteUser).values({ site_id: siteId, user_id: userId }).run();
  return userId;
}

function route(siteId: string, name: string, version: { number: number; points: number; walk: number | null } | null, active = true) {
  const routeId = id();
  const versionId = version === null ? null : id();
  db.insert(routes)
    .values({
      id: routeId,
      site_id: siteId,
      name,
      order_mode: 'fixed',
      current_version_id: versionId,
      active,
      created_at: AT,
      updated_at: AT,
    })
    .run();
  if (version !== null && versionId !== null) {
    db.insert(routeVersions)
      .values({ id: versionId, route_id: routeId, version: version.number, walk_duration_s: version.walk, created_by: ME, created_at: AT })
      .run();
    for (let position = 1; position <= version.points; position += 1) {
      db.insert(routeVersionCheckpoints).values({ route_version_id: versionId, checkpoint_id: id(), position }).run();
    }
  }
  return routeId;
}

function schedule(routeId: string, name: string, active = true) {
  db.insert(schedules)
    .values({
      id: id(),
      route_id: routeId,
      name,
      weekdays: 31,
      mode: 'interval',
      interval_from: '20:00',
      interval_to: '08:00',
      interval_every_min: 60,
      time_limit_min: 25,
      active,
      created_at: AT,
      updated_at: AT,
    })
    .run();
}

describe('loadSiteDetail', () => {
  it("brings the site's people, routes, schedules, reports and phone", () => {
    site(SITE);
    site(OTHER_SITE);
    user('Szabó Dávid', 'supervisor', [SITE]);
    user('Kovács Anna', 'supervisor', [SITE, OTHER_SITE], true, ME);
    user('Tóth Eszter', 'guard', [SITE]);
    user('Nagy Péter', 'guard', [SITE]);
    user('Kiss Gábor', 'guard', [SITE], false);
    user('Fehér Ida', 'guard', [OTHER_SITE]);
    const night = route(SITE, 'Éjszakai kör', { number: 4, points: 3, walk: 980 });
    route(SITE, 'Régi kör', { number: 1, points: 2, walk: null }, false);
    route(SITE, 'Hétvégi kör', null);
    schedule(night, 'Hétköznap');
    schedule(route(OTHER_SITE, 'Másik', null), 'Másik menetrend');
    db.insert(reportSubscriptions).values({ id: id(), user_id: ME, site_id: SITE, frequency: 'weekly' }).run();
    db.insert(reportSubscriptions).values({ id: id(), user_id: ME, site_id: SITE, frequency: 'shift' }).run();
    db.insert(reportSubscriptions).values({ id: id(), user_id: ME, site_id: OTHER_SITE, frequency: 'daily' }).run();
    db.insert(devices)
      .values({ id: id(), site_id: SITE, name: 'Porta', platform: 'android', app_version: '0.1.0', enrolled_by: ME, enrolled_at: AT })
      .run();

    const detail = loadSiteDetail(db, SITE, ME);

    expect(detail).toMatchObject({
      id: SITE,
      name: 'Raktár',
      timezone: 'Europe/Budapest',
      supervisors: ['Kovács Anna', 'Szabó Dávid'],
      guards: ['Nagy Péter', 'Tóth Eszter'],
      reports: ['shift', 'weekly'],
      phone: { name: 'Porta', platform: 'android', app_version: '0.1.0', enrolled_at: AT },
    });
    expect(detail?.routes).toEqual([
      expect.objectContaining({ name: 'Éjszakai kör', active: true, version: { number: 4, points: 3, walk_duration_s: 980 } }),
      expect.objectContaining({ name: 'Hétvégi kör', active: true, version: null }),
      expect.objectContaining({ name: 'Régi kör', active: false, version: { number: 1, points: 2, walk_duration_s: null } }),
    ]);
    expect(detail?.schedules).toEqual([expect.objectContaining({ name: 'Hétköznap', route_id: night, interval_every_min: 60 })]);
  });

  it('has no reports without an account, and nothing for a site the phone does not have', () => {
    site(SITE);
    expect(loadSiteDetail(db, SITE, null)).toMatchObject({
      routes: [],
      schedules: [],
      reports: [],
      phone: null,
      supervisors: [],
      guards: [],
    });
    expect(loadSiteDetail(db, OTHER_SITE, ME)).toBeNull();
  });
});

describe('in words', () => {
  it('formats the walk', () => {
    expect(formatWalk(980)).toBe('16:20');
    expect(formatWalk(59)).toBe('0:59');
    expect(formatWalk(3725)).toBe('1:02:05');
  });

  it('summarises a route', () => {
    const base: SiteRoute = {
      id: 'r',
      name: 'Kör',
      active: true,
      order_mode: 'free',
      version: { number: 4, points: 9, walk_duration_s: 980 },
    };
    expect(routeSummary(base)).toBe('9 pont · szabad sorrend · v4 · bejárás 16:20');
    expect(routeSummary({ ...base, order_mode: 'fixed', version: { number: 2, points: 7, walk_duration_s: null } })).toBe(
      '7 pont · kötött sorrend · v2',
    );
    expect(routeSummary({ ...base, version: null })).toBe('Még nincs betanítva · szabad sorrend');
    expect(routeSummary({ ...base, active: false })).toBe('9 pont · szabad sorrend · v4 · bejárás 16:20 · kikapcsolva');
  });

  it('summarises the schedules', () => {
    const one: SiteSchedule = {
      id: 's',
      name: 'Hétköznap',
      route_id: 'r',
      active: true,
      weekdays: 31,
      mode: 'interval',
      start_times: null,
      interval_from: '20:00',
      interval_to: '08:00',
      interval_every_min: 60,
      time_limit_min: 25,
    };
    expect(schedulesSummary([one])).toBe('H–P · 20:00–08:00 óránként · 25 perc');
    expect(schedulesSummary([one, { ...one, id: 't' }])).toBe('2 menetrend');
    expect(schedulesSummary([one, { ...one, id: 't', active: false }])).toBe('H–P · 20:00–08:00 óránként · 25 perc');
    expect(schedulesSummary([{ ...one, active: false }])).toBe('1 menetrend, mind kikapcsolva');
    expect(schedulesSummary([])).toBe('Nincs menetrend');
  });

  it('summarises the people and the reports', () => {
    expect(guardsSummary(['Nagy Péter', 'Kiss Gábor'])).toBe('2 őr · Nagy Péter, Kiss Gábor');
    expect(guardsSummary([])).toBe('Még nincs őr');
    expect(supervisorsSummary(['Kovács Anna', 'Szabó Dávid'])).toBe('2 supervisor · Kovács Anna, Szabó Dávid');
    expect(supervisorsSummary([])).toBeUndefined();
    expect(reportsSummary(['shift', 'weekly'], 'kovacs.anna@pelda.hu')).toBe('Műszak és heti · kovacs.anna@pelda.hu');
    expect(reportsSummary(['daily', 'weekly', 'monthly'], null)).toBe('Napi, heti és havi');
    expect(reportsSummary([], null)).toBe('Nincs feliratkozás');
  });
});
