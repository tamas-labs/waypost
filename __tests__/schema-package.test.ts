// @waypost/schema comes from file:../waypost-schema (a symlink, ES modules only): Jest must load it.
import { SCHEMA_VERSION, schemaId, schemas, type SchemaPath } from '@waypost/schema';
import { version } from '@waypost/schema/package.json';
import { chainVectors, scheduleVectors } from '@waypost/schema/vectors';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('../waypost-schema is checked out at the tag in .waypost-schema-version', () => {
  const pinned = readFileSync(join(__dirname, '..', '.waypost-schema-version'), 'utf8').trim();
  expect(`v${version}`).toBe(pinned);
  expect(`v${SCHEMA_VERSION}`).toBe(pinned);
});

test('the schemas are importable', () => {
  const path: SchemaPath = 'api/sync-pull.response';
  expect(schemas[path].$id).toBe(schemaId(path));
  expect(Object.keys(schemas).length).toBeGreaterThanOrEqual(35);
});

test('the test vectors are importable', () => {
  expect(chainVectors.key_hex).toHaveLength(64);
  expect(scheduleVectors.expansion.length).toBeGreaterThan(0);
});
