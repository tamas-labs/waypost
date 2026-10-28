// Which QR codes the app reads: only Waypost checkpoint codes (spec: Mobilapp / NFC és QR). Everything else a
// camera might see (product codes, URLs, Wi-Fi codes) is ignored without any feedback.

/** Every Waypost checkpoint code starts with this. */
export const QR_PREFIX = 'waypost:cp:';

/** Same limit as qr_payload in the scan payload of @waypost/schema. */
export const QR_PAYLOAD_MAX_LENGTH = 255;

/** Same pattern as qr_payload in the checkpoint entity of @waypost/schema: waypost:cp:<UUIDv7>:<16 characters>. */
export const CHECKPOINT_QR = /^waypost:cp:([0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([A-Za-z0-9]{16})$/;

export interface CheckpointQr {
  checkpointId: string;
  code: string;
}

/**
 * Whether the reader accepts the text of a QR code. The text is kept exactly as read (no trimming, no case change):
 * the checkpoint is looked up by the whole payload, and an accepted code without a matching checkpoint is still
 * recorded (unknown_tag).
 */
export function isWaypostQr(text: string): boolean {
  return text.startsWith(QR_PREFIX) && text.length <= QR_PAYLOAD_MAX_LENGTH;
}

/** The parts of a well-formed checkpoint code, or null. Only informative: lookup always uses the whole payload. */
export function parseCheckpointQr(text: string): CheckpointQr | null {
  const match = CHECKPOINT_QR.exec(text);
  if (match === null) return null;
  return { checkpointId: match[1]!, code: match[2]! };
}
