// Pull (specification, Szinkron protokoll / Pull): the configuration changes since the saved cursor, page by page
// while has_more is true, applied in one transaction together with the new cursor and the server time. Either the
// whole pull is applied or nothing, so the guard never works with half of a new configuration.
import type { SyncPullResponse } from '@waypost/schema';
import { eq, inArray } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { ApiClient } from '@/api/client';
import { pull } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import {
  checkpoints,
  devices,
  reportSubscriptions,
  rounds,
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

import { emitConfigurationPulled, type PullSummary } from './events';

type Changes = SyncPullResponse['changes'];
type Deleted = SyncPullResponse['deleted'];

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
export async function fetchPullPages(
  db: Database,
  api: ApiClient,
  token: string,
  readClock: ReadClock = defaultReadClock,
): Promise<ReceivedPage[]> {
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

/**
 * Deletes checkpoints. A round keeps its route version to the end, so the points of the running rounds stay as inactive:
 * they can still be scanned there (src/domain/scan.ts), and nothing else uses them. A later pull restores them, or a
 * reset without a running round deletes them.
 */
function removeCheckpoints(tx: Database, ids: readonly string[]): void {
  const ofRunningRounds = new Set(
    tx
      .select({ id: routeVersionCheckpoints.checkpoint_id })
      .from(routeVersionCheckpoints)
      .innerJoin(rounds, eq(rounds.route_version_id, routeVersionCheckpoints.route_version_id))
      .where(inArray(rounds.status, ['open', 'in_progress']))
      .all()
      .map((row) => row.id),
  );
  const [kept, gone] = [ids.filter((id) => ofRunningRounds.has(id)), ids.filter((id) => !ofRunningRounds.has(id))];
  if (kept.length > 0) tx.update(checkpoints).set({ active: false }).where(inArray(checkpoints.id, kept)).run();
  if (gone.length > 0) tx.delete(checkpoints).where(inArray(checkpoints.id, gone)).run();
}

/** How one list of a pull page goes to the database. */
interface SyncedList<K extends keyof Changes> {
  upsert: (tx: Database, row: Changes[K][number]) => void;
  /** Deletes by the IDs under "deleted"; null for a list that has none there. */
  remove: K extends keyof Deleted ? (tx: Database, ids: readonly string[]) => void : null;
  /** Deletes everything before a full state; null for what a full state keeps. */
  clear: ((tx: Database) => void) | null;
}

type TableWithId = SQLiteTable & { id: SQLiteColumn };

const upsertOn =
  <T extends SQLiteTable>(table: T, target: SQLiteColumn | SQLiteColumn[]) =>
  (tx: Database, row: T['$inferInsert']) => {
    tx.insert(table).values(row).onConflictDoUpdate({ target, set: row }).run();
  };

const removeFrom =
  <T extends TableWithId>(table: T) =>
  (tx: Database, ids: readonly string[]) => {
    tx.delete(table)
      .where(inArray(table.id, [...ids]))
      .run();
  };

const clearOf = (table: SQLiteTable) => (tx: Database) => {
  tx.delete(table).run();
};

/** A list whose rows are one table's rows, by their id. */
const plainList = <T extends TableWithId>(table: T) => ({
  upsert: upsertOn(table, table.id),
  remove: removeFrom(table),
  clear: clearOf(table),
});

/**
 * Every list of a page, in the order they are applied. Route versions stay at a full state: they never change, and a
 * round in progress keeps using its own.
 */
const SYNCED_LISTS: { [K in keyof Changes]: SyncedList<K> } = {
  sites: {
    ...plainList(sites),
    remove: (tx, ids) => {
      removeFrom(sites)(tx, ids);
      tx.delete(siteUser)
        .where(inArray(siteUser.site_id, [...ids]))
        .run();
    },
  },
  users: {
    upsert: (tx, { site_ids, ...row }) => {
      upsertOn(users, users.id)(tx, row);
      tx.delete(siteUser).where(eq(siteUser.user_id, row.id)).run();
      for (const site_id of site_ids) tx.insert(siteUser).values({ site_id, user_id: row.id }).run();
    },
    remove: (tx, ids) => {
      removeFrom(users)(tx, ids);
      tx.delete(siteUser)
        .where(inArray(siteUser.user_id, [...ids]))
        .run();
    },
    clear: (tx) => {
      clearOf(users)(tx);
      clearOf(siteUser)(tx);
    },
  },
  devices: plainList(devices),
  checkpoints: {
    upsert: upsertOn(checkpoints, checkpoints.id),
    remove: removeCheckpoints,
    clear: (tx) =>
      removeCheckpoints(
        tx,
        tx
          .select({ id: checkpoints.id })
          .from(checkpoints)
          .all()
          .map((row) => row.id),
      ),
  },
  routes: plainList(routes),
  route_versions: { upsert: upsertOn(routeVersions, routeVersions.id), remove: null, clear: null },
  route_version_checkpoints: {
    upsert: upsertOn(routeVersionCheckpoints, [routeVersionCheckpoints.route_version_id, routeVersionCheckpoints.position]),
    remove: null,
    clear: null,
  },
  schedules: plainList(schedules),
  report_subscriptions: plainList(reportSubscriptions),
};

const LISTS = Object.keys(SYNCED_LISTS) as (keyof Changes)[];

function deleteConfiguration(tx: Database): void {
  for (const list of LISTS) SYNCED_LISTS[list].clear?.(tx);
}

function upsertList<K extends keyof Changes>(tx: Database, list: K, rows: readonly Changes[K][number][]): void {
  const { upsert } = SYNCED_LISTS[list];
  for (const row of rows) upsert(tx, row);
}

function applyChanges(tx: Database, changes: Changes): void {
  for (const list of LISTS) upsertList(tx, list, changes[list]);
}

function applyDeleted(tx: Database, deleted: Deleted): void {
  for (const list of LISTS) {
    const { remove } = SYNCED_LISTS[list];
    if (remove === null) continue;
    const ids = deleted[list as keyof Deleted];
    if (ids.length > 0) remove(tx, ids);
  }
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
    return {
      pages: pages.length,
      reset,
      changed: changed as PullSummary['changed'],
      deleted: deleted as PullSummary['deleted'],
      server_time: last.page.server_time,
    };
  });
}

/** The pull step of the sync: fetches every page, applies them, and tells the other modules if anything changed. */
export async function pullConfiguration(db: Database, api: ApiClient, token: string, options: PullOptions = {}): Promise<PullSummary> {
  const pages = await fetchPullPages(db, api, token, options.readClock);
  const summary = applyPullPages(db, pages);
  if (pullChangedAnything(summary)) emitConfigurationPulled(summary);
  return summary;
}
