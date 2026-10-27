// @waypost/schema comes from file:../waypost-schema (a symlink, ES modules only): Jest must load it.
import { schemaId, schemas, type SchemaPath } from '@waypost/schema';
import { chainVectors, scheduleVectors } from '@waypost/schema/vectors';

test('the schemas are importable', () => {
  const path: SchemaPath = 'api/sync-pull.response';
  expect(schemas[path].$id).toBe(schemaId(path));
  expect(Object.keys(schemas).length).toBeGreaterThanOrEqual(35);
});

test('the test vectors are importable', () => {
  expect(chainVectors.key_hex).toHaveLength(64);
  expect(scheduleVectors.expansion.length).toBeGreaterThan(0);
});
