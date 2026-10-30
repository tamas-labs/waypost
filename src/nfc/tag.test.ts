import { schemas } from '@waypost/schema';
import type { NdefRecord, TagEvent } from 'react-native-nfc-manager';

import { encodeNdefMessage, formatTagUid, normalizeTagUid, readTag, toBase64 } from './tag';

const BASE64 = new RegExp(String(schemas['common/base64'].pattern));

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const utf8 = (text: string) =>
  Array.from(encodeURIComponent(text).matchAll(/%([0-9A-F]{2})|[^%]/g), ([char, hex]) => (hex ? parseInt(hex, 16) : char.charCodeAt(0)));

/** URI record "https://waypost.dev/cp/1" (prefix code 0x04 = "https://"), as Android reports it. */
const URI_RECORD: NdefRecord = { tnf: 1, type: [0x55], id: '', payload: [0x04, ...ascii('waypost.dev/cp/1')] };
const URI_MESSAGE = [0xd1, 0x01, 0x11, 0x55, 0x04, ...ascii('waypost.dev/cp/1')];
const URI_MESSAGE_BASE64 = '0QERVQR3YXlwb3N0LmRldi9jcC8x';

it('shows a UID in pairs', () => {
  expect(formatTagUid('04A2196B')).toBe('04:A2:19:6B');
});

describe('normalizeTagUid', () => {
  test.each([
    ['04A1B2C3D4E580', '04A1B2C3D4E580'],
    ['04a1b2c3d4e580', '04A1B2C3D4E580'],
    ['04:A1:B2:C3:D4:E5:80', '04A1B2C3D4E580'],
    ['04-a1-b2-c3-d4-e5-80', '04A1B2C3D4E580'],
    [' 04 A1 B2 C3 ', '04A1B2C3'],
    ['0102030405060708090A', '0102030405060708090A'],
  ])('%j → %s', (value, uid) => {
    expect(normalizeTagUid(value)).toBe(uid);
  });

  test.each([[''], ['04A1B2'], ['04A1B2C3D'], ['04A1B2C3D4E5G0'], ['0102030405060708090A0B'], ['04.A1.B2.C3']])('%j is not a UID', (value) => {
    expect(normalizeTagUid(value)).toBeNull();
  });
});

describe('toBase64', () => {
  // RFC 4648 §10 test vectors, and bytes from the top of the alphabet.
  test.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
    ['\xFB\xFF\xBF', '+/+/'],
  ])('%j → %s', (text, base64) => {
    expect(toBase64(Uint8Array.from(ascii(text)))).toBe(base64);
  });
});

describe('encodeNdefMessage', () => {
  test('a single short record', () => {
    expect(Array.from(encodeNdefMessage([URI_RECORD]))).toEqual(URI_MESSAGE);
  });

  test('the same record as iOS reports it (ID as bytes)', () => {
    expect(Array.from(encodeNdefMessage([{ ...URI_RECORD, id: [] }]))).toEqual(URI_MESSAGE);
  });

  test('message begin and end flags over several records, record ID', () => {
    const text: NdefRecord = { tnf: 1, type: [0x54], id: '0A0B', payload: [0x02, ...ascii('huSzia')] };
    const mime: NdefRecord = { tnf: 2, type: ascii('text/plain'), id: [], payload: ascii('x') };
    expect(Array.from(encodeNdefMessage([URI_RECORD, text, mime]))).toEqual([
      0x91, 0x01, 0x11, 0x55, 0x04, ...ascii('waypost.dev/cp/1'),
      0x19, 0x01, 0x07, 0x02, 0x54, 0x0a, 0x0b, 0x02, ...ascii('huSzia'),
      0x52, 0x0a, 0x01, ...ascii('text/plain'), ...ascii('x'),
    ]);
  });

  test('a payload of 256 bytes or more gets a 4-byte length', () => {
    const payload = Array.from({ length: 300 }, () => 0x41);
    const bytes = encodeNdefMessage([{ tnf: 2, type: ascii('a/b'), id: '', payload }]);
    expect(Array.from(bytes.slice(0, 9))).toEqual([0xc2, 0x03, 0x00, 0x00, 0x01, 0x2c, ...ascii('a/b')]);
    expect(bytes).toHaveLength(9 + 300);
  });
});

