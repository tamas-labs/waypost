import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Vibration } from 'react-native';

import { logError } from '@/diagnostics/error-log';

import { RINGING_VIBRATION, startRinging } from './ringing';

jest.mock('@/diagnostics/error-log', () => ({ logError: jest.fn() }));
// The channel's module loads expo-notifications, which warns of Expo Go at import; only its pattern is needed here.
jest.mock('./channel', () => ({ ROUND_ALARM_VIBRATION: [0, 800, 400, 800] }));

const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
const cancel = jest.spyOn(Vibration, 'cancel').mockImplementation(() => {});
const settle = () => new Promise(setImmediate);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the ringing of the alarm screen', () => {
  it('vibrates and plays the sound in a loop until stopped', () => {
    const stop = startRinging();
    const player = jest.mocked(createAudioPlayer).mock.results[0]!.value as { play: jest.Mock; remove: jest.Mock; loop: boolean };
    expect(vibrate).toHaveBeenCalledWith(RINGING_VIBRATION, true);
    expect(player.loop).toBe(true);
    expect(player.play).toHaveBeenCalled();
    stop();
    expect(cancel).toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('logs what failed, and never throws: an alarm that does not sound must be found in the trial (FR-020)', async () => {
    const vibration = new Error('No vibrator');
    const sound = new Error('No audio focus');
    const mode = new Error('Audio session');
    vibrate.mockImplementationOnce(() => {
      throw vibration;
    });
    jest.mocked(setAudioModeAsync).mockRejectedValueOnce(mode);
    jest.mocked(createAudioPlayer).mockImplementationOnce(() => {
      throw sound;
    });

    expect(() => startRinging()()).not.toThrow();
    await settle();

    expect(jest.mocked(logError).mock.calls).toEqual(
      expect.arrayContaining([
        ['alarm_screen', vibration, 'vibration'],
        ['alarm_screen', sound, 'sound'],
        ['alarm_screen', mode, 'audio_mode'],
      ]),
    );
    expect(logError).toHaveBeenCalledTimes(3);
  });
});
