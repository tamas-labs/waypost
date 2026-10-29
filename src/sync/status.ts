// Sync state for the UI (M3-28 sync indicator): online or offline, what waits for upload, the last successful sync
// and the last error, and the "Sync now" action.
import type { Timestamp } from '@waypost/schema';
import { create } from 'zustand';

import { ApiError, InvalidResponseError, NetworkError } from '@/api/errors';

import type { SyncOutcome, SyncStep } from './controller';

/** What went wrong, as the UI tells it apart. */
export type SyncErrorKind =
  | 'network'
  /** The token is not accepted (401 unauthenticated). */
  | 'unauthenticated'
  /** The site phone was replaced by another one (M4-11). */
  | 'device_revoked'
  | 'rate_limited'
  /** Any other error response of the server (5xx, 4xx). */
  | 'server'
  /** A response that is not what the contract says. */
  | 'invalid_response'
  | 'unknown';

export interface SyncError {
  kind: SyncErrorKind;
  step: SyncStep | null;
  message: string;
  /** Device wall clock. */
  at: Timestamp;
}

export interface SyncStatus {
  /** From NetInfo; null until its first report. */
  online: boolean | null;
  running: boolean;
  /** Chain entries, photos and outbox calls waiting for upload. */
  pendingCount: number;
  /** Trusted time of the end of the last sync without an error; null before the first one. */
  lastSuccessAt: Timestamp | null;
  /** Error of the last sync; cleared by the next successful one. */
  lastError: SyncError | null;
  /** "Sync now": a sync right away (after the running one, if any). */
  syncNow: () => Promise<SyncOutcome>;
}

let syncNowHandler: () => Promise<SyncOutcome> = () => Promise.resolve({ status: 'skipped' });

/** Connects the "Sync now" action to the controller (runtime.ts). */
export function setSyncNowHandler(handler: () => Promise<SyncOutcome>): void {
  syncNowHandler = handler;
}

export const useSyncStatus = create<SyncStatus>(() => ({
  online: null,
  running: false,
  pendingCount: 0,
  lastSuccessAt: null,
  lastError: null,
  syncNow: () => syncNowHandler(),
}));

export function syncErrorKind(error: unknown): SyncErrorKind {
  if (error instanceof NetworkError) return 'network';
  if (error instanceof InvalidResponseError) return 'invalid_response';
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'unauthenticated':
      case 'device_revoked':
      case 'rate_limited':
        return error.code;
      default:
        return 'server';
    }
  }
  return 'unknown';
}
