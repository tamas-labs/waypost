// HTTP client of the Waypost API: Bearer token, Idempotency-Key on every write, the error format as typed errors,
// and in development builds a check of every request and response against @waypost/schema.
import type { ErrorCode, ErrorResponse, SchemaPath, SchemaTypes } from '@waypost/schema';

import { uuidv7 } from '@/id/uuidv7';

import { ApiError, codeForStatus, InvalidResponseError, NetworkError } from './errors';
import { schemaErrors } from './validation';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequest<P extends SchemaPath> {
  method: HttpMethod;
  /** Path below the base URL, e.g. "/sync/pull". */
  path: string;
  query?: Record<string, string | null | undefined>;
  body?: unknown;
  /** Schema of the body, checked in development builds. */
  bodySchema?: SchemaPath;
  /** Schema of the 2xx response; it also gives the result type. */
  responseSchema: P;
  /** Bearer token; none for the login. */
  token?: string | null;
  /** Writes only. A new UUIDv7 if not given; the outbox passes its stored key so that a retry is recognised. */
  idempotencyKey?: string;
  /** Supervisor acting on the site phone with the device token (X-Acting-User). */
  actingUserId?: string | null;
}

export interface ApiResponse<T> {
  status: number;
  data: T;
}

export interface ApiClientOptions {
  /** e.g. https://example.com/api/waypost/v1 */
  baseUrl: string;
  fetch?: typeof fetch;
  /** Default: in development builds (__DEV__). */
  validate?: boolean;
  /** Default: 30 s. */
  timeoutMs?: number;
}

export interface ApiClient {
  readonly baseUrl: string;
  request<P extends SchemaPath>(request: ApiRequest<P>): Promise<ApiResponse<SchemaTypes[P]>>;
}

const ERROR_CODES: ReadonlySet<string> = new Set<ErrorCode>([
  'unauthenticated',
  'device_revoked',
  'forbidden',
  'not_found',
  'validation_failed',
  'conflict',
  'chain_gap',
  'chain_fork',
  'bad_hmac',
  'rate_limited',
  'bad_request',
  'server_error',
]);

function isErrorBody(body: unknown): body is ErrorResponse {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const error = (body as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    ERROR_CODES.has((error as { code: string }).code) &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

function retryAfter(headers: Headers): number | null {
  const value = headers.get('Retry-After');
  if (value === null) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+/.test(baseUrl)) throw new Error(`Invalid API base URL: ${options.baseUrl}`);
  const doFetch = options.fetch ?? fetch;
  const validate = options.validate ?? __DEV__;
  const timeoutMs = options.timeoutMs ?? 30_000;

  async function request<P extends SchemaPath>(req: ApiRequest<P>): Promise<ApiResponse<SchemaTypes[P]>> {
    if (validate && req.bodySchema !== undefined) {
      const errors = schemaErrors(req.bodySchema, req.body);
      if (errors.length > 0) throw new Error(`Request body of ${req.method} ${req.path} is invalid against ${req.bodySchema}: ${errors.join('; ')}`);
    }

    const query = Object.entries(req.query ?? {}).filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== undefined);
    const url = `${baseUrl}${req.path}${query.length > 0 ? `?${new URLSearchParams(query).toString()}` : ''}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (req.body !== undefined) headers['Content-Type'] = 'application/json';
    if (req.token) headers.Authorization = `Bearer ${req.token}`;
    if (req.method !== 'GET') headers['Idempotency-Key'] = req.idempotencyKey ?? uuidv7();
    if (req.actingUserId) headers['X-Acting-User'] = req.actingUserId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let text: string;
    try {
      response = await doFetch(url, {
        method: req.method,
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      });
      text = await response.text();
    } catch (error) {
      throw new NetworkError(controller.signal.aborted, { cause: error });
    } finally {
      clearTimeout(timer);
    }

    let body: unknown;
    let parsed = true;
    try {
      body = JSON.parse(text);
    } catch {
      parsed = false;
    }

    if (!response.ok) {
      if (parsed && isErrorBody(body)) {
        const { code, message, details } = body.error;
        throw new ApiError(response.status, code, message, details ?? null, retryAfter(response.headers));
      }
      throw new ApiError(response.status, codeForStatus(response.status), `HTTP ${response.status}`, null, retryAfter(response.headers), false);
    }

    if (!parsed) throw new InvalidResponseError(response.status, `${req.method} ${req.path}: the response is not JSON`);
    if (validate) {
      const errors = schemaErrors(req.responseSchema, body);
      if (errors.length > 0) {
        throw new InvalidResponseError(response.status, `${req.method} ${req.path}: the response is invalid against ${req.responseSchema}`, errors);
      }
    }
    return { status: response.status, data: body as SchemaTypes[P] };
  }

  return { baseUrl, request };
}
