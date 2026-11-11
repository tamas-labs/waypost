// The compatibility rule of a minor version (waypost-schema decisions, "Kompatibilitás a verziók között"), tried on the
// contract's own examples (audit FR-017): what a newer server may add – a field, a value of an enum – keeps every valid
// response example valid for the tolerant check. A schema that the rule does not hold for (e.g. one closed with
// unevaluatedProperties, which the tolerant check does not trim) fails here, not in the field after the next release.
import fs from 'node:fs';
import path from 'node:path';

import type { SchemaPath } from '@waypost/schema';

import { schemaErrors, tolerantSchemaErrors } from './validation';

const EXAMPLES = path.join(path.dirname(require.resolve('@waypost/schema')), '..', 'examples');
const UNKNOWN_FIELD = 'added_in_a_later_version';
const UNKNOWN_VALUE = 'added_in_a_later_version';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The valid examples of the API responses: [schema path, file name, value]. */
function responseExamples(): [SchemaPath, string, Json][] {
  const api = path.join(EXAMPLES, 'api');
  return fs
    .readdirSync(api)
    .filter((name) => name.endsWith('.response'))
    .flatMap((name) => {
      const valid = path.join(api, name, 'valid');
      if (!fs.existsSync(valid)) return [];
      return fs
        .readdirSync(valid)
        .filter((file) => file.endsWith('.json'))
        .map((file): [SchemaPath, string, Json] => [
          `api/${name}` as SchemaPath,
          file,
          JSON.parse(fs.readFileSync(path.join(valid, file), 'utf8')) as Json,
        ]);
    });
}

const examples = responseExamples();

/** The value with the unknown field added to every object in it. */
function withUnknownFields(value: Json): Json {
  if (Array.isArray(value)) return value.map(withUnknownFields);
  if (value === null || typeof value !== 'object') return value;
  const copy: { [key: string]: Json } = { [UNKNOWN_FIELD]: 'x' };
  for (const [key, field] of Object.entries(value)) copy[key] = withUnknownFields(field);
  return copy;
}

/** Every copy of the value with one of its strings replaced by the unknown value. */
function withOneStringReplaced(value: Json): Json[] {
  if (typeof value === 'string') return [UNKNOWN_VALUE];
  if (Array.isArray(value))
    return value.flatMap((item, i) => withOneStringReplaced(item).map((next) => value.map((old, j) => (i === j ? next : old))));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, field]) => withOneStringReplaced(field).map((next) => ({ ...value, [key]: next })));
}

/** Strings whose only fault in the strict check is that their enum does not list them: the values of an enum. */
function withUnknownEnumValues(schema: SchemaPath, value: Json): Json[] {
  return withOneStringReplaced(value).filter((changed) => {
    const errors = schemaErrors(schema, changed);
    return errors.length > 0 && errors.every((error) => error.endsWith('must be equal to one of the allowed values'));
  });
}

describe('a newer minor version of the contract, as the tolerant check sees it', () => {
  it('finds the examples of the responses', () => {
    expect(examples.length).toBeGreaterThan(20);
  });

  it.each(examples)('%s %s with a field added to every object', (schema, _file, value) => {
    expect(schemaErrors(schema, value)).toEqual([]);
    expect(tolerantSchemaErrors(schema, withUnknownFields(value))).toEqual([]);
  });

  it.each(examples)('%s %s with a value added to its enums', (schema, _file, value) => {
    for (const changed of withUnknownEnumValues(schema, value)) expect(tolerantSchemaErrors(schema, changed)).toEqual([]);
  });

  it('tries an enum value in the responses at all', () => {
    expect(examples.some(([schema, , value]) => withUnknownEnumValues(schema, value).length > 0)).toBe(true);
  });
});
