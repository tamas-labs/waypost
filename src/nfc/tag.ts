// Platform-independent handling of a read NFC tag: UID normalisation and the raw NDEF message.
import type { NdefRecord, TagEvent } from 'react-native-nfc-manager';

/** Same pattern as tag_uid in @waypost/schema (checkpoint, scan payload): uppercase hex, 4 to 10 bytes. */
const TAG_UID = /^([0-9A-F]{2}){4,10}$/;

/** Separators accepted in a UID written by hand or by a reader app (04:A1:B2…, 04-a1-b2…, 04 A1 B2…). */
const SEPARATORS = /[\s:-]/g;

/** Same limit as ndef_raw in @waypost/schema (base64 characters). */
const NDEF_RAW_MAX_LENGTH = 8192;

/** A tag as the app uses it: what goes into a scan entry (tag_uid, ndef_raw) and what the test screen shows. */
export interface TagReading {
  /** Normalised UID, or null if the tag reported none or one that is not a valid UID. */
  uid: string | null;
  /** The UID as the tag reported it. */
  rawId: string | null;
  /** The NDEF message as base64, or null if the tag has none (or it is longer than the schema allows). */
  ndefRaw: string | null;
  /** Byte length of the NDEF message (also when ndefRaw is null because it is too long). */
  ndefLength: number;
  /** Android tech list (android.nfc.tech.*) or the iOS tag technology. */
  tech: string[];
  records: NdefRecordSummary[];
}

export interface NdefRecordSummary {
  tnf: number;
  /** Record type as text, e.g. "U" or "T" for well-known records, a MIME type for TNF 2. */
  type: string;
  /** Decoded content of URI and text records; null for others. */
  text: string | null;
  payloadLength: number;
}

/** Uppercase hex without separators, or null if the value is not a 4–10 byte UID. */
export function normalizeTagUid(value: string): string | null {
  const uid = value.replace(SEPARATORS, '').toUpperCase();
  return TAG_UID.test(uid) ? uid : null;
}

/** Android sends the record ID as a hex string, iOS as a byte array. */
function toBytes(value: number[] | string | undefined, hex: boolean): number[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (hex) return (value.match(/[0-9A-Fa-f]{2}/g) ?? []).map((byte) => parseInt(byte, 16));
  return Array.from(value, (char) => char.charCodeAt(0) & 0xff);
}

function lengthBytes(length: number): number[] {
  return [(length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff];
}

/**
 * Serialises the records into an NDEF message (NFC Forum NDEF 1.0): short records where the payload fits,
 * no chunking. The platforms hand over the parsed records; this rebuilds the bytes the tag holds.
 */
export function encodeNdefMessage(records: NdefRecord[]): Uint8Array {
  const bytes: number[] = [];
  records.forEach((record, index) => {
    const type = toBytes(record.type, false);
    const id = toBytes(record.id, true);
    const payload = record.payload;
    const short = payload.length < 256;
    let header = record.tnf & 0x07;
    if (index === 0) header |= 0x80; // MB
    if (index === records.length - 1) header |= 0x40; // ME
    if (short) header |= 0x10; // SR
    if (id.length > 0) header |= 0x08; // IL
    bytes.push(header, type.length, ...(short ? [payload.length] : lengthBytes(payload.length)));
    if (id.length > 0) bytes.push(id.length);
    bytes.push(...type, ...id, ...payload);
  });
  return Uint8Array.from(bytes);
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 with padding (RFC 4648 §4), as the base64 definition of @waypost/schema expects. */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += BASE64[(n >>> 18) & 63]! + BASE64[(n >>> 12) & 63]!;
    out += b === undefined ? '=' : BASE64[(n >>> 6) & 63]!;
    out += c === undefined ? '=' : BASE64[n & 63]!;
  }
  return out;
}

/** Prefixes of URI records (NFC Forum URI RTD, identifier codes 0x00–0x23). */
const URI_PREFIXES = [
  '', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.',
  'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://', 'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:',
  'sip:', 'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://', 'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:',
  'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:',
];

/** UTF-8 without relying on TextDecoder (not guaranteed in Hermes); invalid sequences fall back to Latin-1. */
function decodeUtf8(bytes: number[]): string {
  try {
    return decodeURIComponent(bytes.map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return String.fromCharCode(...bytes);
  }
}

function summarize(record: NdefRecord): NdefRecordSummary {
  const type = String.fromCharCode(...toBytes(record.type, false));
  const payload = record.payload;
  let text: string | null = null;
  if (record.tnf === 0x01 && type === 'U' && payload.length > 0) {
    text = (URI_PREFIXES[payload[0]!] ?? '') + decodeUtf8(payload.slice(1));
  } else if (record.tnf === 0x01 && type === 'T' && payload.length > 0) {
    // Status byte: bit 7 = UTF-16 (not used by the tags we write), bits 0–5 = length of the language code.
    const languageLength = payload[0]! & 0x3f;
    text = decodeUtf8(payload.slice(1 + languageLength));
  } else if (record.tnf === 0x03) {
    text = type;
  }
  return { tnf: record.tnf, type, text, payloadLength: payload.length };
}

/** Converts the tag as react-native-nfc-manager reports it (Android tag event or iOS getTag). */
export function readTag(event: TagEvent): TagReading {
  const rawId = event.id ?? null;
  const records = event.ndefMessage ?? [];
  const ndef = records.length > 0 ? encodeNdefMessage(records) : null;
  const ndefRaw = ndef ? toBase64(ndef) : null;
  return {
    uid: rawId === null ? null : normalizeTagUid(rawId),
    rawId,
    ndefRaw: ndefRaw !== null && ndefRaw.length <= NDEF_RAW_MAX_LENGTH ? ndefRaw : null,
    ndefLength: ndef?.length ?? 0,
    tech: event.techTypes ?? (event.tech ? [event.tech] : []),
    records: records.map(summarize),
  };
}
