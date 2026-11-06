import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { createTestDatabase } from '@/db/testing';

import { clearErrorLog, ERROR_LOG_SIZE, logError, onErrorLogged, readErrorLog, startErrorLog } from './error-log';
import { errorLogRows } from './error-log-view';

let db: Database;
let sqlite: import('better-sqlite3').Database;
let stop: () => void = () => {};

beforeEach(async () => {
  ({ db, sqlite } = await createTestDatabase());
  jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 3, 19, 0));
});

afterEach(() => {
  stop();
  jest.restoreAllMocks();
});

describe('the error log', () => {
  it('keeps the errors in the database, the newest first, with their source and detail', () => {
    stop = startErrorLog(db);
    logError('scheduler', new TypeError('x is undefined'), 'interval');
    logError('pin', 'locked');
    expect(readErrorLog(db)).toEqual([
      { at: '2026-11-03T19:00:00.000Z', source: 'pin', detail: null, message: 'locked' },
      { at: '2026-11-03T19:00:00.000Z', source: 'scheduler', detail: 'interval', message: 'TypeError: x is undefined' },
    ]);
  });

  it('keeps the last 50, and cuts a long message', () => {
    stop = startErrorLog(db);
    for (let i = 0; i < ERROR_LOG_SIZE + 5; i += 1) logError('alarms', new Error(`failure ${i}`));
    const log = readErrorLog(db);
    expect(log).toHaveLength(ERROR_LOG_SIZE);
    expect(log[0]?.message).toBe(`Error: failure ${ERROR_LOG_SIZE + 4}`);
    expect(log.at(-1)?.message).toBe('Error: failure 5');

    logError('render', new Error('y'.repeat(2000)));
    expect(readErrorLog(db)[0]?.message).toHaveLength(500);
    expect(readErrorLog(db)[0]?.message.endsWith('…')).toBe(true);
  });

  it('writes what was logged before the database opened once it does, and nothing after it stops', () => {
    logError('nfc', new Error('early'), 'start');
    expect(getKv(db, 'diagnostics.errors')).toBeNull();
    stop = startErrorLog(db);
    expect(readErrorLog(db).map((entry) => entry.message)).toEqual(['Error: early']);

    stop();
    logError('nfc', new Error('later'));
    expect(readErrorLog(db)).toHaveLength(1);
    stop = startErrorLog(db);
    expect(readErrorLog(db)).toHaveLength(2);
  });

  it('does not throw if the database cannot take it', () => {
    stop = startErrorLog(db);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    sqlite.close();
    expect(() => logError('sync', new Error('x'))).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      'Writing the error log failed',
      expect.objectContaining({ message: 'The database connection is not open' }),
    );
  });

  it('tells the listeners, and clears the log', () => {
    stop = startErrorLog(db);
    const listener = jest.fn();
    const unsubscribe = onErrorLogged(listener);
    logError('scan', new Error('x'), 'nfc');
    clearErrorLog(db);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(readErrorLog(db)).toEqual([]);
    unsubscribe();
    logError('scan', new Error('x'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('survives what clears the state of the device', () => {
    setKv(db, 'diagnostics.errors', [{ at: '2026-11-03T19:00:00.000Z', source: 'sync', detail: null, message: 'x' }]);
    expect(readErrorLog(db)).toHaveLength(1);
  });
});

describe('the rows of the error log', () => {
  it('tell the local time, the source, the detail and the message', () => {
    const rows = errorLogRows(
      [
        { at: '2026-11-03T19:00:00.000Z', source: 'scheduler', detail: 'interval', message: 'TypeError: x' },
        { at: '2026-11-03T23:30:00.000Z', source: 'render', detail: null, message: 'Error: y' },
      ],
      'Europe/Budapest',
    );
    expect(rows.map(({ title, detail }) => [title, detail])).toEqual([
      ['2026-11-03 20:00 · Körök ütemezése', 'interval · TypeError: x'],
      ['2026-11-04 00:30 · Képernyő összeomlása', 'Error: y'],
    ]);
  });
});
