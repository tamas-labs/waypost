// Scans, manual entries and incidents (specification: Állapotgépek / Leolvasás; Láncolt napló / Jelölések).
import type { IncidentPayload, Timestamp } from '@waypost/schema';

import { incident, normalizeTagUid, roundClosed, scan, type LocationFix, type MediaRef, type ScanDecisionFlag } from '@/chain/payloads';
import type { ChainEntryDraft } from '@/chain/writer';

import { closingStatus } from './rounds';
import { DomainError, isOpen, versionOf, type CheckpointInfo, type GuardState, type NewId, type RoundInfo } from './state';

export const MAX_PHOTOS = 5;

/** What the reader delivered. */
export type TagRead = { method: 'nfc'; tag_uid: string; ndef_raw: string | null } | { method: 'qr'; qr_payload: string };

export interface ScanContext {
  state: GuardState;
  /** Trusted time of the scan. */
  now: Timestamp;
  location: LocationFix | null;
  newId: NewId;
}

export type ScanOutcome =
  /** No checkpoint has this tag: recorded with unknown_tag, the screen shows an error. */
  | { kind: 'unknown_tag'; drafts: ChainEntryDraft[] }
  /** The checkpoint is already scanned in its round: no entry, "Már leolvasva HH:MM-kor". */
  | { kind: 'already_scanned'; checkpoint_id: string; round_id: string; scanned_at: Timestamp; drafts: [] }
  | {
      kind: 'recorded';
      checkpoint_id: string;
      /** Null: out of round (no open round has this checkpoint). */
      round_id: string | null;
      out_of_order: boolean;
      /** The scan completed its round (round_closed completed is among the drafts). */
      completed: boolean;
      drafts: ChainEntryDraft[];
    };

/** The active checkpoint of a tag: NFC by UID (uppercase hex), QR by the whole payload. */
export function findCheckpoint(checkpoints: readonly CheckpointInfo[], read: TagRead): CheckpointInfo | null {
  if (read.method === 'nfc') {
    const uid = normalizeTagUid(read.tag_uid);
    return checkpoints.find((checkpoint) => checkpoint.active && checkpoint.tag_uid === uid) ?? null;
  }
  return checkpoints.find((checkpoint) => checkpoint.active && checkpoint.qr_payload === read.qr_payload) ?? null;
}

/** The checkpoint IDs of a round's version not scanned yet, in position order. */
function remaining(state: GuardState, round: RoundInfo): string[] {
  const scanned = new Set(round.scans.map((s) => s.checkpoint_id));
  return versionOf(state, round.route_version_id).checkpoint_ids.filter((id) => !scanned.has(id));
}

type Placement = { kind: 'round'; round: RoundInfo; out_of_order: boolean } | { kind: 'already'; round: RoundInfo; scanned_at: Timestamp } | { kind: 'out_of_round' };

/**
 * Which open round a checkpoint scan counts for: among those whose route version has it and still miss it, one the
 * guard has already started (it has scans), else the earliest scheduled. If every open round with it has it
 * already, it is a repeat; if none has it, it is out of round. In a fixed-order
 * route the expected checkpoint is the first missing one by position; another one is out_of_order, but counts.
 */
function place(state: GuardState, checkpointId: string, rounds: readonly RoundInfo[]): Placement {
  const candidates = rounds
    .filter((round) => isOpen(round) && versionOf(state, round.route_version_id).checkpoint_ids.includes(checkpointId))
    .sort((a, b) => Number(a.scans.length === 0) - Number(b.scans.length === 0) || a.scheduled_at.localeCompare(b.scheduled_at));
  const round = candidates.find((r) => !r.scans.some((s) => s.checkpoint_id === checkpointId));
  if (round !== undefined) {
    const fixed = state.routes.find((route) => route.id === round.route_id)?.order_mode === 'fixed';
    return { kind: 'round', round, out_of_order: fixed && remaining(state, round)[0] !== checkpointId };
  }
  const repeated = candidates[0];
  if (repeated !== undefined) return { kind: 'already', round: repeated, scanned_at: repeated.scans.find((s) => s.checkpoint_id === checkpointId)!.scanned_at };
  return { kind: 'out_of_round' };
}

interface ScanDetails {
  read: TagRead | null;
  note?: string | null;
  media?: readonly MediaRef[];
  extraFlags?: readonly ScanDecisionFlag[];
}

/** A scan of a known checkpoint, placed into its round; a manual entry adds its incident after the scan. */
function recordCheckpoint(context: ScanContext, checkpointId: string, rounds: readonly RoundInfo[], details: ScanDetails, after: (scanId: string) => ChainEntryDraft[] = () => []): ScanOutcome {
  const placement = place(context.state, checkpointId, rounds);
  if (placement.kind === 'already') return { kind: 'already_scanned', checkpoint_id: checkpointId, round_id: placement.round.id, scanned_at: placement.scanned_at, drafts: [] };

  const round = placement.kind === 'round' ? placement.round : null;
  const outOfOrder = placement.kind === 'round' && placement.out_of_order;
  const flags: ScanDecisionFlag[] = [...(details.extraFlags ?? [])];
  if (outOfOrder) flags.push('out_of_order');
  if (round === null) flags.push('out_of_round');
  const scanId = context.newId();
  const drafts: ChainEntryDraft[] = [
    scan({ scan_id: scanId, round_id: round?.id ?? null, checkpoint_id: checkpointId, method: details.read?.method ?? 'manual', ...readFields(details.read), location: context.location, flags, note: details.note, media: details.media }),
    ...after(scanId),
  ];

  let completed = false;
  if (round !== null) {
    const scans = [...round.scans, { checkpoint_id: checkpointId, scanned_at: context.now }];
    completed = closingStatus({ scans }, versionOf(context.state, round.route_version_id).checkpoint_ids) === 'completed';
    if (completed) drafts.push(roundClosed({ round_id: round.id, status: 'completed', finished_at: context.now }));
  }
  return { kind: 'recorded', checkpoint_id: checkpointId, round_id: round?.id ?? null, out_of_order: outOfOrder, completed, drafts };
}

