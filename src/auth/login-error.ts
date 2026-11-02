// What the supervisor login screen (S1) tells about a failed POST /auth/login: a message for the form, and for a
// validation error the messages of the fields.
import { ApiError, InvalidResponseError, NetworkError } from '@/api/errors';
import { t } from '@/i18n';

export type LoginField = 'email' | 'password';

export interface LoginError {
  /** Under the form; null if the fields' own messages say everything. */
  message: string | null;
  fields: Partial<Record<LoginField, string>>;
}

/** A light check before the request, so a mistyped address gets its message at once (the server checks it again). */
export function checkLoginForm(email: string, password: string): LoginError | null {
  const fields: LoginError['fields'] = {};
  if (email === '') fields.email = t('supervisor.loginErrors.emailMissing');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = t('supervisor.loginErrors.emailInvalid');
  if (password === '') fields.password = t('supervisor.loginErrors.passwordMissing');
  return Object.keys(fields).length > 0 ? { message: null, fields } : null;
}

function retryText(seconds: number | null): string {
  if (seconds === null || seconds <= 60) return t('supervisor.loginErrors.rateLimitedMinute');
  return t('supervisor.loginErrors.rateLimitedMinutes', { minutes: Math.ceil(seconds / 60) });
}

/** The error of signInSupervisor, as the login screen shows it. */
export function loginError(error: unknown): LoginError {
  if (error instanceof NetworkError) {
    return { message: t(error.timedOut ? 'supervisor.loginErrors.timeout' : 'supervisor.loginErrors.network'), fields: {} };
  }
  if (error instanceof InvalidResponseError) return { message: t('supervisor.loginErrors.invalidResponse'), fields: {} };
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'unauthenticated':
        // The server tells a wrong password from an inactive account, in Hungarian.
        return { message: error.fromServer ? error.message : t('supervisor.loginErrors.wrongCredentials'), fields: {} };
      case 'rate_limited':
        return { message: retryText(error.retryAfterS), fields: {} };
      case 'validation_failed': {
        const fields: LoginError['fields'] = {};
        if (error.details?.email !== undefined) fields.email = error.details.email[0];
        if (error.details?.password !== undefined) fields.password = error.details.password[0];
        // A field the form does not show (device_name) is a fault of the app: the server's message tells it.
        const other = Object.keys(error.details ?? {}).some((key) => key !== 'email' && key !== 'password');
        return { message: other || Object.keys(fields).length === 0 ? error.message : null, fields };
      }
      default:
        if (error.status >= 500 || !error.fromServer) return { message: t('supervisor.loginErrors.server'), fields: {} };
        return { message: error.message, fields: {} };
    }
  }
  return {
    message: t('supervisor.loginErrors.unknown', { message: error instanceof Error ? error.message : String(error) }),
    fields: {},
  };
}
