import type { ChainEntry, ChainEntryOf } from '@waypost/schema';
import { chainVectors } from '@waypost/schema/vectors';

import { schemaErrors } from '@/api/validation';

import { incident, roundClosed, roundOpened, scan, shiftClosed, shiftStarted, toAccuracyDm, toE7, type LocationFix } from './payloads';

const SHIFT = '019a2b3c-4d5e-7f00-8a00-000000000020';
const ROUND = '019a2b3c-4d5e-7f00-8a00-000000000021';
const SCAN = '019a2b3c-4d5e-7f00-8a00-000000000022';
const CHECKPOINT = '019a2b3c-4d5e-7f00-8a00-000000000006';
const PHOTO = { id: '019a2b3c-4d5e-7f00-8a00-000000000030', sha256: 'b'.repeat(64) };

const BUDAPEST: LocationFix = { latitude: 47.4979, longitude: 19.0402, accuracy_m: 12.5, mocked: false, gnss_time: null };

const entries = [...chainVectors.cases, ...chainVectors.chain.entries].map((vector) => ({ ...vector.input, hash: vector.hash }) as ChainEntry);
const countOf = (type: ChainEntry['type']) => entries.filter((entry) => entry.type === type).length;

/** The location a payload was built from. */
function locationOf(entry: ChainEntryOf<'scan'> | ChainEntryOf<'incident'>): LocationFix | null {
  const { lat_e7, lng_e7, accuracy_dm } = entry.payload;
  if (lat_e7 === null || lng_e7 === null) return null;
  const mocked = entry.type === 'scan' && entry.payload.is_mock;
  return { latitude: lat_e7 / 1e7, longitude: lng_e7 / 1e7, accuracy_m: accuracy_dm === null ? null : accuracy_dm / 10, mocked, gnss_time: entry.gnss_time };
}

describe('chain entry builders', () => {
  it('rebuild the payload of every shared vector', () => {
    for (const entry of entries) {
      const draft = (() => {
        switch (entry.type) {
          case 'shift_started':
            return shiftStarted(entry.payload);
          case 'shift_closed':
            return shiftClosed(entry.payload);
          case 'round_opened':
            return roundOpened(entry.payload);
          case 'round_closed':
            return roundClosed(entry.payload);
          case 'scan': {
            const { flags, ...payload } = entry.payload;
            return scan({ ...payload, location: locationOf(entry), flags: flags.filter((flag) => flag !== 'mock_location') });
          }
          case 'incident':
            return incident({ ...entry.payload, location: locationOf(entry) });
        }
      })();
      expect(draft).toEqual({ type: entry.type, payload: entry.payload, gnss_time: entry.gnss_time });
    }
    expect(countOf('scan')).toBeGreaterThan(2);
    expect(countOf('incident')).toBeGreaterThan(0);
  });

  it('build payloads that are valid for the chain schemas', () => {
    const drafts = [
      shiftStarted({ shift_id: SHIFT, guard_id: SCAN, site_id: ROUND }),
      shiftClosed({ shift_id: SHIFT, closed_by: 'handover' }),
      roundOpened({ round_id: ROUND, shift_id: SHIFT, route_version_id: SCAN, schedule_id: CHECKPOINT, scheduled_at: '2026-10-27T20:00:00.000Z', time_limit_min: null }),
      roundClosed({ round_id: ROUND, status: 'incomplete', finished_at: '2026-10-27T20:20:00.000Z' }),
      scan({ scan_id: SCAN, round_id: ROUND, checkpoint_id: CHECKPOINT, method: 'nfc', tag_uid: '04:a1:b2:c3:d4:e5:80', ndef_raw: null, location: BUDAPEST }),
      scan({ scan_id: SCAN, round_id: null, checkpoint_id: null, method: 'qr', qr_payload: 'waypost:cp:x', location: null, flags: ['unknown_tag', 'out_of_round'] }),
      scan({ scan_id: SCAN, round_id: ROUND, checkpoint_id: CHECKPOINT, method: 'manual', location: BUDAPEST, flags: ['manual'], note: ' A címke letörött. ', media: [PHOTO] }),
      incident({ incident_id: SHIFT, shift_id: SHIFT, category: 'damaged_tag', note: 'Letörött.', location: null, scan_id: SCAN, nearest_checkpoint_id: CHECKPOINT, media: [PHOTO] }),
      incident({ incident_id: SHIFT, shift_id: SHIFT, category: 'water', location: { ...BUDAPEST, accuracy_m: null } }),
    ];
    for (const draft of drafts) expect([draft.type, schemaErrors(`chain/payload-${draft.type}`, draft.payload)]).toEqual([draft.type, []]);
  });

  it('fill every absent scan field with null, and normalize the tag UID and the note', () => {
    expect(scan({ scan_id: SCAN, round_id: ROUND, checkpoint_id: CHECKPOINT, method: 'nfc', tag_uid: '04:a1:b2:c3', location: null, note: '  ' })).toEqual({
      type: 'scan',
      payload: {
        scan_id: SCAN,
        round_id: ROUND,
        checkpoint_id: CHECKPOINT,
        method: 'nfc',
        tag_uid: '04A1B2C3',
        qr_payload: null,
        ndef_raw: null,
        lat_e7: null,
        lng_e7: null,
        accuracy_dm: null,
        is_mock: false,
        flags: [],
        note: null,
        media: [],
      },
      gnss_time: null,
    });
  });

  it('set mock_location from the location, and write the flags once each in the schema order', () => {
    const draft = scan({
      scan_id: SCAN,
      round_id: null,
      checkpoint_id: CHECKPOINT,
      method: 'qr',
      qr_payload: 'waypost:cp:x',
      location: { ...BUDAPEST, mocked: true, gnss_time: '2026-10-27T20:03:43.000Z' },
      flags: ['out_of_round', 'out_of_order', 'out_of_round'],
    });
    expect(draft.payload).toMatchObject({ is_mock: true, flags: ['out_of_order', 'out_of_round', 'mock_location'], lat_e7: 474979000, lng_e7: 190402000, accuracy_dm: 125 });
    expect(draft.gnss_time).toBe('2026-10-27T20:03:43.000Z');
    expect(schemaErrors('chain/payload-scan', draft.payload)).toEqual([]);
  });

  it('convert degrees and metres to integers, rounding half away from zero', () => {
    expect(toE7(47.4979, 90)).toBe(474979000);
    expect(toE7(-33.8688197, 90)).toBe(-338688197);
    expect(toE7(0.00000005, 90)).toBe(1);
    expect(toE7(-0.00000005, 90)).toBe(-1);
    expect(Object.is(toE7(-0.00000001, 90), 0)).toBe(true);
    expect(toE7(-180, 180)).toBe(-1800000000);
    expect(() => toE7(90.0000001, 90)).toThrow(RangeError);
    expect(() => toE7(Number.NaN, 180)).toThrow(RangeError);

    expect(toAccuracyDm(12.5)).toBe(125);
    expect(toAccuracyDm(3.04)).toBe(30);
    expect(toAccuracyDm(0)).toBe(0);
    expect(toAccuracyDm(1e12)).toBe(2147483647);
    expect(toAccuracyDm(null)).toBeNull();
    expect(toAccuracyDm(-1)).toBeNull();
    expect(toAccuracyDm(Number.NaN)).toBeNull();
  });
});
