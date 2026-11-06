/** @jest-environment node */
// The acceptance of M5 (M5-21) against a running backend: a site set up from a supervisor's own phone only – the site,
// its checkpoints by training, the route and its editing, the schedule, a guard and the supervisor's own PIN, the
// report settings – everything in airplane mode, then sent when the network is back; the phone enrolled as the site
// phone; there, as the supervisor logged in with their PIN, a guard's new PIN and a report again offline. The server's
// state is checked by the full pull of a second, empty phone. It runs only with WAYPOST_E2E_URL (skipped otherwise):
//   make e2e E2E_URL=http://localhost:8088/api/waypost/v1 [E2E_EMAIL=… E2E_PASSWORD=…]   (docs/device-test.md, L1–L8)
// It leaves a new site with its records and the enrolled phone on the server, and changes the supervisor's PIN.
import { and, eq } from 'drizzle-orm';
import http from 'node:http';

import { createApiClient, type ApiClient } from '@/api/client';
import { NetworkError } from '@/api/errors';
import { changePin as changeUserPin, createGuard, freshPin } from '@/supervisor/guards';
import { pinLogin } from '@/auth/pin';
import { logIn, useSession } from '@/auth/session';
import { enrollThisPhone, signInSupervisor } from '@/account/supervisor';
import type { Database } from '@/db/database';
import { getKv } from '@/db/kv';
import { checkpoints, outbox, reportSubscriptions, routes, routeVersionCheckpoints, schedules, sites, siteUser, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { getDeviceCredentials, getSupervisorToken } from '@/device/credentials';
import { beginRouteEdit, editPointDetails, setEditOrderMode, updateEditPoint } from '@/domain/route-edit';
import { setReport } from '@/domain/report-settings';
import { beginScheduleEdit } from '@/domain/schedule-edit';
import { addNewPoint, setRouteName, type TrainingDraft } from '@/domain/training';
import { uuidv7 } from '@/id/uuidv7';
import { loadReportSettings, saveReportSettings } from '@/supervisor/report-settings';
import { loadRouteEditBase, saveRouteEdit } from '@/supervisor/route-edit';
import { loadScheduleEditBase, saveScheduleEdit } from '@/supervisor/schedule-edit';
import { createSite } from '@/supervisor/sites';
import { beginTraining, readForTraining, saveTraining } from '@/supervisor/training';
import { outboxRejections, resetOutboxBackoff, sendOutbox } from '@/sync/outbox';
import { pullConfiguration } from '@/sync/pull';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({
  whenSyncIdle: jest.fn(() => Promise.resolve()),
  refreshPendingCount: jest.fn(),
  requestSync: jest.fn(),
}));

const URL = process.env.WAYPOST_E2E_URL;
const EMAIL = process.env.WAYPOST_E2E_EMAIL ?? 'supervisor@waypost.test';
const PASSWORD = process.env.WAYPOST_E2E_PASSWORD ?? 'password';

/**
 * A fetch over node:http: the test environment's fetch is replaced by the preset's (JSON bodies only, which is all the
 * probe sends; a refused connection or the abort is thrown as fetch throws it).
 */
const nodeFetch = ((url: string, init: RequestInit = {}) =>
  new Promise<Response>((resolve, reject) => {
    const request = http.request(url, { method: init.method ?? 'GET', headers: init.headers as Record<string, string> }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) if (typeof value === 'string') headers.set(name, value);
        resolve(new Response(Buffer.concat(chunks).toString('utf8'), { status: response.statusCode ?? 0, headers }));
      });
      response.on('error', reject);
    });
    request.on('error', reject);
    init.signal?.addEventListener('abort', () => request.destroy(new Error('aborted')));
    if (typeof init.body === 'string') request.write(init.body);
    request.end();
  })) as unknown as typeof fetch;
/** Airplane mode: nothing listens on port 9. */
const OFFLINE_URL = 'http://127.0.0.1:9/api/waypost/v1';

const run = URL === undefined ? describe.skip : describe;

