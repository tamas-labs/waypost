// The site list of the supervisor mode (S2) and a new site: what the screens show from the local database, and the
// action that creates a site through the outbox. The round status of the design's site card needs data the phone does
// not get (no endpoint: a later stage, decisions: "Kör részletei"), and the site phone's last contact (devices.last_seen_at) does not reach a supervisor's
// pull, so the card shows the configuration only (decisions: "Telephelyek").
import type { Timestamp } from '@waypost/schema';
import { asc, count, eq, inArray, isNull } from 'drizzle-orm';

import { configCalls } from '@/api/config-calls';
import { useSession, type SessionState } from '@/auth/session';
import type { Database } from '@/db/database';
import { getKv, type SupervisorAccount } from '@/db/kv';
import { devices, outbox, routes, routeVersionCheckpoints, sites, users } from '@/db/schema';
import { uuidv7 } from '@/id/uuidv7';
import { queueSupervisorAction } from '@/sync/outbox';
import { nowTimestamp } from '@/time/timestamp';

/** The server's defaults of POST /sites, sent explicitly so the local record has them before the response. */
export const NEW_SITE_TIMEZONE = 'Europe/Budapest';
export const NEW_SITE_NO_DATA_ALERT_MIN = 120;
/** The schema's limit of the name and the address. */
export const SITE_TEXT_MAX = 255;

export interface SiteListItem {
  id: string;
  name: string;
  address: string | null;
  /** The active routes, by name. */
  routes: { name: string; points: number }[];
  /** The site phone enrolled to the site (the server sends no revoked one); null: none. */
  phone: { name: string } | null;
  /** A call that changes the site waits in the outbox: the server does not have this state yet. */
  pending: boolean;
}

/** The sites of the phone (the pull brings only the visible ones), by name. */
export function loadSiteList(db: Database): SiteListItem[] {
  const siteRows = db.select({ id: sites.id, name: sites.name, address: sites.address }).from(sites).all();
  if (siteRows.length === 0) return [];
  const routeRows = db
    .select({ site_id: routes.site_id, name: routes.name, version: routes.current_version_id })
    .from(routes)
    .where(eq(routes.active, true))
    .all();
  const versionIds = routeRows.flatMap((route) => (route.version === null ? [] : [route.version]));
  const pointCounts = new Map(
    versionIds.length === 0
      ? []
      : db
          .select({ version: routeVersionCheckpoints.route_version_id, points: count() })
          .from(routeVersionCheckpoints)
          .where(inArray(routeVersionCheckpoints.route_version_id, versionIds))
          .groupBy(routeVersionCheckpoints.route_version_id)
          .all()
          .map((row) => [row.version, row.points]),
  );
  const phones = new Map(
    db
      .select({ site_id: devices.site_id, name: devices.name })
      .from(devices)
      .where(isNull(devices.revoked_at))
      .orderBy(asc(devices.enrolled_at))
      .all()
      .map((row) => [row.site_id, { name: row.name }]),
  );
  const waiting = new Set(
    db
      .select({ ids: outbox.record_ids })
      .from(outbox)
      .all()
      .flatMap((row) => row.ids),
  );
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'hu');
  return siteRows
    .map((site) => ({
      id: site.id,
      name: site.name,
      address: site.address,
      routes: routeRows
        .filter((route) => route.site_id === site.id)
        .map((route) => ({ name: route.name, points: route.version === null ? 0 : (pointCounts.get(route.version) ?? 0) }))
        .sort(byName),
      phone: phones.get(site.id) ?? null,
      pending: waiting.has(site.id),
    }))
    .sort(byName);
}

/**
 * Who uses the supervisor mode: on their own phone the account of the login, on the site phone the supervisor of the
 * PIN (without an e-mail address: the phone does not get it). Null if not known (a login before this was stored).
 */
export function supervisorAccount(db: Database, { mode, activeUser }: Pick<SessionState, 'mode' | 'activeUser'>): SupervisorAccount | null {
  if (mode === 'supervisor_phone') return getKv(db, 'supervisor.account');
  if (mode === 'site_phone' && activeUser?.role === 'supervisor') {
    const user = db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, activeUser.id)).get();
    return user === undefined ? null : { ...user, email: null };
  }
  return null;
}

export interface NewSite {
  name: string;
  address: string;
}

export type NewSiteErrors = Partial<Record<keyof NewSite, 'missing'>>;

/** The name is required; both are trimmed (the length is limited by the fields). Null: nothing to fix. */
export function checkNewSite(input: NewSite): NewSiteErrors | null {
  return input.name.trim() === '' ? { name: 'missing' } : null;
}

/**
 * Creates a site: the local record at once, and POST /sites through the outbox, with the id generated here. Only on a
 * supervisor's own phone: the site phone's token cannot create a site (api/site-create.request). Returns the new id.
 */
export function createSite(db: Database, input: NewSite, now: Timestamp = nowTimestamp()): string {
  if (useSession.getState().mode !== 'supervisor_phone') throw new Error("A site can only be created on a supervisor's own phone");
  if (checkNewSite(input) !== null) throw new Error('The new site has no name');
  const account = getKv(db, 'supervisor.account');
  if (account === null) throw new Error('The account of this phone is not known: log out and in again');
  const address = input.address.trim();
  const body = {
    id: uuidv7(),
    name: input.name.trim(),
    address: address === '' ? null : address,
    timezone: NEW_SITE_TIMEZONE,
    no_data_alert_after_min: NEW_SITE_NO_DATA_ALERT_MIN,
  };
  queueSupervisorAction(db, {
    apply: (tx) => {
      tx.insert(sites)
        .values({ ...body, created_by: account.id, created_at: now, updated_at: now })
        .run();
    },
    calls: [configCalls.createSite(body)],
  });
  return body.id;
}
