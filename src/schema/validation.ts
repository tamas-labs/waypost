// Validation against the JSON Schemas of @waypost/schema (Ajv, draft 2020-12): of the chain entries in every build,
// of the API requests and responses in development builds only. The schemas are compiled on first use.
// A tolerant check besides the strict one: it drops the fields the schemas do not know instead of failing on them, so a
// field a newer server adds (a minor version, server first) does not break an older app; the rest is checked as strict.
import { schemaId, schemas, type SchemaPath } from '@waypost/schema';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

interface Checker {
  ajv: Ajv2020 | null;
  validators: Map<SchemaPath, ValidateFunction>;
  removeAdditional: boolean;
}

const strict: Checker = { ajv: null, validators: new Map(), removeAdditional: false };
const tolerant: Checker = { ajv: null, validators: new Map(), removeAdditional: true };

function validator(checker: Checker, path: SchemaPath): ValidateFunction {
  let validate = checker.validators.get(path);
  if (validate === undefined) {
    if (checker.ajv === null) {
      checker.ajv = new Ajv2020({
        allErrors: true,
        strict: true,
        strictTypes: true,
        strictTuples: true,
        strictRequired: false,
        removeAdditional: checker.removeAdditional,
      });
      addFormats(checker.ajv);
      for (const schema of Object.values(schemas)) checker.ajv.addSchema(schema);
    }
    validate = checker.ajv.getSchema(schemaId(path));
    if (validate === undefined) throw new Error(`Schema not found: ${path}`);
    checker.validators.set(path, validate);
  }
  return validate;
}

function describe(error: ErrorObject): string {
  return `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`;
}

function errorsOf(validate: ValidateFunction, value: unknown): string[] {
  return validate(value) ? [] : (validate.errors ?? []).map(describe);
}

/** The schema errors of a value; empty if it is valid. */
export function schemaErrors(path: SchemaPath, value: unknown): string[] {
  return errorsOf(validator(strict, path), value);
}

/**
 * The schema errors of a value apart from the properties the schemas do not know, which it removes from the value
 * (where the schema has additionalProperties: false); empty if the rest is valid.
 */
export function tolerantSchemaErrors(path: SchemaPath, value: unknown): string[] {
  return errorsOf(validator(tolerant, path), value);
}
