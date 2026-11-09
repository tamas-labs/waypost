import { useEffect } from 'react';

import { showToast } from '@/components/toast';
import { t } from '@/i18n';
import { rejectionMessage } from '@/sync/rejection';
import { useSyncStatus } from '@/sync/status';

/** Tells the supervisor at once when the server refuses one of their actions (outbox, M5-03); the list stays until seen. */
export function useRejectedCallsToast(): void {
  useEffect(
    () =>
      useSyncStatus.subscribe((state, previous) => {
        const added = state.rejectedCalls.length - previous.rejectedCalls.length;
        const last = state.rejectedCalls.at(-1);
        if (added <= 0 || last === undefined) return;
        showToast(
          added === 1 ? t('supervisor.rejected', { message: rejectionMessage(last) }) : t('supervisor.rejectedMany', { count: added }),
          'warn',
        );
      }),
    [],
  );
}
