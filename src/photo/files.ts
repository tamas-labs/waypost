// Where the photos are on the phone: under the app's documents, kept until they are uploaded and cleaned up, unlike
// the cache. A file is found by the photo's ID: iOS moves the app's documents at every update, so a stored URI goes
// stale, and the file name is what stays.
import { Directory, File, Paths } from 'expo-file-system';

const PHOTO_DIRECTORY = 'media';
const EXTENSION = '.jpg';

export function photoDirectory(): Directory {
  return new Directory(Paths.document, PHOTO_DIRECTORY);
}

export function photoFile(id: string): File {
  return new File(photoDirectory(), `${id}${EXTENSION}`);
}

/** The photo files on the phone: their ID, and when they were last written (device clock), if the system tells. */
export function listPhotoFiles(): { id: string; modifiedAtMs: number | null }[] {
  const directory = photoDirectory();
  if (!directory.exists) return [];
  return directory
    .list()
    .filter((item): item is File => item instanceof File && item.name.endsWith(EXTENSION))
    .map((file) => ({ id: file.name.slice(0, -EXTENSION.length), modifiedAtMs: file.modificationTime ?? null }));
}
