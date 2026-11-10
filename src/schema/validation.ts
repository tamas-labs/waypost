// Validation against the JSON Schemas of @waypost/schema (Ajv, draft 2020-12): of the chain entries in every build,
// of the API requests and responses in development builds only. The schemas are compiled on first use.
// A tolerant check besides the strict one, for what a newer server may add in a minor version (server first): it drops
// the fields the schemas do not know, and takes a string value an enum does not list, instead of failing on them; the
// caller handles such a value on its fallback branch (waypost-schema decisions, "Kompatibilitás a verziók között"). The
// rest is checked as strict.
import { schemaId, schemas, type SchemaPath } from '@waypost/schema';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

interface Checker {
  ajv: Ajv2020 | null;
  validators: Map<SchemaPath, ValidateFunction>;
  tolerant: boolean;
}

const strict: Checker = { ajv: null, validators: new Map(), tolerant: false };
const tolerant: Checker = { ajv: null, validators: new Map(), tolerant: true };

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
        removeAdditional: checker.tolerant,
        // The value of each error, to tell an unknown enum value from one of a wrong type.
        verbose: checker.tolerant,
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

/** A string an enum does not list: a value a newer version may have added. */
function isUnknownEnumValue(error: ErrorObject): boolean {
  return error.keyword === 'enum' && typeof error.data === 'string';
}

function errorsOf(checker: Checker, path: SchemaPath, value: unknown): string[] {
  const validate = validator(checker, path);
  if (validate(value)) return [];
  const errors = validate.errors ?? [];
  return (checker.tolerant ? errors.filter((error) => !isUnknownEnumValue(error)) : errors).map(describe);
}

/** The schema errors of a value; empty if it is valid. */
export function schemaErrors(path: SchemaPath, value: unknown): string[] {
  return errorsOf(strict, path, value);
}

/**
 * The schema errors of a value apart from the properties the schemas do not know, which it removes from the value
 * (where the schema has additionalProperties: false), and the strings an enum does not list; empty if the rest is valid.
 */
export function tolerantSchemaErrors(path: SchemaPath, value: unknown): string[] {
  return errorsOf(tolerant, path, value);
}
