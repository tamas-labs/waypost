// RFC 8785 JSON Canonicalization Scheme (JCS), restricted to what Waypost allows in hashed data (waypost-schema
// docs/decisions.md, "A kanonikus JSON pontos szabályai"; reference: scripts/jcs.js of @waypost/schema):
//
// - numbers are integers within ±(2^53 − 1) only, so no floating-point formatting is ever needed;
// - object keys sorted by UTF-16 code units at every level, no whitespace;
// - strings as ECMAScript JSON.stringify writes them: only ", \ and U+0000–U+001F are escaped (\b \t \n \f \r,
//   otherwise \u00xx lowercase); '/', non-ASCII characters and U+2028/U+2029 stay literal;
// - strings must be well-formed UTF-16 (no lone surrogates), as I-JSON requires.
//
// Strings are escaped here rather than with JSON.stringify, so the output does not depend on the JS engine (Hermes).

export class CanonicalJsonError extends Error {
  override name = 'CanonicalJsonError';
}

const SHORT_ESCAPES: Partial<Record<number, string>> = { 0x08: '\\b', 0x09: '\\t', 0x0a: '\\n', 0x0c: '\\f', 0x0d: '\\r', 0x22: '\\"', 0x5c: '\\\\' };

function fail(path: string, message: string): never {
  throw new CanonicalJsonError(`${path === '' ? '/' : path}: ${message}`);
}

function serializeString(value: string, path: string): string {
  let out = '"';
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdfff) {
      const next = value.charCodeAt(i + 1);
      if (unit > 0xdbff || !(next >= 0xdc00 && next <= 0xdfff)) fail(path, 'string contains a lone surrogate');
      i++;
      continue;
    }
    if (unit >= 0x20 && unit !== 0x22 && unit !== 0x5c) continue;
    out += value.slice(start, i) + (SHORT_ESCAPES[unit] ?? `\\u${unit.toString(16).padStart(4, '0')}`);
    start = i + 1;
  }
  return `${out}${value.slice(start)}"`;
}

function serialize(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isInteger(value)) fail(path, `floating-point number not allowed: ${value}`);
      if (!Number.isSafeInteger(value)) fail(path, `integer outside ±(2^53 − 1): ${value}`);
      return Object.is(value, -0) ? '0' : String(value);
    case 'string':
      return serializeString(value, path);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((item, i) => serialize(item, `${path}/${i}`)).join(',')}]`;
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) fail(path, 'only plain objects are allowed');
      const record = value as Record<string, unknown>;
      const members = Object.keys(record)
        .sort()
        .map((key) => {
          const member = record[key];
          if (member === undefined) fail(`${path}/${key}`, 'undefined is not a JSON value');
          return `${serializeString(key, path)}:${serialize(member, `${path}/${key}`)}`;
        });
      return `{${members.join(',')}}`;
    }
    default:
      return fail(path, `${typeof value} is not a JSON value`);
  }
}

/** The canonical JSON text of a value; throws CanonicalJsonError for anything hashed data may not contain. */
export function canonicalJson(value: unknown): string {
  return serialize(value, '');
}