describe('readTag', () => {
  test('Android NTAG213 with a URI record', () => {
    const event: TagEvent = {
      id: '04A1B2C3D4E580',
      techTypes: ['android.nfc.tech.NfcA', 'android.nfc.tech.MifareUltralight', 'android.nfc.tech.Ndef'],
      ndefMessage: [URI_RECORD],
    };
    const tag = readTag(event);
    expect(tag).toEqual({
      uid: '04A1B2C3D4E580',
      rawId: '04A1B2C3D4E580',
      ndefRaw: URI_MESSAGE_BASE64,
      ndefLength: URI_MESSAGE.length,
      tech: event.techTypes,
      records: [{ tnf: 1, type: 'U', text: 'https://waypost.dev/cp/1', payloadLength: 17 }],
    });
    expect(tag.ndefRaw).toMatch(BASE64);
  });

  test('iOS NTAG 424 DNA with a SUN URL and an accented text record', () => {
    const sun = 'waypost.dev/t?picc=EF963FF7828658A599F3041510671E88&cmac=94EED9EE65337086';
    const tag = readTag({
      id: '04574A12345680',
      tech: 'IsoDep',
      ndefMessage: [
        { tnf: 1, type: [0x55], id: [], payload: [0x04, ...ascii(sun)] },
        { tnf: 1, type: [0x54], id: [], payload: [0x02, ...ascii('hu'), ...utf8('Árvíztűrő')] },
      ],
    });
    expect(tag.uid).toBe('04574A12345680');
    expect(tag.tech).toEqual(['IsoDep']);
    expect(tag.records.map((record) => record.text)).toEqual([`https://${sun}`, 'Árvíztűrő']);
    expect(tag.ndefRaw).toMatch(BASE64);
  });

  test('a tag without NDEF content', () => {
    expect(readTag({ id: '04A1B2C3D4E580', techTypes: ['android.nfc.tech.NfcA'] })).toMatchObject({
      ndefRaw: null,
      ndefLength: 0,
      records: [],
    });
    expect(readTag({ id: '04A1B2C3D4E580', ndefMessage: [] }).ndefRaw).toBeNull();
  });

  test('a tag without a valid UID keeps what it reported', () => {
    expect(readTag({ id: '0102' })).toMatchObject({ uid: null, rawId: '0102' });
    expect(readTag({})).toMatchObject({ uid: null, rawId: null, tech: [] });
  });

  test('an NDEF message too long for the chain entry is not kept', () => {
    const payload = Array.from({ length: 7000 }, () => 0x41);
    const tag = readTag({ id: '04A1B2C3D4E580', ndefMessage: [{ tnf: 2, type: ascii('a/b'), id: '', payload }] });
    expect(tag.ndefRaw).toBeNull();
    expect(tag.ndefLength).toBe(7009);
    expect(tag.records).toHaveLength(1);
  });

  test('other records have no text, absolute URIs show their type', () => {
    const tag = readTag({
      id: '04A1B2C3D4E580',
      ndefMessage: [
        { tnf: 2, type: ascii('application/octet-stream'), id: '', payload: [1, 2, 3] },
        { tnf: 3, type: ascii('https://waypost.dev'), id: '', payload: [] },
      ],
    });
    expect(tag.records).toEqual([
      { tnf: 2, type: 'application/octet-stream', text: null, payloadLength: 3 },
      { tnf: 3, type: 'https://waypost.dev', text: 'https://waypost.dev', payloadLength: 0 },
    ]);
  });
});
