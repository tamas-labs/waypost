// The hash of a chain entry: lowercase hex HMAC-SHA256 of its canonical JSON (UTF-8) with the device secret.
// react-native-quick-crypto is native (OpenSSL through JSI, synchronous); in Jest its mock forwards to node:crypto.
import type { ChainEntry, ChainEntryOf, ChainEntryType, Hash, UnsignedChainEntry } from '@waypost/schema';
import { Buffer, createHmac } from 'react-native-quick-crypto';

import { canonicalJson } from './canonical-json';

/** prev_hash of the first entry of a chain. */
export const GENESIS_HASH: Hash = '0'.repeat(64);

/** 32 bytes in base64, as POST /devices/enroll returns the device secret. */
const KEY = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;

/** Lowercase hex HMAC-SHA256 of the UTF-8 bytes of message. keyBase64: the 32-byte key in base64. */
export function hmacSha256Hex(keyBase64: string, message: string): Hash {
  if (!KEY.test(keyBase64)) throw new Error('The HMAC key must be 32 bytes in base64');
  return createHmac('sha256', Buffer.from(keyBase64, 'base64')).update(message, 'utf8').digest('hex');
}

/** hash = HMAC-SHA256(key, canonical_json(entry without hash)). */
export function chainHash(entry: UnsignedChainEntry, keyBase64: string): Hash {
  return hmacSha256Hex(keyBase64, canonicalJson(entry));
}

/** The entry with its hash. */
export function signChainEntry<T extends ChainEntryType>(entry: Omit<ChainEntryOf<T>, 'hash'>, keyBase64: string): ChainEntryOf<T> {
  return { ...entry, hash: chainHash(entry as UnsignedChainEntry, keyBase64) } as ChainEntryOf<T>;
}

/** Whether the hash of an entry matches its content (the server's bad_hmac check). */
export function verifyChainEntry({ hash, ...entry }: ChainEntry, keyBase64: string): boolean {
  return chainHash(entry, keyBase64) === hash;
}
