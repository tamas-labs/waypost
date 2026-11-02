// The endpoints the app calls, typed by @waypost/schema.
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthLogoutResponse,
  DeviceDiagnosticRequest,
  DeviceDiagnosticResponse,
  DevicesEnrollRequest,
  DevicesEnrollResponse,
  MediaUploadRequest,
  MediaUploadResponse,
  SiteListResponse,
  SyncPullResponse,
  SyncPushFinalRequest,
  SyncPushFinalResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '@waypost/schema';

import type { ApiClient } from './client';

/** A photo may take long on a slow network. */
const MEDIA_UPLOAD_TIMEOUT_MS = 120_000;

/** POST /auth/login: supervisor login; wrong credentials are 401 unauthenticated. */
export async function login(api: ApiClient, body: AuthLoginRequest): Promise<AuthLoginResponse> {
  const { data } = await api.request({
    method: 'POST',
    path: '/auth/login',
    body,
    bodySchema: 'api/auth-login.request',
    responseSchema: 'api/auth-login.response',
  });
  return data;
}

/** POST /auth/logout: deletes the supervisor token on the server. */
export async function logout(api: ApiClient, supervisorToken: string): Promise<AuthLogoutResponse> {
  const { data } = await api.request({
    method: 'POST',
    path: '/auth/logout',
    token: supervisorToken,
    responseSchema: 'api/auth-logout.response',
  });
  return data;
}

/** GET /sites: the supervisor's sites. */
export async function listSites(api: ApiClient, token: string): Promise<SiteListResponse> {
  const { data } = await api.request({ method: 'GET', path: '/sites', token, responseSchema: 'api/site-list.response' });
  return data;
}

/** POST /devices/enroll: makes this phone the site phone; the token and secret are returned only now. */
export async function enrollDevice(api: ApiClient, supervisorToken: string, body: DevicesEnrollRequest): Promise<DevicesEnrollResponse> {
  const { data } = await api.request({
    method: 'POST',
    path: '/devices/enroll',
    token: supervisorToken,
    body,
    bodySchema: 'api/devices-enroll.request',
    responseSchema: 'api/devices-enroll.response',
  });
  return data;
}

/** GET /sync/pull: configuration changes since the cursor (null: full state). */
export async function pull(api: ApiClient, token: string, cursor: string | null): Promise<SyncPullResponse> {
  const { data } = await api.request({
    method: 'GET',
    path: '/sync/pull',
    query: { cursor },
    token,
    responseSchema: 'api/sync-pull.response',
  });
  return data;
}

/** POST /sync/push: a batch of the device's chain entries. */
export async function push(api: ApiClient, token: string, body: SyncPushRequest): Promise<SyncPushResponse> {
  const { data } = await api.request({
    method: 'POST',
    path: '/sync/push',
    token,
    body,
    bodySchema: 'api/sync-push.request',
    responseSchema: 'api/sync-push.response',
  });
  return data;
}

/** POST /sync/push-final: a batch of a revoked device; done closes its upload. */
export async function pushFinal(api: ApiClient, token: string, body: SyncPushFinalRequest): Promise<SyncPushFinalResponse> {
  const { data } = await api.request({
    method: 'POST',
    path: '/sync/push-final',
    token,
    body,
    bodySchema: 'api/sync-push-final.request',
    responseSchema: 'api/sync-push-final.response',
  });
  return data;
}

/** PUT /media/{id}: a photo. A new Idempotency-Key at every attempt: the server remembers a 404 for the key too. */
export async function uploadMedia(
  api: ApiClient,
  token: string,
  id: string,
  fields: MediaUploadRequest,
  file: Blob,
): Promise<MediaUploadResponse> {
  const { data } = await api.request({
    method: 'PUT',
    path: `/media/${id}`,
    token,
    form: { fields: { ...fields }, file },
    bodySchema: 'api/media-upload.request',
    responseSchema: 'api/media-upload.response',
    timeoutMs: MEDIA_UPLOAD_TIMEOUT_MS,
  });
  return data;
}

/** POST /devices/diagnostics: the server rejected chain entries of this device. */
export async function reportDiagnostic(api: ApiClient, token: string, body: DeviceDiagnosticRequest): Promise<DeviceDiagnosticResponse> {
  const { data } = await api.request({
    method: 'POST',
    path: '/devices/diagnostics',
    token,
    body,
    bodySchema: 'api/device-diagnostic.request',
    responseSchema: 'api/device-diagnostic.response',
  });
  return data;
}
