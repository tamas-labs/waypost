import { eq } from 'drizzle-orm';

import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { outbox, routes, routeVersions, schedules } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { ScheduleEditError, beginScheduleEdit, setScheduleMode, stepTimeLimit, toggleDay } from '@/domain/schedule-edit';

import { loadScheduleEditBase, saveScheduleEdit } from './schedule-edit';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const AT = '2026-10-27T10:05:12.345Z';
const LATER = '2026-10-28T09:00:00.000Z';
const ME = '019a2b3c-4d5e-7f00-8a00-000000000002';
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const ROUTE = '019a2b3c-4d5e-7f00-8a00-0000000000b1';
const VERSION = '019a2b3c-4d5e-7f00-8a00-0000000000d1';
const NIGHT = '019a2b3c-4d5e-7f00-8a00-0000000000e1';
const DAY = '019a2b3c-4d5e-7f00-8a00-0000000000e2';
const NEW_ID = '019a2b3c-4d5e-7f00-8a00-0000000000e9';

let db: Database;

beforeEach(async () => {
  useSession.setState({ mode: 'supervisor_phone', activeUser: null, deviceId: null, shiftStart: null });
  ({ db } = await createTestDatabase());
  db.insert(routes)
    .values({
      id: ROUTE,
      site_id: SITE,
      name: 'Éjszakai kör',
      order_mode: 'free',
      current_version_id: VERSION,
      active: true,
      created_at: AT,
      updated_at: AT,
    })
    .run();
  db.insert(routeVersions).values({ id: VERSION, route_id: ROUTE, version: 4, walk_duration_s: 980, created_by: ME, created_at: AT }).run();
});

function addSchedule(id: string, values: Partial<typeof schedules.$inferInsert> = {}) {
  db.insert(schedules)
    .values({
      id,
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

const queued = () =>
  db.select({ method: outbox.method, path: outbox.path, body: outbox.body, record_ids: outbox.record_ids }).from(outbox).all();

describe('loading', () => {
  test('the route with its measured walk and its schedule', () => {
    addSchedule(NIGHT);
    expect(loadScheduleEditBase(db, ROUTE)).toEqual({
      route: { id: ROUTE, name: 'Éjszakai kör' },
      walk_duration_s: 980,
      schedule: {
        id: NIGHT,
        name: 'Éjszaka',
        weekdays: 31,
        mode: 'interval',
        start_times: null,
        interval_from: '20:00',
        interval_to: '08:00',
        interval_every_min: 60,
        time_limit_min: 25,
        active: true,
      },
      schedule_count: 1,
    });
  });

  test('of more schedules the active one first, then the oldest', () => {
    addSchedule(DAY, { active: false, created_at: '2026-10-01T00:00:00.000Z' });
    addSchedule(NIGHT, { mode: 'list', start_times: ['22:00', '02:00'], interval_from: null, interval_to: null, interval_every_min: null });
    const base = loadScheduleEditBase(db, ROUTE);
    expect(base?.schedule).toEqual(expect.objectContaining({ id: NIGHT, mode: 'list', start_times: ['22:00', '02:00'] }));
    expect(base?.schedule_count).toBe(2);
  });

  test('a route not trained yet has no walk and no schedule; no route is null', () => {
    db.update(routes).set({ current_version_id: null }).where(eq(routes.id, ROUTE)).run();
    expect(loadScheduleEditBase(db, ROUTE)).toEqual({
      route: { id: ROUTE, name: 'Éjszakai kör' },
      walk_duration_s: null,
      schedule: null,
      schedule_count: 0,
    });
    expect(loadScheduleEditBase(db, '019a2b3c-4d5e-7f00-8a00-0000000000b9')).toBeNull();
  });
});

describe('saving', () => {
  test('a new schedule: the local record at once, its create through the outbox', () => {
    const edit = beginScheduleEdit(loadScheduleEditBase(db, ROUTE)!);
    expect(saveScheduleEdit(db, edit, LATER, () => NEW_ID)).toBe(NEW_ID);
    expect(db.select().from(schedules).all()).toEqual([
      {
        id: NEW_ID,
        route_id: ROUTE,
        name: 'Éjszakai kör',
        weekdays: 127,
        mode: 'interval',
        start_times: null,
        interval_from: '20:00',
        interval_to: '08:00',
        interval_every_min: 60,
        time_limit_min: 25,
        active: true,
        created_at: LATER,
        updated_at: LATER,
      },
    ]);
    expect(queued()).toEqual([
      {
        method: 'POST',
        path: '/schedules',
        body: {
          id: NEW_ID,
          route_id: ROUTE,
          name: 'Éjszakai kör',
          weekdays: 127,
          mode: 'interval',
          interval_from: '20:00',
          interval_to: '08:00',
          interval_every_min: 60,
          time_limit_min: 25,
          active: true,
        },
        record_ids: [NEW_ID],
      },
    ]);
  });

  test('a changed one: what changed goes to the server, the local record clears the other mode', () => {
    addSchedule(NIGHT);
    let edit = beginScheduleEdit(loadScheduleEditBase(db, ROUTE)!);
    edit = stepTimeLimit(toggleDay(setScheduleMode(edit, 'list'), 6), 1);
    expect(saveScheduleEdit(db, edit, LATER)).toBe(NIGHT);
    const times = ['20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00'];
    expect(db.select().from(schedules).get()).toEqual(
      expect.objectContaining({
        weekdays: 95,
        mode: 'list',
        start_times: times,
        interval_from: null,
        interval_to: null,
        interval_every_min: null,
        time_limit_min: 30,
        updated_at: LATER,
      }),
    );
    expect(queued()).toEqual([
      {
        method: 'PATCH',
        path: `/schedules/${NIGHT}`,
        body: { weekdays: 95, mode: 'list', start_times: times, time_limit_min: 30 },
        record_ids: [NIGHT],
      },
    ]);
  });

  test('nothing changed, or no day: nothing is saved', () => {
    addSchedule(NIGHT);
    const edit = beginScheduleEdit(loadScheduleEditBase(db, ROUTE)!);
    expect(() => saveScheduleEdit(db, edit)).toThrow(ScheduleEditError);
    let none = edit;
    for (const day of [0, 1, 2, 3, 4]) none = toggleDay(none, day);
    expect(() => saveScheduleEdit(db, none)).toThrow(ScheduleEditError);
    expect(queued()).toEqual([]);
    expect(db.select().from(schedules).get()?.updated_at).toBe(AT);
  });
});
