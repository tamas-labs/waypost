import NfcManager, { NfcAdapter, NfcError, NfcEvents, NfcTech, type TagEvent } from 'react-native-nfc-manager';

import { getNfcStatus, listenForTags, readOneTag } from './reader';

jest.mock('react-native-nfc-manager', () => {
  class NfcErrorBase extends Error {}
  return {
    __esModule: true,
    default: {
      start: jest.fn(),
      isSupported: jest.fn(),
      isEnabled: jest.fn(),
      setEventListener: jest.fn(),
      registerTagEvent: jest.fn(),
      unregisterTagEvent: jest.fn(),
      requestTechnology: jest.fn(),
      getTag: jest.fn(),
      setAlertMessageIOS: jest.fn(),
      cancelTechnologyRequest: jest.fn(),
      goToNfcSetting: jest.fn(),
    },
    NfcAdapter: { FLAG_READER_NFC_A: 0x1, FLAG_READER_NFC_B: 0x2, FLAG_READER_NFC_F: 0x4, FLAG_READER_NFC_V: 0x8 },
    NfcEvents: { DiscoverTag: 'NfcManagerDiscoverTag' },
    NfcTech: { MifareIOS: 'mifare', IsoDep: 'IsoDep' },
    NfcError: { NfcErrorBase, UserCancel: class extends NfcErrorBase {}, Timeout: class extends NfcErrorBase {} },
  };
});

const nfc = jest.mocked(NfcManager);
const MESSAGES = { prompt: 'Tartsd a telefont a címkéhez', success: 'Címke leolvasva' };
const TAG: TagEvent = { id: '04a1b2c3d4e580', tech: 'mifare' };

beforeEach(() => {
  jest.clearAllMocks();
  nfc.start.mockResolvedValue(undefined);
  nfc.isSupported.mockResolvedValue(true);
  nfc.isEnabled.mockResolvedValue(true);
  nfc.getTag.mockResolvedValue(TAG);
});

describe('getNfcStatus', () => {
  test('supported and switched on', async () => {
    await expect(getNfcStatus()).resolves.toEqual({ supported: true, enabled: true });
  });

  test('switched off', async () => {
    nfc.isEnabled.mockResolvedValue(false);
    await expect(getNfcStatus()).resolves.toEqual({ supported: true, enabled: false });
  });

  test('no NFC on the phone', async () => {
    nfc.isSupported.mockResolvedValue(false);
    await expect(getNfcStatus()).resolves.toEqual({ supported: false, enabled: false });
    expect(nfc.isEnabled).not.toHaveBeenCalled();
  });
});

describe('listenForTags (Android)', () => {
  test('reader mode for every tag type; tags arrive normalised; stopping unregisters', async () => {
    const onTag = jest.fn();
    const stop = await listenForTags(onTag);

    expect(nfc.registerTagEvent).toHaveBeenCalledWith({
      isReaderModeEnabled: true,
      readerModeFlags:
        NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V,
    });
    const [event, listener] = nfc.setEventListener.mock.calls[0] as unknown as [string, (tag: TagEvent) => void];
    expect(event).toBe(NfcEvents.DiscoverTag);
    listener({ id: '04a1b2c3d4e580', techTypes: ['android.nfc.tech.NfcA'] });
    expect(onTag).toHaveBeenCalledWith(expect.objectContaining({ uid: '04A1B2C3D4E580', tech: ['android.nfc.tech.NfcA'] }));

    await stop();
    expect(nfc.setEventListener).toHaveBeenLastCalledWith(NfcEvents.DiscoverTag, null);
    expect(nfc.unregisterTagEvent).toHaveBeenCalled();
  });
});

describe('readOneTag (iOS)', () => {
  test('a tag reader session with the prompt; the sheet closes with the success message', async () => {
    await expect(readOneTag(MESSAGES)).resolves.toMatchObject({ uid: '04A1B2C3D4E580', tech: ['mifare'] });
    expect(nfc.requestTechnology).toHaveBeenCalledWith([NfcTech.MifareIOS, NfcTech.IsoDep], { alertMessage: MESSAGES.prompt });
    expect(nfc.setAlertMessageIOS).toHaveBeenCalledWith(MESSAGES.success);
    expect(nfc.cancelTechnologyRequest).toHaveBeenCalled();
  });

  test.each([
    ['closed by the user', new NfcError.UserCancel()],
    ['timed out', new NfcError.Timeout()],
  ])('null when the sheet was %s', async (_, error) => {
    nfc.requestTechnology.mockRejectedValue(error);
    await expect(readOneTag(MESSAGES)).resolves.toBeNull();
    expect(nfc.cancelTechnologyRequest).toHaveBeenCalled();
  });

  test('other errors are passed on, the session is closed', async () => {
    nfc.requestTechnology.mockResolvedValue(NfcTech.MifareIOS);
    nfc.getTag.mockRejectedValue(new Error('Tag connection lost'));
    await expect(readOneTag(MESSAGES)).rejects.toThrow('Tag connection lost');
    expect(nfc.cancelTechnologyRequest).toHaveBeenCalled();
  });
});
