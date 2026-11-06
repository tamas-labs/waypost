// The sync controller (specification, Szinkron protokoll / Mikor fut): one sync at a time, the steps always in the
// order push → media → outbox → pull, and a delayed sync after chain entries so that quick scans go up together.
// It knows nothing about the network or the database: the runtime (runtime.ts) gives it the context, the steps, and
// which errors stop the sync.
//
// A step that fails does not stop the ones after it, unless its error says the others would fail too (no network, a
// token the server does not accept …): what one step cannot send (a batch the server refuses, a photo it cannot store)
// must not keep the configuration of the pull from coming, nor the supervisor's actions from going (audit WP-APP-002).

export type SyncStep = 'push' | 'media' | 'outbox' | 'pull';

/** The order of the steps in every sync. */
export const SYNC_STEPS: readonly SyncStep[] = ['push', 'media', 'outbox', 'pull'];

/** Why a sync was requested (for logs and tests; every trigger runs the same sync). */
export type SyncTrigger =
  'start' | 'foreground' | 'online' | 'interval' | 'chain_entry' | 'outbox' | 'shift_closed' | 'session' | 'manual' | 'revoked';

export type SyncOutcome =
  | { status: 'ok' }
  /** Nothing to sync with: the phone is not enrolled, or there is no API address. */
  | { status: 'skipped' }
  /**
   * At least one step threw. step and error: the failure that stopped the sync (null: reading the context), or if
   * none did, the first one. failures: every failure, in step order (that one included).
   */
  | { status: 'failed'; step: SyncStep | null; error: unknown; failures: readonly SyncFailure[] };

export interface SyncFailure {
  step: SyncStep | null;
  error: unknown;
}

export interface SyncControllerOptions<C> {
  /** What the steps work with (token, API client …); null: skip this sync. Read at the start of every sync. */
  context: () => Promise<C | null>;
  steps: Record<SyncStep, (context: C) => Promise<void>>;
  /** Whether a step's error stops the sync (the steps after it would fail the same way). Default: every error does. */
  stopsSync?: (error: unknown) => boolean;
  /** Delay of syncSoon(). Default: 2 s. */
  debounceMs?: number;
  onStart?: (trigger: SyncTrigger) => void;
  onFinish?: (outcome: SyncOutcome, trigger: SyncTrigger) => void;
}

export interface SyncController {
  /**
   * Runs a sync now, or, if one is running, once more right after it (any number of requests during a sync are
   * merged into that one). Resolves with the outcome of the sync that covers the request; never rejects.
   */
  sync(trigger: SyncTrigger): Promise<SyncOutcome>;
  /** sync() after the debounce delay; every call within the delay restarts it, and they are merged into one sync. */
  syncSoon(trigger: SyncTrigger): void;
  readonly running: boolean;
  /** Resolves when no sync runs and none is queued after it (a pending syncSoon() is not waited for). */
  idle(): Promise<void>;
  /** Cancels a pending syncSoon(); a running sync finishes. */
  dispose(): void;
}

export const SYNC_DEBOUNCE_MS = 2000;

export function createSyncController<C>({
  context,
  steps,
  stopsSync = () => true,
  debounceMs = SYNC_DEBOUNCE_MS,
  onStart,
  onFinish,
}: SyncControllerOptions<C>): SyncController {
  let current: Promise<SyncOutcome> | null = null;
  let next: Promise<SyncOutcome> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function run(trigger: SyncTrigger): Promise<SyncOutcome> {
    onStart?.(trigger);
    const failures: SyncFailure[] = [];
    let stopped: SyncFailure | null = null;
    let skipped = false;
    try {
      const ctx = await context();
      if (ctx === null) {
        skipped = true;
      } else {
        for (const step of SYNC_STEPS) {
          try {
            await steps[step](ctx);
          } catch (error) {
            const failure = { step, error };
            failures.push(failure);
            if (stopsSync(error)) {
              stopped = failure;
              break;
            }
          }
        }
      }
    } catch (error) {
      stopped = { step: null, error };
      failures.push(stopped);
    }
    const reported = stopped ?? failures[0];
    const outcome: SyncOutcome =
      reported !== undefined ? { status: 'failed', ...reported, failures } : skipped ? { status: 'skipped' } : { status: 'ok' };
    try {
      onFinish?.(outcome, trigger);
    } catch (error) {
      console.error('The sync onFinish callback failed', error);
    }
    return outcome;
  }

  function start(trigger: SyncTrigger): Promise<SyncOutcome> {
    const promise = run(trigger).finally(() => {
      current = null;
    });
    current = promise;
    return promise;
  }

  function sync(trigger: SyncTrigger): Promise<SyncOutcome> {
    if (current === null) return start(trigger);
    // A sync is running: what was written since it started is covered by one more sync after it.
    next ??= current.then(() => {
      next = null;
      return start(trigger);
    });
    return next;
  }

  function syncSoon(trigger: SyncTrigger): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void sync(trigger);
    }, debounceMs);
  }

  return {
    sync,
    syncSoon,
    get running() {
      return current !== null;
    },
    async idle() {
      // sync() never rejects; a sync queued meanwhile is waited for too.
      for (let pending = next ?? current; pending !== null; pending = next ?? current) await pending;
    },
    dispose() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
