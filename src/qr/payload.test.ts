import { schemas } from '@waypost/schema';

import { CHECKPOINT_QR, QR_PAYLOAD_MAX_LENGTH, isWaypostQr, parseCheckpointQr } from './payload';

const CHECKPOINT_ID = '01935f3a-7c2e-7b41-9f0d-3c5a8e2b6d14';
const VALID = `waypost:cp:${CHECKPOINT_ID}:Ab3dEf7hJk9mNp2q`;

/** The string branch of an anyOf [string, null] property. */
function stringBranch(path: 'entities/checkpoint' | 'chain/payload-scan', property: string): { pattern?: string; maxLength?: number } {
  type Branch = { type: string; pattern?: string; maxLength?: number };
  const schema = schemas[path] as unknown as { properties: Record<string, { anyOf: Branch[] }> };
  return schema.properties[property]!.anyOf.find((branch) => branch.type === 'string')!;
}

describe('isWaypostQr', () => {
  test('accepts every code with the waypost:cp: prefix', () => {
    expect(isWaypostQr(VALID)).toBe(true);
    // Not a well-formed checkpoint code, but still read: it is recorded as unknown_tag.
    expect(isWaypostQr('waypost:cp:something-else')).toBe(true);
  });

  test('ignores every other code', () => {
    for (const text of ['', 'https://waypost.dev/cp/1', 'WAYPOST:CP:' + CHECKPOINT_ID, ' ' + VALID, 'waypost:site:1', 'WIFI:S:guest;;', '5999881234567']) {
      expect(isWaypostQr(text)).toBe(false);
    }
  });

  test('ignores codes longer than the schema allows', () => {
    const longest = 'waypost:cp:'.padEnd(QR_PAYLOAD_MAX_LENGTH, 'x');
    expect(isWaypostQr(longest)).toBe(true);
    expect(isWaypostQr(longest + 'x')).toBe(false);
  });

  test('uses the limits of the scan payload schema', () => {
    const scanQr = stringBranch('chain/payload-scan', 'qr_payload');
    expect(scanQr.maxLength).toBe(QR_PAYLOAD_MAX_LENGTH);
    expect(scanQr.pattern).toBe('^waypost:cp:');
  });
});

describe('parseCheckpointQr', () => {
  test('splits a well-formed code', () => {
    expect(parseCheckpointQr(VALID)).toEqual({ checkpointId: CHECKPOINT_ID, code: 'Ab3dEf7hJk9mNp2q' });
  });

  test('null for anything else', () => {
    for (const text of [
      'waypost:cp:something-else',
      `waypost:cp:${CHECKPOINT_ID}:short`,
      `waypost:cp:${CHECKPOINT_ID.toUpperCase()}:Ab3dEf7hJk9mNp2q`,
      `waypost:cp:01935f3a-7c2e-4b41-9f0d-3c5a8e2b6d14:Ab3dEf7hJk9mNp2q`, // UUIDv4
      `${VALID}\n`,
    ]) {
      expect(parseCheckpointQr(text)).toBeNull();
    }
  });

  test('uses the pattern of the checkpoint schema', () => {
    const pattern = stringBranch('entities/checkpoint', 'qr_payload').pattern!;
    // Same pattern, only with capture groups around the two parts.
    expect(CHECKPOINT_QR.source.replace(/[()]/g, '')).toBe(pattern);
  });
});
