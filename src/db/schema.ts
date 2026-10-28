// Local SQLite schema: the server's tables filtered to this phone's site(s), with the differences listed in the
// specification (Adatbázis, last paragraph). Column names match @waypost/schema, so pulled records are stored as
// they come. Timestamps are ISO 8601 UTC text with milliseconds (sortable as text). There are no foreign keys: the
// server owns referential integrity, and a pulled deletion must never cascade into data created on the device.
// After changing this file run `npm run db:generate` and commit the new migration.
import type { ChainEntryType, ChainPayloadMap, LocalTime } from '@waypost/schema';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const id = () => text().primaryKey();
const timestamp = () => text();
const bool = () => integer({ mode: 'boolean' });

// --- Configuration (owned by the server, written by pull) ---

export const sites = sqliteTable('sites', {
  id: id(),
  name: text().notNull(),
  address: text(),
  timezone: text().notNull(),
  no_data_alert_after_min: integer().notNull(),
  created_by: text().notNull(),
  created_at: timestamp().notNull(),
  updated_at: timestamp().notNull(),
});

/** Without e-mail and password; the PIN verifier is for the offline PIN login. */
export const users = sqliteTable('users', {
  id: id(),
  name: text().notNull(),
  role: text({ enum: ['supervisor', 'guard'] }).notNull(),
  pin_hash: text(),
  pin_salt: text(),
  pin_iterations: integer(),
  active: bool().notNull(),
  created_at: timestamp().notNull(),
  updated_at: timestamp().notNull(),
});

/** The site_ids of a pulled user. */
export const siteUser = sqliteTable(
  'site_user',
  {
    site_id: text().notNull(),
    user_id: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.site_id, t.user_id] }), index('site_user_user_id').on(t.user_id)],
);

/** Devices as pull delivers them (for a device token: only this phone); the secret is in the secure store. */
export const devices = sqliteTable('devices', {
  id: id(),
  site_id: text(),
  name: text().notNull(),
  platform: text({ enum: ['ios', 'android'] }).notNull(),
  app_version: text().notNull(),
  enrolled_by: text().notNull(),
  enrolled_at: timestamp().notNull(),
  revoked_at: timestamp(),
  last_seen_at: timestamp(),
});

/** Tag UID and QR payload are indexed, not unique: a pull page may move a tag from one checkpoint to another. */
export const checkpoints = sqliteTable(
  'checkpoints',
  {
    id: id(),
    site_id: text().notNull(),
    name: text().notNull(),
    instruction: text(),
    tag_type: text({ enum: ['nfc', 'nfc_dna', 'qr'] }).notNull(),
    tag_uid: text(),
    qr_payload: text(),
    lat_e7: integer(),
    lng_e7: integer(),
    accuracy_dm: integer(),
    photo_media_id: text(),
    active: bool().notNull(),
    created_at: timestamp().notNull(),
    updated_at: timestamp().notNull(),
  },
  (t) => [index('checkpoints_site_id_tag_uid').on(t.site_id, t.tag_uid), index('checkpoints_qr_payload').on(t.qr_payload)],
);

export const routes = sqliteTable(
  'routes',
  {
    id: id(),
    site_id: text().notNull(),
    name: text().notNull(),
    order_mode: text({ enum: ['free', 'fixed'] }).notNull(),
    current_version_id: text(),
    active: bool().notNull(),
    created_at: timestamp().notNull(),
    updated_at: timestamp().notNull(),
  },
  (t) => [index('routes_site_id').on(t.site_id)],
);

export const routeVersions = sqliteTable(
  'route_versions',
  {
    id: id(),
    route_id: text().notNull(),
    version: integer().notNull(),
    walk_duration_s: integer(),
    created_by: text().notNull(),
    created_at: timestamp().notNull(),
  },
  (t) => [uniqueIndex('route_versions_route_id_version').on(t.route_id, t.version)],
);

export const routeVersionCheckpoints = sqliteTable(
  'route_version_checkpoints',
  {
    route_version_id: text().notNull(),
    checkpoint_id: text().notNull(),
    position: integer().notNull(),
    walk_time_from_prev_s: integer(),
  },
  (t) => [primaryKey({ columns: [t.route_version_id, t.position] })],
);

export const schedules = sqliteTable(
  'schedules',
  {
    id: id(),
    route_id: text().notNull(),
    name: text().notNull(),
    weekdays: integer().notNull(),
    mode: text({ enum: ['list', 'interval'] }).notNull(),
    start_times: text({ mode: 'json' }).$type<LocalTime[]>(),
    interval_from: text(),
    interval_to: text(),
    interval_every_min: integer(),
    time_limit_min: integer(),
    active: bool().notNull(),
    created_at: timestamp().notNull(),
    updated_at: timestamp().notNull(),
  },
  (t) => [index('schedules_route_id').on(t.route_id)],
);

export const reportSubscriptions = sqliteTable('report_subscriptions', {
  id: id(),
  user_id: text().notNull(),
  site_id: text().notNull(),
  frequency: text({ enum: ['shift', 'daily', 'weekly', 'monthly'] }).notNull(),
});

