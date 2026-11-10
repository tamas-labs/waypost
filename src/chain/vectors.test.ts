// The raw entry texts of the shared chain vectors (normalized, invalid), checked as a verifier would: JSON.parse, the
// chain schema and the photo rule of the writer, the canonical JSON and the HMAC. The app signs its own entries only,
// but these are the same steps, and the vectors guard their edge cases (waypost-schema SCH-003).
import type { ChainEntry } from '@waypost/schema';
import { chainVectors } from '@waypost/schema/vectors';

import { schemaErrors } from '@/schema/validation';

import { canonicalJson } from './canonical-json';
import { chainHash, verifyChainEntry } from './hmac';
import { repeatedPhotoErrors } from './media';

const KEY = chainVectors.key_base64;

type Verdict = 'ok' | 'invalid' | 'bad_hmac';

function verify(entryJson: string): Verdict {
  const entry = JSON.parse(entryJson) as ChainEntry;
  const errors = schemaErrors('chain/entry', entry);
  if (errors.length > 0 || repeatedPhotoErrors(entry).length > 0) return 'invalid';
  const { hash: _hash, ...unsigned } = entry;
  try {
    canonicalJson(unsigned);
  } catch {
    return 'invalid';
  }
  return verifyChainEntry(entry, KEY) ? 'ok' : 'bad_hmac';
}

describe('the raw entry texts of the shared vectors', () => {
  it.each(chainVectors.normalized.cases.map((vector) => [vector.name, vector] as const))(
    'decodes %s to the entry of its canonical JSON and hash',
    (_name, vector) => {
      expect(verify(vector.entry_json)).toBe('ok');
      const { hash, ...unsigned } = JSON.parse(vector.entry_json) as ChainEntry;
      expect(canonicalJson(unsigned)).toBe(vector.canonical_json);
      expect(chainHash(unsigned, KEY)).toBe(vector.hash);
      expect(hash).toBe(vector.hash);
    },
  );

  it.each(chainVectors.invalid.cases.map((vector) => [vector.name, vector] as const))(
    'refuses %s as the vector expects',
    (_name, vector) => {
      expect(verify(vector.entry_json)).toBe(vector.expected);
    },
  );

  it('has cases of both kinds', () => {
    expect(chainVectors.normalized.cases.length).toBeGreaterThan(0);
    expect(new Set(chainVectors.invalid.cases.map((vector) => vector.expected))).toEqual(new Set(['invalid', 'bad_hmac']));
  });
});
