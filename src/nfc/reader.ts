// NFC reading on the two platforms, over react-native-nfc-manager. Android listens while a screen is open,
// iOS reads one tag per system session started by a button (spec: Mobilapp / NFC és QR). Tags are never written.
import NfcManager, { NfcAdapter, NfcError, NfcEvents, NfcTech, type TagEvent } from 'react-native-nfc-manager';

import { readTag, type TagReading } from './tag';

export interface NfcStatus {
  /** The phone has NFC hardware (iOS: and supports tag reading). */
  supported: boolean;
  /** NFC is switched on (always true on iOS, where it cannot be switched off). */
  enabled: boolean;
}

/** All tag types: NTAG21x is NFC-A, NTAG 424 DNA is NFC-A + ISO-DEP. */
const READER_MODE_FLAGS =
  NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V;

let started: Promise<void> | null = null;

function start(): Promise<void> {
  started ??= NfcManager.start().catch((error: unknown) => {
    started = null;
    throw error;
  });
  return started;
}

export async function getNfcStatus(): Promise<NfcStatus> {
  if (!(await NfcManager.isSupported())) return { supported: false, enabled: false };
  await start();
  return { supported: true, enabled: await NfcManager.isEnabled() };
}

/** Android: opens the system NFC settings. */
export async function openNfcSettings(): Promise<void> {
  await NfcManager.goToNfcSetting();
}

/**
 * Android: delivers every tag touched while the app is in the foreground, without a button. Uses reader mode,
 * so the tag goes to this app only (no system "new tag" screen, no other app). Returns the function that stops it.
 */
export async function listenForTags(onTag: (tag: TagReading) => void): Promise<() => Promise<void>> {
  await start();
  NfcManager.setEventListener(NfcEvents.DiscoverTag, (event: TagEvent) => onTag(readTag(event)));
  await NfcManager.registerTagEvent({ isReaderModeEnabled: true, readerModeFlags: READER_MODE_FLAGS });
  return async () => {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    await NfcManager.unregisterTagEvent();
  };
}

/**
 * iOS: opens the system NFC sheet with the given message and reads one tag (UID and NDEF), then closes the
 * sheet showing the success message. Resolves null if the guard closes the sheet or it times out.
 */
export async function readOneTag(messages: { prompt: string; success: string }): Promise<TagReading | null> {
  await start();
  try {
    // A tag reader session (not an NDEF one): only that gives the UID.
    await NfcManager.requestTechnology([NfcTech.MifareIOS, NfcTech.IsoDep], { alertMessage: messages.prompt });
    const event = await NfcManager.getTag();
    if (event === null) return null;
    await NfcManager.setAlertMessageIOS(messages.success);
    return readTag(event);
  } catch (error) {
    if (error instanceof NfcError.UserCancel || error instanceof NfcError.Timeout) return null;
    throw error;
  } finally {
    await NfcManager.cancelTechnologyRequest();
  }
}
