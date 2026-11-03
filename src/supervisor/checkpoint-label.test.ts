import type { Database } from '@/db/database';
import { checkpoints, sites } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';

import { loadCheckpointLabel } from './checkpoint-label';

const AT = '2026-10-27T10:05:12.345Z';
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const OTHER_SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a2';
const GATE = '019a2b3c-4d5e-7f00-8a00-0000000000c1';
const QR = `waypost:cp:${GATE}:Ab3dEf6hIj9kLm2n`;

let db: Database;

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  db.insert(sites)
    .values({
      id: SITE,
      name: 'Raktár',
      timezone: 'Europe/Budapest',
      no_data_alert_after_min: 120,
      created_by: GATE,
      created_at: AT,
      updated_at: AT,
    })
    .run();
});

function checkpoint(values: Partial<typeof checkpoints.$inferInsert> = {}) {
  db.insert(checkpoints)
    .values({
      id: GATE,
      site_id: SITE,
      name: 'Kapu',
      tag_type: 'nfc',
      tag_uid: '04A1B2C3D4E501',
      qr_payload: QR,
      active: true,
      created_at: AT,
      updated_at: AT,
      ...values,
    })
    .run();
}

test('the point with its site and its QR payload', () => {
  checkpoint();
  expect(loadCheckpointLabel(db, GATE)).toEqual({
    id: GATE,
    name: 'Kapu',
    site_name: 'Raktár',
    tag_type: 'nfc',
    active: true,
    qr_payload: QR,
  });
});

test('a point the server has not given a code yet, inactive, of a site the phone does not have', () => {
  checkpoint({ site_id: OTHER_SITE, qr_payload: null, active: false, tag_type: 'qr', tag_uid: null });
  expect(loadCheckpointLabel(db, GATE)).toEqual({
    id: GATE,
    name: 'Kapu',
    site_name: null,
    tag_type: 'qr',
    active: false,
    qr_payload: null,
  });
});

test('null for a point the phone does not have', () => {
  expect(loadCheckpointLabel(db, GATE)).toBeNull();
});
