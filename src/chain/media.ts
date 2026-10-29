// The media rows of the photos an entry cites (payload.media), written in the entry's transaction: a photo is
// recorded exactly when an entry that refers to it is, so no row points to an entry that was never written.
import type { ChainEntry } from '@waypost/schema';

import type { Database } from '@/db/database';
import { media } from '@/db/schema';

import type { PhotoFile } from './payloads';
import { ProjectionError } from './projection';

/**
 * Inserts the media rows of the photos the entry cites and that are not yet recorded in this write. The owner is the
 * first entry citing the photo (a manual entry's scan; its incident cites the same photos). A cited photo that is not
 * among the photos, or whose SHA-256 differs, is an error.
 */
export function recordPhotos(tx: Database, entry: ChainEntry, photos: ReadonlyMap<string, PhotoFile>, recorded: Set<string>): void {
  if (entry.type !== 'scan' && entry.type !== 'incident') return;
  const ownerId = entry.type === 'scan' ? entry.payload.scan_id : entry.payload.incident_id;
  for (const ref of entry.payload.media) {
    if (recorded.has(ref.id)) continue;
    const photo = photos.get(ref.id);
    if (photo === undefined) throw new ProjectionError(`Photo ${ref.id} of ${entry.type} ${ownerId} was not given`);
    if (photo.sha256 !== ref.sha256) throw new ProjectionError(`Photo ${ref.id} does not match its SHA-256 in ${entry.type} ${ownerId}`);
    const { id, sha256, mime, size_bytes, local_uri, taken_at } = photo;
    tx.insert(media).values({ id, owner_type: entry.type, owner_id: ownerId, sha256, mime, size_bytes, local_uri, taken_at, uploaded_at: null }).run();
    recorded.add(ref.id);
  }
}
