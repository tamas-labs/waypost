// The feedback of a scan (specification: Mobilapp / NFC és QR; DESIGN_HANDOFF 7): a vibration and a short sound.
// Success: one short vibration; error: two short vibrations; warning (recorded, with a flag): one longer vibration.
// iOS: the system's notification haptics (Success / Error / Warning). Android: explicit patterns, because the
// notification haptics of expo-haptics vibrate twice for a success and three times for an error.
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { NotificationFeedbackType, notificationAsync } from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

export type FeedbackKind = 'success' | 'error' | 'warning';

/** Android vibration patterns: wait, vibrate, wait, vibrate … (ms). */
export const ANDROID_VIBRATION: Record<FeedbackKind, number[]> = {
  success: [0, 60],
  error: [0, 60, 120, 60],
  warning: [0, 250],
};

const IOS_HAPTICS: Record<FeedbackKind, NotificationFeedbackType> = {
  success: NotificationFeedbackType.Success,
  error: NotificationFeedbackType.Error,
  warning: NotificationFeedbackType.Warning,
};

/** Placeholders, like the alarm sound (assets/sounds). */
const SOUNDS: Record<FeedbackKind, number> = {
  success: require('../../assets/sounds/scan_success.wav'),
  error: require('../../assets/sounds/scan_error.wav'),
  warning: require('../../assets/sounds/scan_warning.wav'),
};

/** One player per sound while the app runs (startFeedback), so the first scan's sound is not late. */
const players = new Map<FeedbackKind, AudioPlayer>();

function playerOf(kind: FeedbackKind): AudioPlayer {
  const existing = players.get(kind);
  if (existing !== undefined) return existing;
  const player = createAudioPlayer(SOUNDS[kind]);
  players.set(kind, player);
  return player;
}

function playSound(kind: FeedbackKind): void {
  const player = playerOf(kind);
  player
    .seekTo(0)
    .then(() => player.play())
    .catch((error: unknown) => {
      if (__DEV__) console.warn(`Sound failed (${kind})`, error);
    });
}

/** Only the vibration of the kind (e.g. the last 5 minutes of a round). Never throws. */
export function playHaptic(kind: FeedbackKind): void {
  try {
    if (Platform.OS === 'android') Vibration.vibrate(ANDROID_VIBRATION[kind]);
    else void notificationAsync(IOS_HAPTICS[kind]).catch(() => {});
  } catch (error) {
    if (__DEV__) console.warn(`Vibration failed (${kind})`, error);
  }
}

/** Vibrates and plays the sound of the kind. Never throws: a failed feedback must not stop a scan. */
export function playFeedback(kind: FeedbackKind): void {
  playHaptic(kind);
  try {
    playSound(kind);
  } catch (error) {
    if (__DEV__) console.warn(`Sound failed (${kind})`, error);
  }
}

/** Loads the sounds; the returned function releases them. */
export function startFeedback(): () => void {
  for (const kind of Object.keys(SOUNDS) as FeedbackKind[]) {
    try {
      playerOf(kind);
    } catch (error) {
      if (__DEV__) console.warn(`Loading the sound failed (${kind})`, error);
    }
  }
  return () => {
    for (const player of players.values()) player.remove();
    players.clear();
  };
}
