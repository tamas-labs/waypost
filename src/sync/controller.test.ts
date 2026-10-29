import { createSyncController, SYNC_STEPS, type SyncOutcome, type SyncStep, type SyncTrigger } from './controller';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** A controller whose steps log their calls; a step may be made to wait or to throw. */
function setup(options: { context?: () => Promise<string | null>; debounceMs?: number } = {}) {
  const log: string[] = [];
  const waits = new Map<SyncStep, Deferred>();
  const failures = new Map<SyncStep, Error>();
  const finished: [SyncOutcome, SyncTrigger][] = [];
  const step = (name: SyncStep) => async (context: string) => {
    log.push(`${name}:${context}`);
    await waits.get(name)?.promise;
    const failure = failures.get(name);
    if (failure !== undefined) throw failure;
  };
  const controller = createSyncController({
    context: options.context ?? (async () => 'ctx'),
    steps: { push: step('push'), media: step('media'), outbox: step('outbox'), pull: step('pull') },
    debounceMs: options.debounceMs,
    onStart: (trigger) => log.push(`start:${trigger}`),
    onFinish: (outcome, trigger) => finished.push([outcome, trigger]),
  });
  return { controller, log, waits, failures, finished };
}

const ONE_SYNC = ['push:ctx', 'media:ctx', 'outbox:ctx', 'pull:ctx'];

describe('sync controller', () => {
  afterEach(() => jest.useRealTimers());

  it('runs the steps in the order push → media → outbox → pull', async () => {
    const { controller, log, finished } = setup();
    expect(SYNC_STEPS).toEqual(['push', 'media', 'outbox', 'pull']);
    await expect(controller.sync('start')).resolves.toEqual({ status: 'ok' });
    expect(log).toEqual(['start:start', ...ONE_SYNC]);
    expect(finished).toEqual([[{ status: 'ok' }, 'start']]);
  });

  it('stops at the first failing step and reports it without rejecting', async () => {
    const { controller, log, failures } = setup();
    const error = new Error('offline');
    failures.set('media', error);
    await expect(controller.sync('manual')).resolves.toEqual({ status: 'failed', step: 'media', error });
    expect(log).toEqual(['start:manual', 'push:ctx', 'media:ctx']);
  });

  it('skips the sync without a context, and reports a failing context', async () => {
    const skipped = setup({ context: async () => null });
    await expect(skipped.controller.sync('start')).resolves.toEqual({ status: 'skipped' });
    expect(skipped.log).toEqual(['start:start']);

    const error = new Error('secure store');
    const failing = setup({
      context: async () => {
        throw error;
      },
    });
    await expect(failing.controller.sync('start')).resolves.toEqual({ status: 'failed', step: null, error });
  });

  it('runs one sync at a time, and merges the requests made meanwhile into one more sync after it', async () => {
    const { controller, log, waits } = setup();
    const push = deferred();
    waits.set('push', push);

    const first = controller.sync('start');
    expect(controller.running).toBe(true);
    const second = controller.sync('online');
    const third = controller.sync('chain_entry');
    expect(third).toBe(second);
    await Promise.resolve();
    expect(log).toEqual(['start:start', 'push:ctx']);

    waits.delete('push');
    push.resolve();
    await expect(first).resolves.toEqual({ status: 'ok' });
    await expect(second).resolves.toEqual({ status: 'ok' });
    expect(log).toEqual(['start:start', ...ONE_SYNC, 'start:online', ...ONE_SYNC]);
    expect(controller.running).toBe(false);

    // Later requests start a new sync again.
    await controller.sync('manual');
    expect(log.filter((line) => line.startsWith('start:'))).toEqual(['start:start', 'start:online', 'start:manual']);
  });

  it('starts the merged sync even if the running one failed', async () => {
    const { controller, log, failures } = setup();
    failures.set('push', new Error('offline'));
    const first = controller.sync('start');
    const second = controller.sync('foreground');
    await expect(first).resolves.toMatchObject({ status: 'failed', step: 'push' });
    failures.clear();
    await expect(second).resolves.toEqual({ status: 'ok' });
    expect(log).toEqual(['start:start', 'push:ctx', 'start:foreground', ...ONE_SYNC]);
  });

  it('syncs 2 s after the last of quick requests, once', async () => {
    jest.useFakeTimers();
    const { controller, log } = setup();

    controller.syncSoon('chain_entry');
    await jest.advanceTimersByTimeAsync(1500);
    controller.syncSoon('chain_entry');
    await jest.advanceTimersByTimeAsync(1999);
    expect(log).toEqual([]);

    await jest.advanceTimersByTimeAsync(1);
    expect(log).toEqual(['start:chain_entry', ...ONE_SYNC]);

    await jest.advanceTimersByTimeAsync(10_000);
    expect(log).toHaveLength(1 + ONE_SYNC.length);
  });

  it('takes the debounce delay from the options, and dispose() cancels a pending sync', async () => {
    jest.useFakeTimers();
    const { controller, log } = setup({ debounceMs: 500 });
    controller.syncSoon('chain_entry');
    await jest.advanceTimersByTimeAsync(500);
    expect(log).toHaveLength(1 + ONE_SYNC.length);

    controller.syncSoon('chain_entry');
    controller.dispose();
    await jest.advanceTimersByTimeAsync(5000);
    expect(log).toHaveLength(1 + ONE_SYNC.length);
  });
});
