import { Platform } from 'react-native';

import { getNfcStatus, listenForTags } from './reader';
import type { TagReading } from './tag';
import { setTagHandler, startTagEvents, tagEventsStarted } from './tag-events';

jest.mock('./reader', () => ({ getNfcStatus: jest.fn(), listenForTags: jest.fn() }));

const status = jest.mocked(getNfcStatus);
const listen = jest.mocked(listenForTags);
const stopListening = jest.fn(() => Promise.resolve());
const TAG = { uid: '04A1B2C3D4E580' } as TagReading;

/** The tag touched now, as the app-wide listener gets it. */
const touch = () => listen.mock.calls.at(-1)![0](TAG);

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  status.mockResolvedValue({ supported: true, enabled: true });
  listen.mockResolvedValue(stopListening);
});

describe('tag events (Android)', () => {
  it('give a tag to the screen that reads tags, and swallow it anywhere else', async () => {
    const stop = startTagEvents();
    await tagEventsStarted();
    expect(listen).toHaveBeenCalledTimes(1);

    const round = jest.fn();
    const release = setTagHandler(round);
    touch();
    expect(round).toHaveBeenCalledWith(TAG);

    release();
    touch();
    expect(round).toHaveBeenCalledTimes(1);
    stop();
    expect(stopListening).toHaveBeenCalled();
  });

  it('hand the tags to the newest screen; an older screen closing later does not take them away', async () => {
    const stop = startTagEvents();
    await tagEventsStarted();
    const round = jest.fn();
    const training = jest.fn();
    const releaseRound = setTagHandler(round);
    setTagHandler(training);
    releaseRound();
    touch();
    expect(training).toHaveBeenCalledWith(TAG);
    expect(round).not.toHaveBeenCalled();
    stop();
  });

  it('register also with NFC switched off, but not on a phone without NFC or on iOS', async () => {
    status.mockResolvedValue({ supported: true, enabled: false });
    let stop = startTagEvents();
    await tagEventsStarted();
    expect(listen).toHaveBeenCalledTimes(1);
    stop();

    status.mockResolvedValue({ supported: false, enabled: false });
    stop = startTagEvents();
    await tagEventsStarted();
    expect(listen).toHaveBeenCalledTimes(1);
    stop();

    jest.replaceProperty(Platform, 'OS', 'ios');
    startTagEvents()();
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('stop a registration that finishes after the stop', async () => {
    let finish: (stop: () => Promise<void>) => void = () => {};
    listen.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const stop = startTagEvents();
    stop();
    await Promise.resolve();
    finish(stopListening);
    await tagEventsStarted();
    await new Promise(setImmediate);
    expect(stopListening).toHaveBeenCalled();
  });
});
