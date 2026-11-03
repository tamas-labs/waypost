import { eq } from 'drizzle-orm';

import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { outbox, reportSubscriptions, sites } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { setAlertAfter, setReport } from '@/domain/report-settings';

import { loadReportSettings, saveReportSettings } from './report-settings';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const AT = '2026-10-27T10:05:12.345Z';
const LATER = '2026-10-28T09:00:00.000Z';
const ME = '019a2b3c-4d5e-7f00-8a00-000000000002';
const DAVID = '019a2b3c-4d5e-7f00-8a00-000000000003';
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const OTHER_SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a2';
const SHIFT = '019a2b3c-4d5e-7f00-8a00-0000000000c1';
const WEEKLY = '019a2b3c-4d5e-7f00-8a00-0000000000c2';
const NEW_ID = '019a2b3c-4d5e-7f00-8a00-0000000000c9';

let db: Database;

beforeEach(async () => {
  useSession.setState({ mode: 'supervisor_phone', activeUser: null, deviceId: null, shiftStart: null });
  ({ db } = await createTestDatabase());
  db.insert(sites)
    .values({
      id: SITE,
      name: 'Raktár',
      timezone: 'Europe/Budapest',
      no_data_alert_after_min: 120,
      created_by: ME,
      created_at: AT,
      updated_at: AT,
    })
    .run();
  db.insert(reportSubscriptions)
    .values([
      { id: SHIFT, user_id: ME, site_id: SITE, frequency: 'shift' },
      { id: WEEKLY, user_id: ME, site_id: SITE, frequency: 'weekly' },
      { id: '019a2b3c-4d5e-7f00-8a00-0000000000c3', user_id: DAVID, site_id: SITE, frequency: 'monthly' },
      { id: '019a2b3c-4d5e-7f00-8a00-0000000000c4', user_id: ME, site_id: OTHER_SITE, frequency: 'daily' },
    ])
    .run();
});

const queued = () => db.select({ method: outbox.method, path: outbox.path, body: outbox.body }).from(outbox).all();
const subscribed = () =>
  db
    .select({ id: reportSubscriptions.id, frequency: reportSubscriptions.frequency })
    .from(reportSubscriptions)
    .where(eq(reportSubscriptions.user_id, ME))
    .all()
    .filter((row) => row.id !== '019a2b3c-4d5e-7f00-8a00-0000000000c4');

test('the supervisor’s subscriptions on the site, the others’ and the site’s alert', () => {
  expect(loadReportSettings(db, SITE, ME)).toEqual({
    site: { id: SITE, name: 'Raktár' },
    user_id: ME,
    subscriptions: { shift: SHIFT, weekly: WEEKLY },
    saved: { frequencies: ['shift', 'weekly'], alert_after_min: 120 },
    others: ['monthly'],
  });
  expect(loadReportSettings(db, OTHER_SITE, ME)).toBeNull();
});

test('the save: a subscription created, one deleted, the site’s alert changed – in one action', () => {
  const base = loadReportSettings(db, SITE, ME)!;
  const draft = setAlertAfter(setReport(setReport(base.saved, 'daily', true), 'shift', false), 240);
  saveReportSettings(db, base, draft, LATER, () => NEW_ID);

  expect(queued()).toEqual([
    { method: 'POST', path: '/report-subscriptions', body: { id: NEW_ID, user_id: ME, site_id: SITE, frequency: 'daily' } },
    { method: 'DELETE', path: `/report-subscriptions/${SHIFT}`, body: null },
    { method: 'PATCH', path: `/sites/${SITE}`, body: { no_data_alert_after_min: 240 } },
  ]);
  expect(subscribed()).toEqual(
    expect.arrayContaining([
      { id: NEW_ID, frequency: 'daily' },
      { id: WEEKLY, frequency: 'weekly' },
    ]),
  );
  expect(subscribed()).toHaveLength(2);
  expect(db.select().from(sites).where(eq(sites.id, SITE)).get()).toMatchObject({ no_data_alert_after_min: 240, updated_at: LATER });
  expect(loadReportSettings(db, SITE, ME)!.saved).toEqual({ frequencies: ['daily', 'weekly'], alert_after_min: 240 });
});

test('nothing changed, nothing queued', () => {
  const base = loadReportSettings(db, SITE, ME)!;
  saveReportSettings(db, base, setReport(setReport(base.saved, 'weekly', false), 'weekly', true));
  expect(queued()).toEqual([]);
});
