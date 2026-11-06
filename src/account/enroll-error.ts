// What the site details screen (S3) tells about a failed enrollment of this phone (enrollThisPhone).
import { ApiError, InvalidResponseError, NetworkError } from '@/api/errors';
import { t } from '@/i18n';

import { UnsentActionsError } from './supervisor';

export function enrollErrorText(error: unknown): string {
  if (error instanceof UnsentActionsError) return t('supervisor.enrollErrors.unsent', { count: error.count });
  if (error instanceof NetworkError) return t(error.timedOut ? 'supervisor.enrollErrors.timeout' : 'supervisor.enrollErrors.network');
  if (error instanceof InvalidResponseError) return t('supervisor.enrollErrors.invalidResponse');
  if (error instanceof ApiError) {
    // The token of the account is not accepted any more (e.g. deleted on the server).
    if (error.code === 'unauthenticated') return t('supervisor.enrollErrors.unauthenticated');
    if (error.status >= 500 || !error.fromServer) return t('supervisor.enrollErrors.server');
    // 403 (not a site of the supervisor), 404, 422, 429: the server's Hungarian message.
    return error.message;
  }
  return t('supervisor.enrollErrors.unknown', { message: error instanceof Error ? error.message : String(error) });
}
