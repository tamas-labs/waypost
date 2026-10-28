import type { SyncPullResponse } from '@waypost/schema';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createApiClient } from './client';
import { enrollDevice, login, pull } from './endpoints';
import { ApiError, InvalidResponseError, isApiError, NetworkError } from './errors';

const EXAMPLES = join(dirname(require.resolve('@waypost/schema/package.json')), 'examples', 'api');
const example = <T = Record<string, unknown>>(path: string): T => JSON.parse(readFileSync(join(EXAMPLES, `${path}.json`), 'utf8')) as T;

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE_URL = 'https://waypost.example/api/waypost/v1';

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () => new Response(text, { status, headers }));
}

function sentRequest(fetchMock: jest.Mock) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

describe('API client', () => {
  it('sends a GET with the Bearer token and the query, and returns the typed response', async () => {
    const body = example<SyncPullResponse>('sync-pull.response/valid/full-state');
    const fetchMock = respond(200, body);
    const api = createApiClient({ baseUrl: `${BASE_URL}/`, fetch: fetchMock });

    const result = await pull(api, 'device-token', '2026-10-27T10:00:00.000Z_01JB');

    expect(result).toEqual(body);
    const { url, init, headers } = sentRequest(fetchMock);
    expect(url).toBe(`${BASE_URL}/sync/pull?cursor=2026-10-27T10%3A00%3A00.000Z_01JB`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer device-token' });
  });

  it('leaves out an empty cursor', async () => {
    const fetchMock = respond(200, example('sync-pull.response/valid/full-state'));
    await pull(createApiClient({ baseUrl: BASE_URL, fetch: fetchMock }), 'device-token', null);
    expect(sentRequest(fetchMock).url).toBe(`${BASE_URL}/sync/pull`);
  });

  it('sends an Idempotency-Key with every write: a new UUIDv7, or the given one', async () => {
    const fetchMock = respond(200, example('devices-enroll.response/valid/enrolled'));
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock });
    const body = example<Parameters<typeof enrollDevice>[2]>('devices-enroll.request/valid/android');

    await enrollDevice(api, 'supervisor-token', body);
    const first = sentRequest(fetchMock);
    expect(first.init.method).toBe('POST');
    expect(JSON.parse(first.init.body as string)).toEqual(body);
    expect(first.headers['Content-Type']).toBe('application/json');
    expect(first.headers.Authorization).toBe('Bearer supervisor-token');
    expect(first.headers['Idempotency-Key']).toMatch(UUID_V7);

    const deleteMock = respond(200, { server_time: '2026-10-27T10:05:12.345Z' });
    await createApiClient({ baseUrl: BASE_URL, fetch: deleteMock }).request({
      method: 'DELETE',
      path: '/checkpoints/x',
      token: 'device-token',
      idempotencyKey: '01900000-0000-7000-8000-000000000001',
      actingUserId: '01900000-0000-7000-8000-0000000000a1',
      responseSchema: 'api/auth-logout.response',
    });
    expect(sentRequest(deleteMock).headers).toMatchObject({
      'Idempotency-Key': '01900000-0000-7000-8000-000000000001',
      'X-Acting-User': '01900000-0000-7000-8000-0000000000a1',
    });
  });

  it('turns 401 unauthenticated into a typed error', async () => {
    const api = createApiClient({ baseUrl: BASE_URL, fetch: respond(401, example('error/valid/unauthenticated-minimal')) });
    const error = await login(api, { email: 'anna@example.com', password: 'wrong', device_name: 'Pixel 8' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'unauthenticated', fromServer: true });
    expect(isApiError(error, 'unauthenticated')).toBe(true);
    expect(isApiError(error, 'device_revoked')).toBe(false);
  });

  it('tells device_revoked apart from an expired token', async () => {
    const api = createApiClient({ baseUrl: BASE_URL, fetch: respond(401, example('error/valid/device-revoked')) });
    const error = await pull(api, 'device-token', null).catch((e: unknown) => e);
    expect(isApiError(error, 'device_revoked')).toBe(true);
    expect(error).toMatchObject({ status: 401, message: 'Ezt a telefont visszavonták.' });
  });

  it('keeps the field messages of 422 validation_failed', async () => {
    const body = example<{ error: { details: unknown } }>('error/valid/validation-failed-with-details');
    const api = createApiClient({ baseUrl: BASE_URL, fetch: respond(422, body) });
    const error = await pull(api, 'device-token', 'bad').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 422, code: 'validation_failed', details: body.error.details });
  });

  it('reads Retry-After of 429 rate_limited', async () => {
    const api = createApiClient({ baseUrl: BASE_URL, fetch: respond(429, example('error/valid/rate-limited'), { 'Retry-After': '30' }) });
    expect(await pull(api, 'device-token', null).catch((e: unknown) => e)).toMatchObject({ code: 'rate_limited', retryAfterS: 30 });
  });

  it('derives the code from the status if the body is not in the error format', async () => {
    const api = createApiClient({ baseUrl: BASE_URL, fetch: respond(502, '<html>Bad Gateway</html>') });
    expect(await pull(api, 'device-token', null).catch((e: unknown) => e)).toMatchObject({ status: 502, code: 'server_error', fromServer: false });
    const notFound = createApiClient({ baseUrl: BASE_URL, fetch: respond(404, { message: 'Not Found' }) });
    expect(await pull(notFound, 'device-token', null).catch((e: unknown) => e)).toMatchObject({ code: 'not_found', fromServer: false });
  });

  it('rejects a response that does not match its schema in development mode', async () => {
    const body = { ...example('sync-pull.response/valid/full-state'), has_more: 'no' };
    const api = createApiClient({ baseUrl: BASE_URL, fetch: respond(200, body), validate: true });
    const error = await pull(api, 'device-token', null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidResponseError);
    expect((error as InvalidResponseError).errors).toContain('/has_more must be boolean');
  });

  it('validates by default in development mode, and not otherwise', async () => {
    const body = { server_time: '2026-10-27T10:05:12.345Z' };
    expect(await pull(createApiClient({ baseUrl: BASE_URL, fetch: respond(200, body) }), 't', null).catch((e: unknown) => e)).toBeInstanceOf(InvalidResponseError);
    expect(await pull(createApiClient({ baseUrl: BASE_URL, fetch: respond(200, body), validate: false }), 't', null)).toEqual(body);
  });

  it('rejects a response that is not JSON', async () => {
    const api = createApiClient({ baseUrl: BASE_URL, fetch: respond(200, 'OK'), validate: false });
    expect(await pull(api, 'device-token', null).catch((e: unknown) => e)).toBeInstanceOf(InvalidResponseError);
  });

  it('checks the request body in development mode before sending it', async () => {
    const fetchMock = respond(200, {});
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock });
    await expect(login(api, { email: 'not an e-mail', password: 'x', device_name: 'Pixel 8' })).rejects.toThrow(/auth-login\.request/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns a failed fetch into a NetworkError', async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const error = await pull(createApiClient({ baseUrl: BASE_URL, fetch: fetchMock }), 't', null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ timedOut: false });
  });

  it('gives up after the timeout', async () => {
    const fetchMock = jest.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const error = await pull(createApiClient({ baseUrl: BASE_URL, fetch: fetchMock, timeoutMs: 10 }), 't', null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ timedOut: true });
  });

  it('rejects an invalid base URL', () => {
    expect(() => createApiClient({ baseUrl: 'waypost.example' })).toThrow('Invalid API base URL');
  });
});
