// The endpoints the app calls, typed by @waypost/schema.
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthLogoutResponse,
  DevicesEnrollRequest,
  DevicesEnrollResponse,
  SiteListResponse,
  SyncPullResponse,
} from '@waypost/schema';

import type { ApiClient } from './client';

/** POST /auth/login: supervisor login; wrong credentials are 401 unauthenticated. */
export async function login(api: ApiClient, body: AuthLoginRequest): Promise<AuthLoginResponse> {
  const { data } = await api.request({ method: 'POST', path: '/auth/login', body, bodySchema: 'api/auth-login.request', responseSchema: 'api/auth-login.response' });
  return data;
}

/** POST /auth/logout: deletes the supervisor token on the server. */
export async function logout(api: ApiClient, supervisorToken: string): Promise<AuthLogoutResponse> {
  const { data } = await api.request({ method: 'POST', path: '/auth/logout', token: supervisorToken, responseSchema: 'api/auth-logout.response' });
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
  const { data } = await api.request({ method: 'GET', path: '/sync/pull', query: { cursor }, token, responseSchema: 'api/sync-pull.response' });
  return data;
}
