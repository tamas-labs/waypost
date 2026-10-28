import type { ErrorCode, ErrorResponse } from '@waypost/schema';

type ErrorDetails = NonNullable<ErrorResponse['error']['details']>;

/** A non-2xx response of the API, in its error format (api/error.json). */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    /** Per-field messages of validation_failed (Hungarian). */
    readonly details: ErrorDetails | null = null,
    /** Seconds from the Retry-After header (429, 503). */
    readonly retryAfterS: number | null = null,
    /** False if the body was not in the error format (e.g. a proxy page); code then comes from the status. */
    readonly fromServer = true,
  ) {
    super(message);
  }
}

/** The request did not get a response: no network, DNS, TLS, or the timeout elapsed. */
export class NetworkError extends Error {
  override readonly name = 'NetworkError';

  constructor(
    readonly timedOut: boolean,
    options?: { cause?: unknown },
  ) {
    super(timedOut ? 'The request timed out' : 'Network request failed', options);
  }
}

/** A 2xx response that is not what the contract says: not JSON, or (in development) not valid against its schema. */
export class InvalidResponseError extends Error {
  override readonly name = 'InvalidResponseError';

  constructor(
    readonly status: number,
    message: string,
    /** Schema errors, e.g. "/changes/sites/0/id must match pattern …". */
    readonly errors: string[] = [],
  ) {
    super(message);
  }
}

export function isApiError(error: unknown, code?: ErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** The error code of a response whose body is not in the error format. */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 422:
      return 'validation_failed';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'server_error' : 'bad_request';
  }
}
