import { useState } from 'react';

import type { PinLoginResult } from '@/auth/pin';
import { PIN_LENGTH } from '@/components/pin-pad';
import { logError } from '@/diagnostics/error-log';
import { playFeedback } from '@/feedback/feedback';
import { t, type TranslationKey } from '@/i18n';
import { pinLockedText, usePinLock, wrongPinText } from './use-pin-lock';

export interface PinEntry {
  pin: string;
  /** Changes at a wrong PIN: the dots shake. */
  shakeKey: number;
  checking: boolean;
  locked: boolean;
  /** The lock, the wrong PIN or the failure to tell; null if there is nothing to tell. */
  messageText: string | null;
  addDigit: (digit: string) => void;
  deleteDigit: () => void;
  submit: () => Promise<void>;
}

type Message = { kind: 'wrong'; failures: number } | { kind: 'failed' } | null;

/**
 * Typing a PIN and having it checked, on the PIN screen and on the sheet of the shift close: the digits, the lock, the
 * wrong PIN with its feedback, and a check that throws (failedText). What happens at an accepted PIN is up to check,
 * and onOk.
 */
export function usePinEntry(
  check: (pin: string) => Promise<{ status: 'ok' } | Exclude<PinLoginResult, { status: 'ok' }>>,
  failedText: TranslationKey,
  onOk?: () => void,
): PinEntry {
  const [lockRemaining, refreshLock] = usePinLock();
  const [pin, setPin] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [message, setMessage] = useState<Message>(null);
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    setChecking(true);
    try {
      const result = await check(pin);
      if (result.status === 'ok') {
        onOk?.();
        return;
      }
      setPin('');
      setShakeKey((n) => n + 1);
      playFeedback('error');
      // A lock tells about itself.
      setMessage(result.status === 'wrong' && result.remaining_ms === 0 ? { kind: 'wrong', failures: result.failures } : null);
      refreshLock();
    } catch (error) {
      if (__DEV__) console.warn('Checking the PIN failed', error);
      logError('pin', error);
      setPin('');
      playFeedback('error');
      setMessage({ kind: 'failed' });
    } finally {
      setChecking(false);
    }
  };

  const locked = lockRemaining > 0;
  let messageText: string | null = null;
  if (locked) messageText = pinLockedText(lockRemaining);
  else if (message?.kind === 'wrong') messageText = wrongPinText(message.failures);
  else if (message?.kind === 'failed') messageText = t(failedText);

  return {
    pin,
    shakeKey,
    checking,
    locked,
    messageText,
    addDigit: (digit) => {
      setMessage(null);
      setPin((current) => (current.length < PIN_LENGTH ? current + digit : current));
    },
    deleteDigit: () => setPin((current) => current.slice(0, -1)),
    submit,
  };
}
