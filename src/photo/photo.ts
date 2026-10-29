// Photos of manual entries and incidents (specification: Repo és technológiai stack / Fotó): camera only, never the
// gallery – the app's own camera view (expo-camera), so there is no picker to choose an older picture from. Each
// photo is shrunk to 1600 px on its longer side, saved as JPEG at 0.7 in the app's documents, and hashed (SHA-256).
// Its media row is written with the entry that cites it (ChainWriterOptions.photos), and uploaded later (M4-10).
import type { CameraView } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { PhotoFile } from '@/chain/payloads';
import { uuidv7 } from '@/id/uuidv7';
import { toTimestamp } from '@/time/timestamp';

export const PHOTO_MAX_SIDE_PX = 1600;
export const PHOTO_JPEG_QUALITY = 0.7;
export const PHOTO_MIME = 'image/jpeg';
/** Under the app's documents: kept until uploaded and cleaned up (M4-12), unlike the cache. */
export const PHOTO_DIRECTORY = 'media';

/** A picture as the camera saved it. */
export interface CameraPicture {
  uri: string;
  width: number;
  height: number;
}

/** The size to resize to: the longer side 1600 px, the other in proportion; null if the picture is not larger. */
export function photoResize(width: number, height: number): { width: number | null; height: number | null } | null {
  if (Math.max(width, height) <= PHOTO_MAX_SIDE_PX) return null;
  return width >= height ? { width: PHOTO_MAX_SIDE_PX, height: null } : { width: null, height: PHOTO_MAX_SIDE_PX };
}

function deleteIfExists(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}

/**
 * Compresses the camera's picture into the photo directory and hashes it; the camera's own file is deleted.
 * takenAt: when the shutter was pressed (device clock, like the entry's device_time).
 */
export async function savePhoto(picture: CameraPicture, takenAtMs: number = Date.now()): Promise<PhotoFile> {
  const context = ImageManipulator.manipulate(picture.uri);
  const resize = photoResize(picture.width, picture.height);
  if (resize !== null) context.resize(resize);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_JPEG_QUALITY });
  image.release();
  context.release();
  deleteIfExists(picture.uri);

  const id = uuidv7();
  const directory = new Directory(Paths.document, PHOTO_DIRECTORY);
  directory.create({ idempotent: true, intermediates: true });
  const file = new File(saved.uri);
  file.moveSync(new File(directory, `${id}.jpg`));
  return { id, sha256: await file.digest('SHA-256'), mime: PHOTO_MIME, size_bytes: file.size, local_uri: file.uri, taken_at: toTimestamp(takenAtMs) };
}

/** Takes a picture with the camera view on screen and saves it as a photo. */
export async function takePhoto(camera: CameraView): Promise<PhotoFile> {
  const takenAtMs = Date.now();
  const picture = await camera.takePictureAsync({ quality: 1, exif: false, shutterSound: false });
  return savePhoto(picture, takenAtMs);
}

/**
 * Deletes the file of a photo the guard removed before saving the entry. Only for a photo no entry cites yet: a
 * recorded one is device data and stays until it is uploaded and cleaned up.
 */
export function discardPhoto(photo: PhotoFile): void {
  deleteIfExists(photo.local_uri);
}
