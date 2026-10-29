// Tag reading on a screen that reads tags (the round, the training; specification: Mobilapp / NFC és QR). Android:
// while the screen is focused, every touched tag goes to onTag without a button. iOS: read() opens the system NFC
// sheet ("Tartsd a telefont a címkéhez") for one tag.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { t } from '@/i18n';

import { getNfcStatus, readOneTag, type NfcStatus } from './reader';
import { setTagHandler } from './tag-events';
import type { TagReading } from './tag';

export interface TagReader {
  /** null while it is checked; checked again when the app returns, e.g. from the NFC settings. */
  status: NfcStatus | null;
  /** Android: tags are read now, without a button. */
  listening: boolean;
  /** iOS: the NFC sheet is open. */
  reading: boolean;
  /** iOS: reads one tag (the Scan button); does nothing on Android. */
  read: () => Promise<void>;
  /** The last failure of the status check or of a reading. */
  error: unknown;
}

export function useTagReader(onTag: (tag: TagReading) => void): TagReader {
  const [status, setStatus] = useState<NfcStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reading, setReading] = useState(false);
  const [focused, setFocused] = useState(false);
  const latest = useRef(onTag);
  useEffect(() => {
    latest.current = onTag;
  });

  useEffect(() => {
    const refresh = () => getNfcStatus().then(setStatus, setError);
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      const release = Platform.OS === 'android' ? setTagHandler((tag) => latest.current(tag)) : () => {};
      return () => {
        setFocused(false);
        release();
      };
    }, []),
  );

  const read = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    setReading(true);
    setError(null);
    try {
      const tag = await readOneTag({ prompt: t('nfc.prompt'), success: t('nfc.read') });
      if (tag !== null) latest.current(tag);
    } catch (e) {
      setError(e);
    } finally {
      setReading(false);
    }
  }, []);

  return { status, listening: Platform.OS === 'android' && focused && status?.enabled === true, reading, read, error };
}
