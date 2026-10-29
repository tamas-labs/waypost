import { chainVectors } from '@waypost/schema/vectors';

import { canonicalJson, CanonicalJsonError } from './canonical-json';

describe('canonicalJson', () => {
  it.each(chainVectors.cases.map((vector) => [vector.name, vector] as const))('matches the shared vector %s byte for byte', (_name, vector) => {
    expect(canonicalJson(vector.input)).toBe(vector.canonical_json);
  });

  it('matches the linked chain of the shared vectors', () => {
    for (const vector of chainVectors.chain.entries) expect(canonicalJson(vector.input)).toBe(vector.canonical_json);
  });

  it('sorts keys by UTF-16 code units at every level and writes no whitespace', () => {
    expect(canonicalJson({ b: [{ z: 1, a: null }], a: true, '\u{1f600}': 1, '￿': 2, B: 'x' })).toBe('{"B":"x","a":true,"b":[{"a":null,"z":1}],"😀":1,"￿":2}');
    expect(canonicalJson([])).toBe('[]');
    expect(canonicalJson({})).toBe('{}');
  });

  it('escapes only quote, backslash and control characters, like JSON.stringify', () => {
    const text = 'a"b\\c\b\f\n\r\t\u0000\u001f\u007f/é  😀';
    expect(canonicalJson(text)).toBe('"a\\"b\\\\c\\b\\f\\n\\r\\t\\u0000\\u001f\u007f/é  😀"');
    expect(canonicalJson(text)).toBe(JSON.stringify(text));
  });

  it('writes integers as plain digits, -0 as 0', () => {
    expect(canonicalJson([0, -0, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 1e21 / 1e6])).toBe('[0,0,-1,9007199254740991,-9007199254740991,1000000000000000]');
  });

  it.each([
    ['a floating-point number', { lat: 47.4979 }, '/lat: floating-point number not allowed: 47.4979'],
    ['NaN', [Number.NaN], '/0: floating-point number not allowed: NaN'],
    ['Infinity', Number.POSITIVE_INFINITY, '/: floating-point number not allowed: Infinity'],
    ['an unsafe integer', { a: { b: 2 ** 53 } }, '/a/b: integer outside ±(2^53 − 1): 9007199254740992'],
    ['a lone high surrogate', 'x\ud83d', '/: string contains a lone surrogate'],
    ['a lone low surrogate', ['\ude00x'], '/0: string contains a lone surrogate'],
    ['a lone surrogate in a key', { '\ud83d': 1 }, '/: string contains a lone surrogate'],
    ['undefined', { a: undefined }, '/a: undefined is not a JSON value'],
    ['a Date', { at: new Date(0) }, '/at: only plain objects are allowed'],
    ['a bigint', 1n, '/: bigint is not a JSON value'],
    ['a function', [() => 1], '/0: function is not a JSON value'],
  ])('rejects %s', (_name, value, message) => {
    expect(() => canonicalJson(value)).toThrow(new CanonicalJsonError(message));
  });

  it('accepts objects without a prototype', () => {
    const value = Object.assign(Object.create(null) as object, { b: 1, a: 2 });
    expect(canonicalJson(value)).toBe('{"a":2,"b":1}');
  });
});