// --- Data created on the device ---

/** The device's hash chain: the only source of truth of what happened on the phone. synced_at: acknowledged by push. */
export const chainEntries = sqliteTable(
  'chain_entries',
  {
    id: id(),
    device_id: text().notNull(),
    seq: integer().notNull(),
    type: text().$type<ChainEntryType>().notNull(),
    payload: text({ mode: 'json' }).$type<ChainPayloadMap[ChainEntryType]>().notNull(),
    device_time: timestamp().notNull(),
    uptime_ms: integer().notNull(),
    boot_id: text().notNull(),
    gnss_time: timestamp(),
    ref_server_time: timestamp(),
    ref_uptime_ms: integer(),
    ref_boot_id: text(),
    prev_hash: text().notNull(),
    hash: text().notNull(),
    synced_at: timestamp(),
  },
  (t) => [uniqueIndex('chain_entries_device_id_seq').on(t.device_id, t.seq), index('chain_entries_synced_at').on(t.synced_at)],
);

// Projections of the chain, written in the same transaction as their entry.

export const shifts = sqliteTable(
  'shifts',
  {
    id: id(),
    site_id: text().notNull(),
    device_id: text().notNull(),
    guard_id: text().notNull(),
    started_at: timestamp().notNull(),
    ended_at: timestamp(),
    closed_by: text({ enum: ['guard', 'handover', 'auto'] }),
    chain_entry_id: text().notNull(),
  },
  (t) => [index('shifts_started_at').on(t.started_at)],
);

export const rounds = sqliteTable(
  'rounds',
  {
    id: id(),
    shift_id: text().notNull(),
    route_version_id: text().notNull(),
    schedule_id: text().notNull(),
    scheduled_at: timestamp().notNull(),
    time_limit_min: integer(),
    started_at: timestamp(),
    finished_at: timestamp(),
    status: text({ enum: ['open', 'in_progress', 'completed', 'incomplete', 'missed'] }).notNull(),
  },
  (t) => [index('rounds_shift_id').on(t.shift_id), index('rounds_schedule_id_scheduled_at').on(t.schedule_id, t.scheduled_at)],
);

export const scans = sqliteTable(
  'scans',
  {
    id: id(),
    round_id: text(),
    checkpoint_id: text(),
    method: text({ enum: ['nfc', 'qr', 'manual'] }).notNull(),
    scanned_at: timestamp().notNull(),
    lat_e7: integer(),
    lng_e7: integer(),
    accuracy_dm: integer(),
    is_mock: bool().notNull(),
    flags: text({ mode: 'json' }).$type<string[]>().notNull(),
    note: text(),
    chain_entry_id: text().notNull(),
  },
  (t) => [index('scans_round_id').on(t.round_id)],
);

export const incidents = sqliteTable(
  'incidents',
  {
    id: id(),
    shift_id: text().notNull(),
    category: text({ enum: ['vandalism', 'open_door', 'water', 'intruder', 'damaged_tag', 'other'] }).notNull(),
    note: text(),
    occurred_at: timestamp().notNull(),
    lat_e7: integer(),
    lng_e7: integer(),
    accuracy_dm: integer(),
    nearest_checkpoint_id: text(),
    scan_id: text(),
    chain_entry_id: text().notNull(),
  },
  (t) => [index('incidents_shift_id').on(t.shift_id)],
);

/** Photos taken on the device. local_uri: the file on the phone; uploaded_at: null until PUT /media/{id} succeeded. */
export const media = sqliteTable(
  'media',
  {
    id: id(),
    owner_type: text({ enum: ['scan', 'incident', 'checkpoint'] }).notNull(),
    owner_id: text().notNull(),
    sha256: text().notNull(),
    mime: text().notNull(),
    size_bytes: integer().notNull(),
    local_uri: text().notNull(),
    taken_at: timestamp().notNull(),
    uploaded_at: timestamp(),
  },
  (t) => [index('media_owner').on(t.owner_type, t.owner_id), index('media_uploaded_at').on(t.uploaded_at)],
);

// --- Local only ---

/** REST calls of supervisor actions waiting to be sent, in id (UUIDv7) order (M5). */
export const outbox = sqliteTable('outbox', {
  id: id(),
  method: text({ enum: ['POST', 'PUT', 'PATCH', 'DELETE'] }).notNull(),
  path: text().notNull(),
  body: text({ mode: 'json' }).$type<unknown>(),
  idempotency_key: text().notNull(),
  /** X-Acting-User on the site phone; null with a supervisor token. */
  acting_user_id: text(),
  created_at: timestamp().notNull(),
  attempts: integer().notNull().default(0),
  next_attempt_at: timestamp(),
  last_error: text(),
});

/** Settings and sync state (pull cursor, last server time …), values as JSON; see kv.ts. */
export const kv = sqliteTable('kv', {
  key: text().primaryKey(),
  value: text({ mode: 'json' }).$type<unknown>().notNull(),
});
