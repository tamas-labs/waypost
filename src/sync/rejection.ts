// What the supervisor is told of an outbox call the server refused (sync/outbox.ts), without the outbox itself.
import type { OutboxRejection } from '@/db/kv';
import { t } from '@/i18n';

/** The server's message, and how many of the actions built on the refused one were dropped with it. */
export function rejectionMessage(rejection: OutboxRejection): string {
  return rejection.dropped === undefined
    ? rejection.message
    : t('sync.rejectedWithDependents', { message: rejection.message, count: rejection.dropped });
}
