// The sound and the vibration of the alarm screen (DESIGN_HANDOFF 7): repeating until the guard answers. The notification
// itself sounds only once (decisions, M1-06). Both stop while the app is not active: a sound can only play in the
// foreground (expo-audio, enableBackgroundPlayback: false), and the notification is what reaches a guard there.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect } from 'react';
import { AppState, Vibration } from 'react-native';

import { ROUND_ALARM_VIBRATION } from './channel';

const SOUND = require('../../assets/sounds/round_alarm.wav');

/** The notification's pattern with a pause before it starts over, in ms. */
export const RINGING_VIBRATION = [...ROUND_ALARM_VIBRATION, 1000];

/** Starts the sound and the vibration; returns the function that stops them. Never throws: the screen must stay usable. */
export function startRinging(): () => void {
  try {
    Vibration.vibrate(RINGING_VIBRATION, true);
  } catch (error) {
    if (__DEV__) console.warn('Vibration failed (alarm)', error);
  }
  let player: AudioPlayer | null = null;
  try {
    // iOS: also with the ringer switched off (the default on Android).
    setAudioModeAsync({ playsInSilentMode: true }).catch((error: unknown) => {
      if (__DEV__) console.warn('Setting the audio mode failed', error);
    });
    player = createAudioPlayer(SOUND);
    player.loop = true;
    player.play();
  } catch (error) {
    if (__DEV__) console.warn('Sound failed (alarm)', error);
  }
  return () => {
    try {
      Vibration.cancel();
      player?.remove();
    } catch (error) {
      if (__DEV__) console.warn('Stopping the alarm failed', error);
    }
  };
}

/** Rings while on is true and the app is active. */
export function useRinging(on: boolean): void {
  useEffect(() => {
    if (!on) return undefined;
    let stop = AppState.currentState === 'active' ? startRinging() : null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') stop ??= startRinging();
      else {
        stop?.();
        stop = null;
      }
    });
    return () => {
      subscription.remove();
      stop?.();
    };
  }, [on]);
}
