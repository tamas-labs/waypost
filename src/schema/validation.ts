// Validation against the JSON Schemas of @waypost/schema (Ajv, draft 2020-12). Used in development builds only:
// the schemas are compiled on first use.
import { schemaId, schemas, type SchemaPath } from '@waypost/schema';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

let ajv: Ajv2020 | null = null;
const validators = new Map<SchemaPath, ValidateFunction>();

function validator(path: SchemaPath): ValidateFunction {
  let validate = validators.get(path);
  if (validate === undefined) {
    if (ajv === null) {
      ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: true, strictTuples: true, strictRequired: false });
      addFormats(ajv);
      for (const schema of Object.values(schemas)) ajv.addSchema(schema);
    }
    validate = ajv.getSchema(schemaId(path));
    if (validate === undefined) throw new Error(`Schema not found: ${path}`);
    validators.set(path, validate);
  }
  return validate;
}

function describe(error: ErrorObject): string {
  return `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`;
}

/** The schema errors of a value; empty if it is valid. */
export function schemaErrors(path: SchemaPath, value: unknown): string[] {
  const validate = validator(path);
  return validate(value) ? [] : (validate.errors ?? []).map(describe);
}