function readFields(read: TagRead | null) {
  if (read === null) return {};
  return read.method === 'nfc' ? { tag_uid: read.tag_uid, ndef_raw: read.ndef_raw } : { qr_payload: read.qr_payload };
}

/** An NFC or QR scan. */
export function resolveScan(context: ScanContext, read: TagRead): ScanOutcome {
  const checkpoint = findCheckpoint(context.state.checkpoints, read);
  if (checkpoint === null) {
    const draft = scan({ scan_id: context.newId(), round_id: null, checkpoint_id: null, method: read.method, ...readFields(read), location: context.location, flags: ['unknown_tag'] });
    return { kind: 'unknown_tag', drafts: [draft] };
  }
  return recordCheckpoint(context, checkpoint.id, context.state.rounds, { read });
}

/** The trimmed note (null if empty); a manual entry requires the note and a photo. */
function checkNoteAndPhotos(note: string | null | undefined, media: readonly MediaRef[], required: boolean): string | null {
  const trimmed = note?.trim() ?? '';
  if (required && trimmed === '') throw new DomainError('note_required', 'A manual entry needs a note');
  if (required && media.length === 0) throw new DomainError('photo_required', 'A manual entry needs a photo');
  if (media.length > MAX_PHOTOS) throw new DomainError('too_many_photos', `At most ${MAX_PHOTOS} photos`);
  return trimmed === '' ? null : trimmed;
}

export interface ManualEntry {
  /** The round whose route list the guard picked the checkpoint from. */
  round_id: string;
  checkpoint_id: string;
  note: string;
  /** Camera photos, at least one. */
  media: readonly MediaRef[];
}

/**
 * Manual entry ("Címke nem olvasható"): a scan (method manual, manual flag) and an incident (damaged_tag, with the
 * scan's ID); both carry the note and the photos. The photo and the note are required.
 */
export function manualScan(context: ScanContext, entry: ManualEntry): ScanOutcome {
  const note = checkNoteAndPhotos(entry.note, entry.media, true);
  const round = context.state.rounds.find((r) => r.id === entry.round_id && isOpen(r));
  if (round === undefined) throw new DomainError('unknown_round', `Round ${entry.round_id} is not open`);
  if (!versionOf(context.state, round.route_version_id).checkpoint_ids.includes(entry.checkpoint_id)) {
    throw new DomainError('checkpoint_not_on_route', `Checkpoint ${entry.checkpoint_id} is not on the route of round ${round.id}`);
  }
  const shift = context.state.shift;
  if (shift === null) throw new DomainError('no_shift', 'There is no open shift');
  return recordCheckpoint(context, entry.checkpoint_id, [round], { read: null, note, media: entry.media, extraFlags: ['manual'] }, (scanId) => [
    incident({ incident_id: context.newId(), shift_id: shift.id, category: 'damaged_tag', note, location: context.location, nearest_checkpoint_id: entry.checkpoint_id, scan_id: scanId, media: entry.media }),
  ]);
}

/** The active checkpoint nearest to a location (equirectangular distance, enough at site scale); null without one. */
export function nearestCheckpoint(checkpoints: readonly CheckpointInfo[], location: LocationFix | null): string | null {
  if (location === null) return null;
  const cosLat = Math.cos((location.latitude * Math.PI) / 180);
  let best: { id: string; distance: number } | null = null;
  for (const checkpoint of checkpoints) {
    if (!checkpoint.active || checkpoint.lat_e7 === null || checkpoint.lng_e7 === null) continue;
    const dLat = checkpoint.lat_e7 / 1e7 - location.latitude;
    const dLng = (checkpoint.lng_e7 / 1e7 - location.longitude) * cosLat;
    const distance = dLat * dLat + dLng * dLng;
    if (best === null || distance < best.distance) best = { id: checkpoint.id, distance };
  }
  return best?.id ?? null;
}

export interface IncidentReport {
  category: IncidentPayload['category'];
  note?: string | null;
  /** Camera photos, 0 to 5. */
  media?: readonly MediaRef[];
}

/** An incident of the open shift, with the nearest checkpoint to where it was reported. */
export function reportIncident(context: ScanContext, report: IncidentReport): ChainEntryDraft<'incident'> {
  const shift = context.state.shift;
  if (shift === null) throw new DomainError('no_shift', 'There is no open shift');
  const media = report.media ?? [];
  const note = checkNoteAndPhotos(report.note, media, false);
  return incident({
    incident_id: context.newId(),
    shift_id: shift.id,
    category: report.category,
    note,
    location: context.location,
    nearest_checkpoint_id: nearestCheckpoint(context.state.checkpoints, context.location),
    media,
  });
}
