// Photo upload (specification, Szinkron protokoll / Push és média): after the entries, one by one, from what is not
// uploaded here and what the server asks for. A photo waits until its entry is acknowledged: before that the server
// could only answer 404, and an entry it rejected would cost the upload at every sync. A photo the server refuses (the
// file is not the recorded one) does not stop the others, and is tried again at the next sync. What says the server
// cannot be reached or does not want this phone now stops the step: the next sync goes on from there.
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import type { ApiClient } from '@/api/client';
import { uploadMedia } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import type { Database } from '@/db/database';
import { chainEntries, incidents, media, scans } from '@/db/schema';
import { photoFile } from '@/photo/files';

import { photosOfThisDevice } from './pending';

export interface MediaContext {
  db: Database;
  api: ApiClient;
  token: string;
  deviceId: string;
  /** What the push responses of this sync asked for. */
  mediaMissing: ReadonlySet<string>;
}

/** The answer is about this photo, and another attempt now would get the same: 404, 403, 413, 422 … */
function refusedThisPhoto(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429;
}

/** The scans and incidents whose entry the server has not acknowledged. An entry that is gone was acknowledged: only those are cleaned up. */
function ownersNotAcknowledged(db: Database): Set<string> {
  const notAcknowledged = (table: typeof scans | typeof incidents) =>
    db
      .select({ id: table.id })
      .from(table)
      .innerJoin(chainEntries, eq(chainEntries.id, table.chain_entry_id))
      .where(isNull(chainEntries.synced_at))
      .all()
      .map((row) => row.id);
  return new Set([...notAcknowledged(scans), ...notAcknowledged(incidents)]);
}

function photosToUpload(db: Database, deviceId: string, asked: ReadonlySet<string>) {
  const notUploaded = and(isNull(media.uploaded_at), photosOfThisDevice(deviceId));
  const notAcknowledged = ownersNotAcknowledged(db);
  return db
    .select()
    .from(media)
    .where(asked.size > 0 ? or(notUploaded, inArray(media.id, [...asked])) : notUploaded)
    .orderBy(media.id)
    .all()
    .filter((photo) => !notAcknowledged.has(photo.owner_id));
}

export async function uploadPhotos({ db, api, token, deviceId, mediaMissing }: MediaContext): Promise<void> {
  for (const photo of photosToUpload(db, deviceId, mediaMissing)) {
    const file = photoFile(photo.id);
    if (!file.exists) {
      // Nothing to send: an uploaded photo the cleanup has deleted, or a file that is gone.
      if (__DEV__ && photo.uploaded_at === null) console.warn(`The file of photo ${photo.id} is missing`);
      continue;
    }
    try {
      const { media: uploaded, server_time } = await uploadMedia(
        api,
        token,
        photo.id,
        { sha256: photo.sha256, owner_type: photo.owner_type, owner_id: photo.owner_id, taken_at: photo.taken_at },
        file,
      );
      db.update(media)
        .set({ uploaded_at: uploaded.uploaded_at ?? server_time })
        .where(inArray(media.id, [photo.id]))
        .run();
    } catch (error) {
      if (!refusedThisPhoto(error)) throw error;
      if (__DEV__) console.warn(`The server refused photo ${photo.id}`, error);
    }
  }
}
