// Test helper: the API answering from a queue, its requests recorded, with its responses checked against the schema.
import { createApiClient } from '@/api/client';

export const BASE_URL = 'https://waypost.example/api/waypost/v1';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  /** The JSON body, or the text fields of a multipart body. */
  body: unknown;
  /** The file part of a multipart body. */
  file: unknown;
}

/** An answer: a JSON body with 200, a [status, body] pair (with headers), or an Error to throw as a network failure would. */
export type FakeAnswer = object | [number, unknown] | [number, unknown, Record<string, string>] | Error;

export function fakeApi(answer: (request: RecordedRequest) => FakeAnswer) {
  const requests: RecordedRequest[] = [];
  const fetchMock = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const request: RecordedRequest = {
      method: init?.method ?? 'GET',
      path: String(url).slice(BASE_URL.length),
      headers: init?.headers as Record<string, string>,
      body: null,
      file: null,
    };
    if (init?.body instanceof FormData) {
      request.body = Object.fromEntries([...init.body.entries()].filter(([name]) => name !== 'file'));
      request.file = multipartFile(init.body);
    } else if (typeof init?.body === 'string') {
      request.body = JSON.parse(init.body);
    }
    requests.push(request);
    const next = answer(request);
    if (next instanceof Error) throw next;
    const [status, body, headers] = Array.isArray(next) ? next : [200, next];
    return new Response(JSON.stringify(body), { status, headers });
  });
  return { api: createApiClient({ baseUrl: BASE_URL, fetch: fetchMock, validate: true }), requests, fetchMock };
}

/** Node's FormData turns the file of the expo-file-system mock (not a Blob) to a string, so the part is taken from the spy of append. */
const appendedFiles = new WeakMap<FormData, unknown>();
const append = FormData.prototype.append;
FormData.prototype.append = function (this: FormData, name: string, value: string | Blob) {
  if (name === 'file') appendedFiles.set(this, value);
  return append.call(this, name, value as Blob);
};

function multipartFile(form: FormData): unknown {
  return appendedFiles.get(form) ?? null;
}