/** The pull holds back the changes of the last 5 s (laravel-waypost Pull::SETTLE_MS): a later pull waits them out. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 6_000));

run('M5 acceptance against the backend', () => {
  jest.setTimeout(180_000);

  let api: ApiClient;
  let offline: ApiClient;
  let db: Database;
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const tag = (n: number) => `04:e2:${Date.now().toString(16).slice(-8).match(/../g)!.join(':')}:${String(n).padStart(2, '0')}`;
  const pending = () => db.select({ id: outbox.id }).from(outbox).all().length;

  /** Airplane mode: the sync fails with a network error, the calls stay and wait. */
  async function syncOffline(token: string) {
    const before = pending();
    await expect(sendOutbox({ db, api: offline, token })).rejects.toBeInstanceOf(NetworkError);
    expect(pending()).toBe(before);
  }

  /** The network is back: everything goes out in order, nothing is refused, then the pull. */
  async function syncOnline(token: string) {
    resetOutboxBackoff(db);
    await sendOutbox({ db, api, token });
    expect(outboxRejections(db)).toEqual([]);
    expect(pending()).toBe(0);
    await pullConfiguration(db, api, token);
  }

  beforeAll(async () => {
    api = createApiClient({ baseUrl: URL!, fetch: nodeFetch, validate: true });
    offline = createApiClient({ baseUrl: OFFLINE_URL, fetch: nodeFetch, validate: true, timeoutMs: 2_000 });
    ({ db } = await createTestDatabase());
    useSession.setState({ mode: 'unassigned', activeUser: null, deviceId: null, shiftStart: null });
  });

  let me: { id: string; name: string };
  let siteId: string;
  let routeId: string;
  let guardId: string;
  let guardPin: string;
  let myPin: string;

  it('the supervisor logs in on their own phone', async () => {
    await signInSupervisor(db, api, { email: EMAIL, password: PASSWORD });
    expect(useSession.getState().mode).toBe('supervisor_phone');
    me = getKv(db, 'supervisor.account')!;
    await pullConfiguration(db, api, (await getSupervisorToken())!);
  });

  it('sets up a site in airplane mode, which the server has once the network is back', async () => {
    const token = (await getSupervisorToken())!;

    siteId = createSite(db, { name: `E2E Raktár ${stamp}`, address: 'Próba utca 1.' });

    // Training: three new NFC tags, about a minute apart.
    let draft: TrainingDraft = beginTraining(db, {
      siteId,
      routeId: null,
      supervisorId: me.id,
      started: { uptime_ms: 1_000_000, boot_id: 'android-boot:12' },
    });
    for (const [i, name] of ['Főkapu', 'Raktár hátsó ajtó', 'Kazánház'].entries()) {
      const read = readForTraining(
        db,
        draft,
        { method: 'nfc', tag_uid: tag(i), ndef_raw: null },
        { uptime_ms: 1_000_000 + (i + 1) * 60_000, boot_id: 'android-boot:12' },
        null,
      );
      if (read.kind !== 'new_tag') throw new Error(`A new tag expected, got ${read.kind}`);
      draft = addNewPoint(draft, read.scan, { name, instruction: '', photo: null }, uuidv7);
    }
    draft = setRouteName(draft, 'Éjszakai kör');
    saveTraining(db, draft);
    routeId = draft.route.id;

    // The route edited: an instruction and the fixed order, as version 2.
    let edit = beginRouteEdit(loadRouteEditBase(db, routeId)!);
    const first = edit.points[0]!.checkpoint_id;
    edit = updateEditPoint(edit, first, { ...editPointDetails(edit, first), instruction: 'Zárva van-e a sorompó?' });
    edit = setEditOrderMode(edit, 'fixed');
    saveRouteEdit(db, edit, me.id);

    saveScheduleEdit(db, beginScheduleEdit(loadScheduleEditBase(db, routeId)!));

    guardPin = await freshPin(db, { siteIds: [siteId], userId: null });
    guardId = await createGuard(db, { siteId, name: `E2E Őr ${stamp}`, pin: guardPin });
    myPin = await freshPin(db, { siteIds: [siteId], userId: me.id });
    await changeUserPin(db, me.id, myPin);

    const reports = loadReportSettings(db, siteId, me.id)!;
    saveReportSettings(db, reports, { frequencies: ['shift', 'weekly'], alert_after_min: 240 });

    expect(pending()).toBeGreaterThanOrEqual(10);
    await syncOffline(token);
    await syncOnline(token);

    // The pull right after the calls is a full state (a new site), too early to have them: nothing disappears here.
    expect(db.select({ name: sites.name }).from(sites).where(eq(sites.id, siteId)).get()).toBeDefined();
    expect(db.select({ id: users.id }).from(users).where(eq(users.id, guardId)).get()).toBeDefined();
    expect(
      db.select({ id: reportSubscriptions.id }).from(reportSubscriptions).where(eq(reportSubscriptions.site_id, siteId)).all(),
    ).toHaveLength(2);
  });

  it('a second phone of the supervisor pulls the same site from the server', async () => {
    const token = (await getSupervisorToken())!;
    const { db: other } = await createTestDatabase();
    await settled();
    await pullConfiguration(other, api, token);

    expect(other.select().from(sites).where(eq(sites.id, siteId)).get()).toMatchObject({
      address: 'Próba utca 1.',
      no_data_alert_after_min: 240,
    });
    const route = other.select().from(routes).where(eq(routes.id, routeId)).get()!;
    expect(route).toMatchObject({ name: 'Éjszakai kör', order_mode: 'fixed', active: true });
    const points = other
      .select({ name: checkpoints.name, instruction: checkpoints.instruction })
      .from(routeVersionCheckpoints)
      .innerJoin(checkpoints, eq(checkpoints.id, routeVersionCheckpoints.checkpoint_id))
      .where(eq(routeVersionCheckpoints.route_version_id, route.current_version_id!))
      .orderBy(routeVersionCheckpoints.position)
      .all();
    expect(points).toEqual([
      { name: 'Főkapu', instruction: 'Zárva van-e a sorompó?' },
      { name: 'Raktár hátsó ajtó', instruction: null },
      { name: 'Kazánház', instruction: null },
    ]);
    expect(other.select().from(schedules).where(eq(schedules.route_id, routeId)).all()).toHaveLength(1);
    expect(other.select().from(users).where(eq(users.id, guardId)).get()).toMatchObject({ role: 'guard', active: true });
    expect(
      other
        .select()
        .from(siteUser)
        .where(and(eq(siteUser.site_id, siteId), eq(siteUser.user_id, guardId)))
        .get(),
    ).toBeDefined();
    const subscribed = other
      .select({ frequency: reportSubscriptions.frequency })
      .from(reportSubscriptions)
      .where(and(eq(reportSubscriptions.site_id, siteId), eq(reportSubscriptions.user_id, me.id)))
      .all()
      .map((row) => row.frequency)
      .sort();
    expect(subscribed).toEqual(['shift', 'weekly']);
  });

  it('the phone is enrolled to the site: the guard and the supervisor log in with the PINs given offline', async () => {
    await enrollThisPhone(db, api, siteId);
    expect(useSession.getState().mode).toBe('site_phone');
    const { token } = (await getDeviceCredentials())!;
    // At once, as the sync of the new site phone: the full state is too early to have the device, which stays.
    await pullConfiguration(db, api, token);

    expect(await pinLogin(db, guardPin)).toMatchObject({ status: 'ok', user: { id: guardId, role: 'guard' } });
    expect(await pinLogin(db, myPin)).toMatchObject({ status: 'ok', user: { id: me.id, role: 'supervisor' } });
  });

  it('on the site phone, offline, the supervisor gives the guard a new PIN and subscribes to a report', async () => {
    const { token } = (await getDeviceCredentials())!;
    logIn({ id: me.id, role: 'supervisor' });

    const newPin = await freshPin(db, { siteIds: [siteId], userId: guardId });
    await changeUserPin(db, guardId, newPin);
    const reports = loadReportSettings(db, siteId, me.id)!;
    saveReportSettings(db, reports, setReport(reports.saved, 'daily', true));
    expect(db.select({ acting: outbox.acting_user_id }).from(outbox).all()).toEqual([{ acting: me.id }, { acting: me.id }]);

    // Before the sync the phone already lets the guard in with the new PIN only.
    expect(await pinLogin(db, guardPin)).toMatchObject({ status: 'wrong' });
    expect(await pinLogin(db, newPin)).toMatchObject({ status: 'ok', user: { id: guardId } });

    await syncOffline(token);
    await syncOnline(token);

    // The server's verifier now, from a later pull.
    await settled();
    await pullConfiguration(db, api, token);
    expect(await pinLogin(db, newPin)).toMatchObject({ status: 'ok', user: { id: guardId } });
    expect(
      db
        .select({ frequency: reportSubscriptions.frequency })
        .from(reportSubscriptions)
        .where(and(eq(reportSubscriptions.site_id, siteId), eq(reportSubscriptions.user_id, me.id)))
        .all()
        .map((row) => row.frequency)
        .sort(),
    ).toEqual(['daily', 'shift', 'weekly']);
  });
});
