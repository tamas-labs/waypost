import type { ChainEntry } from '@waypost/schema';
import { chainVectors } from '@waypost/schema/vectors';

import { chainHash, GENESIS_HASH, hmacSha256Hex, signChainEntry, verifyChainEntry } from './hmac';

const KEY = chainVectors.key_base64;

describe('chain hash', () => {
  it.each(chainVectors.cases.map((vector) => [vector.name, vector] as const))('matches the shared vector %s', (_name, vector) => {
    expect(chainHash(vector.input, KEY)).toBe(vector.hash);
    expect(hmacSha256Hex(KEY, vector.canonical_json)).toBe(vector.hash);
  });

  it('links the shared chain: seq 1 to 64 zeros, every further entry to the previous hash', () => {
    let prev = GENESIS_HASH;
    for (const vector of chainVectors.chain.entries) {
      expect(vector.input.prev_hash).toBe(prev);
      const signed = signChainEntry(vector.input, KEY);
      expect(signed.hash).toBe(vector.hash);
      prev = signed.hash;
    }
  });

  it('detects a changed entry or another key', () => {
    const [vector] = chainVectors.cases;
    const entry = { ...vector!.input, hash: vector!.hash } as ChainEntry;
    expect(verifyChainEntry(entry, KEY)).toBe(true);
    expect(verifyChainEntry({ ...entry, seq: entry.seq + 1 }, KEY)).toBe(false);
    expect(verifyChainEntry(entry, `${'A'.repeat(43)}=`)).toBe(false);
  });

  it('takes the key as 32 bytes in base64 only', () => {
    expect(() => hmacSha256Hex('AAEC', 'x')).toThrow('The HMAC key must be 32 bytes in base64');
    expect(() => hmacSha256Hex(chainVectors.key_hex, 'x')).toThrow('The HMAC key must be 32 bytes in base64');
  });
});
