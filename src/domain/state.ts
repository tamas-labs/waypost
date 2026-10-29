// What the domain rules see of the site phone: the configuration and the projections of the chain, loaded from the
// database by the runner (M3-23). The rules are pure functions of this state and the time; their output is the
// chain entries to write (src/chain/writer.ts), which update the projections in turn.
import type { Timestamp } from '@waypost/schema';

import type { ScheduleOfRoute } from './schedule';

export interface CheckpointInfo {
  id: string;
  /** Uppercase hex without separators. */
  tag_uid: string | null;
  qr_payload: string | null;
  lat_e7: number | null;
  lng_e7: number | null;
  active: boolean;
}

export interface RouteInfo {
  id: string;
  order_mode: 'free' | 'fixed';
  current_version_id: string | null;
  active: boolean;
}

export interface RouteVersionInfo {
  id: string;
  route_id: string;
  /** The checkpoints in position order. */
  checkpoint_ids: readonly string[];
}

export interface ShiftInfo {
  id: string;
  guard_id: string;
  started_at: Timestamp;
}

/** A scan of a checkpoint of the round (unknown tags are not listed). */
export interface RoundScan {
  checkpoint_id: string;
  scanned_at: Timestamp;
}

export type RoundStatus = 'open' | 'in_progress' | 'completed' | 'incomplete' | 'missed';

export interface RoundInfo {
  id: string;
  shift_id: string;
  route_id: string;
  route_version_id: string;
  schedule_id: string;
  scheduled_at: Timestamp;
  time_limit_min: number | null;
  status: RoundStatus;
  scans: readonly RoundScan[];
}

export interface GuardState {
  site_id: string;
  /** IANA time zone of the site. */
  timezone: string;
  /** The open shift, if any. */
  shift: ShiftInfo | null;
  routes: readonly RouteInfo[];
  schedules: readonly ScheduleOfRoute[];
  /** The current versions of the routes and the versions of the open rounds. */
  versions: readonly RouteVersionInfo[];
  checkpoints: readonly CheckpointInfo[];
  /** The open rounds and the rounds scheduled in the last two days (so a closed time slot is not opened again). */
  rounds: readonly RoundInfo[];
}

/** A rule cannot be applied; code tells the screen what to show. */
export class DomainError extends Error {
  override name = 'DomainError';
  constructor(
    readonly code: 'no_shift' | 'unknown_round' | 'checkpoint_not_on_route' | 'note_required' | 'photo_required' | 'too_many_photos',
    message: string,
  ) {
    super(message);
  }
}

export const isOpen = (round: Pick<RoundInfo, 'status'>) => round.status === 'open' || round.status === 'in_progress';

export function versionOf(state: GuardState, versionId: string): RouteVersionInfo {
  const version = state.versions.find((v) => v.id === versionId);
  if (version === undefined) throw new Error(`Route version ${versionId} is not loaded`);
  return version;
}

/** Newly created IDs (UUIDv7 in the app; deterministic in tests). */
export type NewId = () => string;
