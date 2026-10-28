// The Android notification channel of the round alarms (spec: Mobilapp / Ébresztés).
import {
  AndroidAudioContentType,
  AndroidAudioUsage,
  AndroidImportance,
  AndroidNotificationVisibility,
  setNotificationChannelAsync,
} from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from '@/i18n';

/**
 * Android keeps a channel's sound, importance and vibration once it exists; only the name and the description can
 * change. A change to the settings below therefore needs a new channel ID (and deleting the old channel).
 */
export const ROUNDS_CHANNEL_ID = 'rounds';

/** Bundled by the expo-notifications config plugin (app.json); referenced by file name on both platforms. */
export const ROUND_ALARM_SOUND = 'round_alarm.wav';

/** Wait, then vibrate and pause, in ms. */
export const ROUND_ALARM_VIBRATION = [0, 700, 300, 700, 300, 700];

/**
 * Creates (or renames) the `rounds` channel: highest importance (heads-up, sound, shown on the lock screen), own sound
 * and vibration. The sound plays as an alarm: at alarm volume, also when the ringer is silent; only Do Not Disturb
 * holds it back. Does nothing on iOS.
 */
export async function ensureRoundsChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await setNotificationChannelAsync(ROUNDS_CHANNEL_ID, {
    name: t('alarm.channelName'),
    description: t('alarm.channelDescription'),
    importance: AndroidImportance.MAX,
    sound: ROUND_ALARM_SOUND,
    audioAttributes: { usage: AndroidAudioUsage.ALARM, contentType: AndroidAudioContentType.SONIFICATION },
    enableVibrate: true,
    vibrationPattern: ROUND_ALARM_VIBRATION,
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
  });
}
