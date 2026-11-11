// The app's route table against the contract's (@waypost/schema endpoints.json, SCH-006): every call of endpoints.ts
// and config-calls.ts is an endpoint there, with the same method, request and response schema, the query parameters
// of its query schema, and the Idempotency-Key where the endpoint requires one.
import { endpoints, schemas, type Endpoint, type SchemaPath } from '@waypost/schema';

import type { ApiClient, ApiRequest } from './client';
import { configCalls, type ConfigCall } from './config-calls';
import * as calls from './endpoints';

const ID = '019a2b3c-4d5e-7f00-8a00-000000000001';
const OTHER_ID = '019a2b3c-4d5e-7f00-8a00-000000000002';

/** The request an endpoints.ts function makes, with a client that only records it. */
async function requestOf(call: (api: ApiClient) => Promise<unknown>): Promise<ApiRequest<SchemaPath>> {
  const made: ApiRequest<SchemaPath>[] = [];
  const api: ApiClient = {
    baseUrl: 'https://waypost.example/api/waypost/v1',
    request: async (request) => {
      made.push(request as ApiRequest<SchemaPath>);
      return { status: 200, data: {} as never };
    },
  };
  await call(api);
  expect(made).toHaveLength(1);
  return made[0]!;
}

/** The endpoint of a method and a concrete path ("/sites/0192…" is "/sites/{site}"). */
function endpointOf(method: string, path: string): Endpoint {
  const found = endpoints.endpoints.filter((endpoint) => {
    const pattern = new RegExp(`^${endpoint.path.replace(/\{[a-z_]+\}/g, '[^/]+')}$`);
    return endpoint.method === method && pattern.test(path);
  });
  expect(found.map((endpoint) => endpoint.name)).toHaveLength(1);
  return found[0]!;
}

/** The schemas of the success responses (a create: 200 when repeated, 201 when new; the same schema). */
const responseSchemas = (endpoint: Endpoint) => [...new Set(Object.values(endpoint.responses).map((response) => response.schema))];

/** The parameters a query schema allows. */
function queryParameters(schema: SchemaPath): string[] {
  const definition = schemas[schema] as { properties?: Record<string, unknown> };
  return Object.keys(definition.properties ?? {});
}

const blob = {} as Blob;

const endpointCalls: [string, (api: ApiClient) => Promise<unknown>][] = [
  ['login', (api) => calls.login(api, { email: 'a@example.com', password: 'secret', device_name: 'Telefon' })],
  ['logout', (api) => calls.logout(api, 'token')],
  ['listSites', (api) => calls.listSites(api, 'token')],
  ['enrollDevice', (api) => calls.enrollDevice(api, 'token', { site_id: ID, name: 'Telefon' } as never)],
  ['pull', (api) => calls.pull(api, 'token', 'cursor')],
  ['push', (api) => calls.push(api, 'token', { device_id: ID, entries: [] } as never)],
  ['pushFinal', (api) => calls.pushFinal(api, 'token', { device_id: ID, entries: [], done: true } as never)],
  ['uploadMedia', (api) => calls.uploadMedia(api, 'token', ID, {} as never, blob)],
  ['reportDiagnostic', (api) => calls.reportDiagnostic(api, 'token', {} as never)],
];

describe('the route table of endpoints.ts', () => {
  it('covers every call the module exports', () => {
    const exported = Object.entries(calls)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .sort();
    expect(endpointCalls.map(([name]) => name).sort()).toEqual(exported);
  });

  it.each(endpointCalls)('%s is an endpoint of the contract, with its schemas', async (_name, call) => {
    const request = await requestOf(call);
    const endpoint = endpointOf(request.method, request.path);

    expect(request.bodySchema ?? null).toBe(endpoint.request?.schema ?? null);
    expect(request.form !== undefined).toBe(endpoint.request?.content_type === 'multipart/form-data');
    expect(responseSchemas(endpoint)).toEqual([request.responseSchema]);
    // The client sends an Idempotency-Key with every request but a GET.
    if (endpoint.idempotency_key) expect(request.method).not.toBe('GET');
    for (const parameter of Object.keys(request.query ?? {})) {
      expect(endpoint.query).not.toBeNull();
      expect(queryParameters(endpoint.query!)).toContain(parameter);
    }
  });
});

const configCallCases = Object.entries({
  createSite: () => configCalls.createSite({ id: ID } as never),
  updateSite: () => configCalls.updateSite(ID, {} as never),
  deleteSite: () => configCalls.deleteSite(ID),
  attachSiteUser: () => configCalls.attachSiteUser(ID, { user_id: OTHER_ID } as never),
  detachSiteUser: () => configCalls.detachSiteUser(ID, OTHER_ID),
  createUser: () => configCalls.createUser({ id: ID } as never),
  updateUser: () => configCalls.updateUser(ID, {} as never),
  setUserPin: () => configCalls.setUserPin(ID, {} as never),
  deleteUser: () => configCalls.deleteUser(ID),
  createCheckpoint: () => configCalls.createCheckpoint({ id: ID } as never),
  updateCheckpoint: () => configCalls.updateCheckpoint(ID, {} as never),
  deleteCheckpoint: () => configCalls.deleteCheckpoint(ID),
  uploadCheckpointPhoto: () => configCalls.uploadCheckpointPhoto(ID, { owner_type: 'checkpoint' } as never),
  createRoute: () => configCalls.createRoute({ id: ID } as never),
  updateRoute: () => configCalls.updateRoute(ID, {} as never),
  deleteRoute: () => configCalls.deleteRoute(ID),
  createRouteVersion: () => configCalls.createRouteVersion(ID, { id: OTHER_ID } as never),
  createSchedule: () => configCalls.createSchedule({ id: ID } as never),
  updateSchedule: () => configCalls.updateSchedule(ID, {} as never),
  deleteSchedule: () => configCalls.deleteSchedule(ID),
  createReportSubscription: () => configCalls.createReportSubscription({ id: ID } as never),
  updateReportSubscription: () => configCalls.updateReportSubscription(ID, {} as never),
  deleteReportSubscription: () => configCalls.deleteReportSubscription(ID),
} satisfies Record<keyof typeof configCalls, () => ConfigCall>);

describe('the configuration calls of the outbox', () => {
  it.each(configCallCases)('%s is an endpoint of the contract, with its schemas', (_name, make) => {
    const call = make();
    const endpoint = endpointOf(call.method, call.path);

    expect(call.bodySchema ?? null).toBe(endpoint.request?.schema ?? null);
    expect(call.mediaId !== undefined).toBe(endpoint.request?.content_type === 'multipart/form-data');
    expect(responseSchemas(endpoint)).toEqual([call.responseSchema]);
    // The outbox sends its stored Idempotency-Key with every call.
    expect(endpoint.idempotency_key).toBe(true);
  });
});
