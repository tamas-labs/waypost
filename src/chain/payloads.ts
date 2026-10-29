// Builders of the chain entry drafts, one per entry type: they turn what the domain knows (a location in degrees and
// metres, photos, the flags it decided) into the exact payload of @waypost/schema – every field present, null when
// absent, and only integers (lat_e7 / lng_e7 / accuracy_dm instead of floating-point numbers).
import type {
  IncidentPayload,
  RoundClosedPayload,
  RoundOpenedPayload,
  ScanPayload,
  ShiftClosedPayload,
  ShiftStartedPayload,
  Timestamp,
} from '@waypost/schema';

import type { ChainEntryDraft } from './writer';

/** A location fix as the location service delivers it. */
export interface LocationFix {
  /** WGS 84 degrees. */
  latitude: number;
  longitude: number;
  /** Horizontal accuracy radius in metres; null if unknown. */
  accuracy_m: number | null;
  /** Android: the fix came from a mock location provider. */
  mocked: boolean;
  /** Android, GPS provider only: the GNSS time of the fix. */
  gnss_time: Timestamp | null;
}

/** A photo of the entry, with the SHA-256 of its file, so a replaced photo is detected. */
export interface MediaRef {
  id: string;
  sha256: string;
}

/** A photo taken on the phone (src/photo), not yet recorded: the media row is written with the entry citing it. */
export interface PhotoFile extends MediaRef {
  mime: string;
  size_bytes: number;
  /** The file in the app's document directory. */
  local_uri: string;
  taken_at: Timestamp;
}

/** The flags the app sets on a scan from its own decision; mock_location follows from the location. */
export type ScanDecisionFlag = 'manual' | 'out_of_order' | 'out_of_round' | 'unknown_tag';

type ScanFlag = ScanPayload['flags'][number];
/** The enum order of payload-scan.json: flags are written in this order, once each. */
const SCAN_FLAGS: readonly ScanFlag[] = ['manual', 'out_of_order', 'out_of_round', 'unknown_tag', 'mock_location'];

/** Rounds half away from zero, without -0. */
function roundInteger(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}

/** Degrees × 10^7 as an integer (47.4979° → 474979000). */
export function toE7(degrees: number, limit: 90 | 180): number {
  if (!Number.isFinite(degrees) || Math.abs(degrees) > limit) throw new RangeError(`Coordinate out of range: ${degrees}`);
  return roundInteger(degrees * 1e7);
}

/** Metres → decimetres as an integer (12.5 m → 125); null for an unknown or invalid accuracy. */
export function toAccuracyDm(metres: number | null): number | null {
  if (metres === null || !Number.isFinite(metres) || metres < 0) return null;
  return Math.min(roundInteger(metres * 10), 2147483647);
}

/** The location fields of a scan or incident payload: all null without a location. */
export function locationFields(location: LocationFix | null): Pick<ScanPayload, 'lat_e7' | 'lng_e7' | 'accuracy_dm'> {
  if (location === null) return { lat_e7: null, lng_e7: null, accuracy_dm: null };
  return { lat_e7: toE7(location.latitude, 90), lng_e7: toE7(location.longitude, 180), accuracy_dm: toAccuracyDm(location.accuracy_m) };
}

/** NFC tag UID as stored: uppercase hex without separators (04:a1:b2 → 04A1B2). */
export function normalizeTagUid(uid: string): string {
  return uid.replace(/[\s:-]/g, '').toUpperCase();
}

/** A note as stored: trimmed, null if empty. */
function noteOrNull(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

const mediaRefs = (media: readonly MediaRef[] = []): MediaRef[] => media.map(({ id, sha256 }) => ({ id, sha256 }));

export function shiftStarted(payload: ShiftStartedPayload): ChainEntryDraft<'shift_started'> {
  const { shift_id, guard_id, site_id } = payload;
  return { type: 'shift_started', payload: { shift_id, guard_id, site_id }, gnss_time: null };
}

export function shiftClosed(payload: ShiftClosedPayload): ChainEntryDraft<'shift_closed'> {
  const { shift_id, closed_by } = payload;
  return { type: 'shift_closed', payload: { shift_id, closed_by }, gnss_time: null };
}

export function roundOpened(payload: RoundOpenedPayload): ChainEntryDraft<'round_opened'> {
  const { round_id, shift_id, route_version_id, schedule_id, scheduled_at, time_limit_min } = payload;
  return { type: 'round_opened', payload: { round_id, shift_id, route_version_id, schedule_id, scheduled_at, time_limit_min }, gnss_time: null };
}

export function roundClosed(payload: RoundClosedPayload): ChainEntryDraft<'round_closed'> {
  const { round_id, status, finished_at } = payload;
  return { type: 'round_closed', payload: { round_id, status, finished_at }, gnss_time: null };
}

export interface ScanInput {
  scan_id: string;
  /** Null for out_of_round. */
  round_id: string | null;
  /** Null for unknown_tag. */
  checkpoint_id: string | null;
  method: ScanPayload['method'];
  /** nfc: the UID (normalized here) and the raw NDEF message in base64, if the tag has one. */
  tag_uid?: string | null;
  ndef_raw?: string | null;
  /** qr: the scanned text. */
  qr_payload?: string | null;
  location: LocationFix | null;
  flags?: readonly ScanDecisionFlag[];
  note?: string | null;
  media?: readonly MediaRef[];
}

export function scan(input: ScanInput): ChainEntryDraft<'scan'> {
  const isMock = input.location?.mocked ?? false;
  const flags = new Set<ScanFlag>(input.flags);
  if (isMock) flags.add('mock_location');
  const payload: ScanPayload = {
    scan_id: input.scan_id,
    round_id: input.round_id,
    checkpoint_id: input.checkpoint_id,
    method: input.method,
    tag_uid: input.tag_uid ? normalizeTagUid(input.tag_uid) : null,
    qr_payload: input.qr_payload ?? null,
    ndef_raw: input.ndef_raw ?? null,
    ...locationFields(input.location),
    is_mock: isMock,
    flags: SCAN_FLAGS.filter((flag) => flags.has(flag)),
    note: noteOrNull(input.note),
    media: mediaRefs(input.media),
  };
  return { type: 'scan', payload, gnss_time: input.location?.gnss_time ?? null };
}

export interface IncidentInput {
  incident_id: string;
  shift_id: string;
  category: IncidentPayload['category'];
  note?: string | null;
  location: LocationFix | null;
  nearest_checkpoint_id?: string | null;
  /** The manual scan this incident (damaged_tag) belongs to. */
  scan_id?: string | null;
  media?: readonly MediaRef[];
}

export function incident(input: IncidentInput): ChainEntryDraft<'incident'> {
  const payload: IncidentPayload = {
    incident_id: input.incident_id,
    shift_id: input.shift_id,
    category: input.category,
    note: noteOrNull(input.note),
    ...locationFields(input.location),
    nearest_checkpoint_id: input.nearest_checkpoint_id ?? null,
    scan_id: input.scan_id ?? null,
    media: mediaRefs(input.media),
  };
  return { type: 'incident', payload, gnss_time: input.location?.gnss_time ?? null };
}
