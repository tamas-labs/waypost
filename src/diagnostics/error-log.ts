// The local error log (audit WP-APP-008): what failed in the background or on a screen – the scheduler, the alarms,
// the tag listening, a recording, a crash of the screens – kept in the kv table, the last ERROR_LOG_SIZE of them, so
// that a failure in the trial (M7) can be looked into on the phone ("Telefon beállítása"). In a release build there is
// no other trace of these. Logging never throws: a failure here must not add to the one being logged.
import { deleteKv, getKv, setKv, type ErrorSource, type LoggedError } from '@/db/kv';
import type { Database } from '@/db/database';
import { nowTimestamp } from '@/time/timestamp';

export type { ErrorSource, LoggedError };

export const ERROR_LOG_SIZE = 50;
const MESSAGE_MAX_LENGTH = 500;

let database: Database | null = null;
/** Errors logged before the database is open: they are written once it is. */
let early: LoggedError[] = [];
const listeners = new Set<() => void>();

function describe(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.length > MESSAGE_MAX_LENGTH ? `${text.slice(0, MESSAGE_MAX_LENGTH - 1)}…` : text;
}

function append(db: Database, entries: readonly LoggedError[]): void {
  setKv(db, 'diagnostics.errors', [...(getKv(db, 'diagnostics.errors') ?? []), ...entries].slice(-ERROR_LOG_SIZE));
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A screen's listener: nothing to do about it here.
    }
  }
}

/** Writes the log into this database from now on (and what was logged before it opened). Returns the function that stops it. */
export function startErrorLog(db: Database): () => void {
  database = db;
  if (early.length > 0) {
    try {
      append(db, early);
      early = [];
    } catch (error) {
      if (__DEV__) console.warn('Writing the error log failed', error);
    }
  }
  return () => {
    if (database === db) database = null;
  };
}

/** Logs an error; detail tells what was being done (e.g. the scheduler's trigger). */
export function logError(source: ErrorSource, error: unknown, detail: string | null = null): void {
  const entry: LoggedError = { at: nowTimestamp(), source, detail, message: describe(error) };
  if (database === null) {
    early = [...early, entry].slice(-ERROR_LOG_SIZE);
  } else {
    try {
      append(database, [entry]);
    } catch (failure) {
      if (__DEV__) console.warn('Writing the error log failed', failure);
      return;
    }
  }
  notify();
}

/** The logged errors, the newest first. */
export function readErrorLog(db: Database): LoggedError[] {
  return [...(getKv(db, 'diagnostics.errors') ?? [])].reverse();
}

export function clearErrorLog(db: Database): void {
  deleteKv(db, 'diagnostics.errors');
  notify();
}

/** Calls the listener after every logged error and clearing; returns the function that unsubscribes it. */
export function onErrorLogged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
