import { createAudioPlayer } from 'expo-audio';
import { notificationAsync, NotificationFeedbackType } from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

import { playFeedback, startFeedback } from './feedback';

jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  notificationAsync: jest.fn(() => Promise.resolve()),
}));

const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
const players = () => jest.mocked(createAudioPlayer).mock.results.map((result) => result.value as { seekTo: jest.Mock; play: jest.Mock; remove: jest.Mock });
const settle = () => new Promise(setImmediate);

let stop = () => {};
beforeEach(() => {
  jest.clearAllMocks();
  stop = startFeedback();
});
afterEach(() => stop());

describe('scan feedback', () => {
  it('vibrates once for a success, twice for an error and once longer for a warning on Android', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    playFeedback('success');
    playFeedback('error');
    playFeedback('warning');
    expect(vibrate.mock.calls).toEqual([[[0, 60]], [[0, 60, 120, 60]], [[0, 250]]]);
    expect(notificationAsync).not.toHaveBeenCalled();
  });

  it('uses the notification haptics on iOS', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    playFeedback('error');
    expect(notificationAsync).toHaveBeenCalledWith(NotificationFeedbackType.Error);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('plays the sound of the kind from the start, with the players loaded at the start', async () => {
    expect(createAudioPlayer).toHaveBeenCalledTimes(3);
    playFeedback('error');
    playFeedback('error');
    await settle();
    const error = players()[1]!;
    expect(error.seekTo).toHaveBeenCalledWith(0);
    expect(error.play).toHaveBeenCalledTimes(2);
    expect(players()[0]!.play).not.toHaveBeenCalled();
    expect(createAudioPlayer).toHaveBeenCalledTimes(3);
  });

  it('never throws, whatever fails', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    vibrate.mockImplementationOnce(() => {
      throw new Error('No vibrator');
    });
    players()[0]!.seekTo.mockRejectedValueOnce(new Error('Player released'));
    expect(() => playFeedback('success')).not.toThrow();
    await settle();
    expect(warn).toHaveBeenCalledWith('Vibration failed (success)', expect.any(Error));
    expect(warn).toHaveBeenCalledWith('Sound failed (success)', expect.any(Error));
    warn.mockRestore();
  });

  it('releases the players at the stop', () => {
    const loaded = players();
    stop();
    stop = () => {};
    expect(loaded.every((player) => player.remove.mock.calls.length === 1)).toBe(true);
  });
});
