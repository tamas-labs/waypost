// Pull (specification, Szinkron protokoll / Pull): the configuration changes since the saved cursor, page by page
// while has_more is true, applied in one transaction together with the new cursor and the server time. Either the
// whole pull is applied or nothing, so the guard never works with half of a new configuration.
import type { SyncPullResponse, Timestamp } from '@waypost/schema';
import { eq, inArray } from 'drizzle-orm';

import type { ApiClient } from '@/api/client';
import { pull } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import {
  checkpoints,
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
import { readClock as defaultReadClock, type ClockReading, type ReadClock } from '@/time/clock';
import { recordServerTime } from '@/time/trusted-time';

import { emitConfigurationPulled } from './events';

type Changes = SyncPullResponse['changes'];
type Deleted = SyncPullResponse['deleted'];

/** What a pull changed in the local configuration. */
export interface PullSummary {
  pages: number;
  /** A page started a full state: the local configuration was replaced. */
  reset: boolean;
  /** Upserted records per list of "changes". */
  changed: Record<keyof Changes, number>;
  /** Deleted IDs per list of "deleted". */
  deleted: Record<keyof Deleted, number>;
  server_time: Timestamp;
}

export interface PullOptions {
  readClock?: ReadClock;
}

/** A page with the clock reading taken when it arrived (the server_time of the last one becomes the time reference). */
export interface ReceivedPage {
  page: SyncPullResponse;
  clock: ClockReading;
}

/** True if the summary has anything for the other modules (alarm rescheduling …) to react to. */
export function pullChangedAnything(summary: PullSummary): boolean {
  return summary.reset || Object.values(summary.changed).some((n) => n > 0) || Object.values(summary.deleted).some((n) => n > 0);
}

/** The cursor was not given out by this server (e.g. after a server reinstall): 422 with a "cursor" detail. */
function isRejectedCursor(error: unknown): boolean {
  return isApiError(error, 'validation_failed') && error.details !== null && 'cursor' in error.details;
}

/** Requests the pages from the saved cursor until has_more is false; nothing is written. */
export async function fetchPullPages(db: Database, api: ApiClient, token: string, readClock: ReadClock = defaultReadClock): Promise<ReceivedPage[]> {
  let cursor = getKv(db, 'sync.cursor');
  const pages: ReceivedPage[] = [];
  for (;;) {
    let page: SyncPullResponse;
    try {
      page = await pull(api, token, cursor);
    } catch (error) {
      // A rejected cursor would block every later pull; without a cursor the server sends the full state.
      if (pages.length === 0 && cursor !== null && isRejectedCursor(error)) {
        cursor = null;
        continue;
      }
      throw error;
    }
    pages.push({ page, clock: readClock() });
    if (!page.has_more) return pages;
    if (page.cursor === cursor) throw new Error('Pull: has_more is true but the cursor did not move');
    cursor = page.cursor;
  }
}

/** Deletes the configuration before a full state. Route versions stay: they never change, and a round in progress keeps using its own. */
function deleteConfiguration(tx: Database): void {
  for (const table of [sites, users, siteUser, devices, checkpoints, routes, schedules, reportSubscriptions]) tx.delete(table).run();
}

function applyChanges(tx: Database, changes: Changes): void {
  for (const row of changes.sites) tx.insert(sites).values(row).onConflictDoUpdate({ target: sites.id, set: row }).run();
  for (const { site_ids, ...row } of changes.users) {
    tx.insert(users).values(row).onConflictDoUpdate({ target: users.id, set: row }).run();
    tx.delete(siteUser).where(eq(siteUser.user_id, row.id)).run();
    for (const site_id of site_ids) tx.insert(siteUser).values({ site_id, user_id: row.id }).run();
  }
  for (const row of changes.devices) tx.insert(devices).values(row).onConflictDoUpdate({ target: devices.id, set: row }).run();
  for (const row of changes.checkpoints) tx.insert(checkpoints).values(row).onConflictDoUpdate({ target: checkpoints.id, set: row }).run();
  for (const row of changes.routes) tx.insert(routes).values(row).onConflictDoUpdate({ target: routes.id, set: row }).run();
  for (const row of changes.route_versions) tx.insert(routeVersions).values(row).onConflictDoUpdate({ target: routeVersions.id, set: row }).run();
  for (const row of changes.route_version_checkpoints) {
    tx.insert(routeVersionCheckpoints)
      .values(row)
      .onConflictDoUpdate({ target: [routeVersionCheckpoints.route_version_id, routeVersionCheckpoints.position], set: row })
      .run();
  }
  for (const row of changes.schedules) tx.insert(schedules).values(row).onConflictDoUpdate({ target: schedules.id, set: row }).run();
  for (const row of changes.report_subscriptions) {
    tx.insert(reportSubscriptions).values(row).onConflictDoUpdate({ target: reportSubscriptions.id, set: row }).run();
  }
}

function applyDeleted(tx: Database, deleted: Deleted): void {
  if (deleted.sites.length > 0) {
    tx.delete(sites).where(inArray(sites.id, deleted.sites)).run();
    tx.delete(siteUser).where(inArray(siteUser.site_id, deleted.sites)).run();
  }
  if (deleted.users.length > 0) {
    tx.delete(users).where(inArray(users.id, deleted.users)).run();
    tx.delete(siteUser).where(inArray(siteUser.user_id, deleted.users)).run();
  }
  if (deleted.devices.length > 0) tx.delete(devices).where(inArray(devices.id, deleted.devices)).run();
  if (deleted.checkpoints.length > 0) tx.delete(checkpoints).where(inArray(checkpoints.id, deleted.checkpoints)).run();
  if (deleted.routes.length > 0) tx.delete(routes).where(inArray(routes.id, deleted.routes)).run();
  if (deleted.schedules.length > 0) tx.delete(schedules).where(inArray(schedules.id, deleted.schedules)).run();
  if (deleted.report_subscriptions.length > 0) tx.delete(reportSubscriptions).where(inArray(reportSubscriptions.id, deleted.report_subscriptions)).run();
}

/** Adds the length of every list to the counts (the lists of a page always have every key). */
function addCounts<K extends string>(lists: Record<K, readonly unknown[]>, into: Partial<Record<K, number>>): Partial<Record<K, number>> {
  const result = { ...into };
  for (const [key, list] of Object.entries(lists) as [K, readonly unknown[]][]) result[key] = (result[key] ?? 0) + list.length;
  return result;
}

/**
 * Applies the pages in order in one transaction: a reset page first deletes the local configuration, then upserts
 * its changes and deletes its deleted IDs; at the end the last cursor and server time are saved. If anything throws,
 * the transaction rolls back and the cursor stays where it was.
 */
export function applyPullPages(db: Database, pages: readonly ReceivedPage[]): PullSummary {
  const last = pages.at(-1);
  if (last === undefined) throw new Error('Pull: no page to apply');
  return db.transaction((tx) => {
    let reset = false;
    let changed: Partial<PullSummary['changed']> = {};
    let deleted: Partial<PullSummary['deleted']> = {};
    for (const { page } of pages) {
      if (page.reset === true) {
        deleteConfiguration(tx);
        reset = true;
      }
      applyChanges(tx, page.changes);
      applyDeleted(tx, page.deleted);
      changed = addCounts(page.changes, changed);
      deleted = addCounts(page.deleted, deleted);
    }
    setKv(tx, 'sync.cursor', last.page.cursor);
    recordServerTime(tx, last.page.server_time, last.clock);
    return { pages: pages.length, reset, changed: changed as PullSummary['changed'], deleted: deleted as PullSummary['deleted'], server_time: last.page.server_time };
  });
}

/** The pull step of the sync: fetches every page, applies them, and tells the other modules if anything changed. */
export async function pullConfiguration(db: Database, api: ApiClient, token: string, options: PullOptions = {}): Promise<PullSummary> {
  const pages = await fetchPullPages(db, api, token, options.readClock);
  const summary = applyPullPages(db, pages);
  if (pullChangedAnything(summary)) emitConfigurationPulled(summary);
  return summary;
}
