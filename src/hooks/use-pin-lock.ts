import { useCallback, useEffect, useState } from 'react';

import { pinLockRemaining } from '@/auth/pin';
import { getDatabase } from '@/db/open';
import { LOCK_AFTER_FAILURES } from '@/domain/pin-lockout';
import { t } from '@/i18n';

/** A wrong PIN says how many tries are left once this few remain. */
const WARN_ATTEMPTS_LEFT = 2;

/** While locked: the time left, counted down every second. */
export function usePinLock(): [number, () => void] {
  const [remaining, setRemaining] = useState(() => pinLockRemaining(getDatabase()));
  const refresh = useCallback(() => setRemaining(pinLockRemaining(getDatabase())), []);
  const locked = remaining > 0;
  useEffect(() => {
    if (!locked) return undefined;
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [locked, refresh]);
  return [remaining, refresh];
}

/** The lock's text with its m:ss, rounded up to the second. */
export function pinLockedText(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  return t('pin.locked', { time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` });
}

export function wrongPinText(failures: number): string {
  const left = LOCK_AFTER_FAILURES - failures;
  return left > 0 && left <= WARN_ATTEMPTS_LEFT ? t('pin.attemptsLeft', { count: left }) : t('pin.wrongPin');
}
