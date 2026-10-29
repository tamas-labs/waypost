// Android: where a touched tag goes (specification: Mobilapp / NFC és QR). One reader-mode registration for the
// whole app while it runs; react-native-nfc-manager turns reader mode off when the app leaves the foreground and on
// again when it comes back. A tag goes to the screen that reads tags (the round, the training), set by
// setTagHandler; anywhere else it is swallowed – nothing happens, and the system shows no "new tag" screen and opens
// no browser for a URL record. iOS has no such listening: a tag is read only in a session started by a button.
import { Platform } from 'react-native';

import { getNfcStatus, listenForTags } from './reader';
import type { TagReading } from './tag';

export type TagHandler = (tag: TagReading) => void;

let handler: TagHandler | null = null;
let stopListening: (() => Promise<void>) | null = null;
let starting: Promise<void> | null = null;
let generation = 0;

/** The screen's handler gets the tags from now on; the returned function hands them back to nobody. */
export function setTagHandler(next: TagHandler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

async function register(current: number): Promise<void> {
  if (!(await getNfcStatus()).supported) return;
  const stop = await listenForTags((tag) => handler?.(tag));
  if (current === generation) stopListening = stop;
  else await stop();
}

/**
 * Starts the app-wide tag listening (Android; nothing elsewhere or on a phone without NFC). NFC switched off is
 * fine: reader mode comes on when it is switched on and the app returns from the settings. Returns the stop.
 */
export function startTagEvents(): () => void {
  if (Platform.OS !== 'android') return () => {};
  const current = ++generation;
  starting = register(current)
    .catch((error: unknown) => {
      if (__DEV__) console.warn('Starting the NFC tag listening failed', error);
    })
    .finally(() => {
      if (current === generation) starting = null;
    });
  return () => {
    if (current !== generation) return;
    generation += 1;
    const stop = stopListening;
    stopListening = null;
    void stop?.().catch(() => {});
  };
}

/** Settles a start in progress (for the tests). */
export function tagEventsStarted(): Promise<void> {
  return starting ?? Promise.resolve();
}
