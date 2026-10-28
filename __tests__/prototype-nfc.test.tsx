import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import NfcScreen from '@/app/prototype/nfc';
import { getNfcStatus, listenForTags, openNfcSettings, readOneTag } from '@/nfc/reader';
import type { TagReading } from '@/nfc/tag';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('@/nfc/reader', () => ({
  getNfcStatus: jest.fn(),
  listenForTags: jest.fn(),
  openNfcSettings: jest.fn(),
  readOneTag: jest.fn(),
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return { Stack: { Screen: () => null }, useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]) };
});

const status = jest.mocked(getNfcStatus);
const listen = jest.mocked(listenForTags);
const readOne = jest.mocked(readOneTag);

const NTAG213: TagReading = {
  uid: '04A1B2C3D4E580',
  rawId: '04A1B2C3D4E580',
  ndefRaw: '0QERVQR3YXlwb3N0LmRldi9jcC8x',
  ndefLength: 21,
  tech: ['android.nfc.tech.NfcA', 'android.nfc.tech.Ndef'],
  records: [{ tnf: 1, type: 'U', text: 'https://waypost.dev/cp/1', payloadLength: 17 }],
};

const stop = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  jest.clearAllMocks();
  status.mockResolvedValue({ supported: true, enabled: true });
  listen.mockResolvedValue(stop);
  jest.mocked(openNfcSettings).mockResolvedValue(undefined);
});

async function renderScreen(os: 'ios' | 'android') {
  jest.replaceProperty(Platform, 'OS', os);
  const result = await render(
    <ThemeProvider>
      <NfcScreen />
    </ThemeProvider>,
  );
  await act(async () => {});
  return result;
}

describe('Android', () => {
  test('listens without a button and shows the UID and NDEF of each tag', async () => {
    await renderScreen('android');
    expect(screen.getByText('Bekapcsolva')).toBeOnTheScreen();
    expect(screen.queryByText('Leolvasás')).toBeNull();
    expect(listen).toHaveBeenCalledTimes(1);

    const onTag = listen.mock.calls[0]![0];
    await act(async () => onTag(NTAG213));
    expect(screen.getByText('04A1B2C3D4E580')).toBeOnTheScreen();
    expect(screen.getByText('21 bájt · 1 rekord')).toBeOnTheScreen();
    expect(screen.getByText('https://waypost.dev/cp/1')).toBeOnTheScreen();
    expect(screen.getByText(NTAG213.ndefRaw!)).toBeOnTheScreen();
    expect(screen.getByText(/· NfcA, Ndef$/)).toBeOnTheScreen();
  });

  test('stops listening when the screen closes', async () => {
    const { unmount } = await renderScreen('android');
    await act(async () => unmount());
    expect(stop).toHaveBeenCalled();
  });

  test('NFC switched off: no listening, link to the settings', async () => {
    status.mockResolvedValue({ supported: true, enabled: false });
    await renderScreen('android');
    expect(listen).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByText('NFC-beállítások')));
    expect(openNfcSettings).toHaveBeenCalled();
  });

  test('a tag without a valid UID or NDEF', async () => {
    await renderScreen('android');
    const onTag = listen.mock.calls[0]![0];
    await act(async () => onTag({ ...NTAG213, uid: null, rawId: '0102', ndefRaw: null, ndefLength: 0, records: [] }));
    expect(screen.getByText('Érvénytelen UID: 0102')).toBeOnTheScreen();
    expect(screen.getByText('Nincs NDEF tartalom')).toBeOnTheScreen();
  });
});

describe('iOS', () => {
  test('the Scan button opens the system sheet with the prompt', async () => {
    readOne.mockResolvedValue({ ...NTAG213, tech: ['mifare'] });
    await renderScreen('ios');
    expect(listen).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByText('Leolvasás')));
    expect(readOne).toHaveBeenCalledWith({ prompt: 'Tartsd a telefont a címkéhez', success: 'Címke leolvasva' });
    expect(screen.getByText('04A1B2C3D4E580')).toBeOnTheScreen();
  });

  test('closing the sheet adds nothing; an error is shown', async () => {
    readOne.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Tag connection lost'));
    await renderScreen('ios');
    await act(async () => fireEvent.press(screen.getByText('Leolvasás')));
    expect(screen.getByText('Még nincs leolvasott címke.')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByText('Leolvasás')));
    expect(screen.getByText('Hiba: Tag connection lost')).toBeOnTheScreen();
  });

  test('no NFC on the phone', async () => {
    status.mockResolvedValue({ supported: false, enabled: false });
    await renderScreen('ios');
    expect(screen.getByText('Ez a telefon nem tud NFC-címkét olvasni')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByText('Leolvasás')));
    expect(readOne).not.toHaveBeenCalled();
  });
});
