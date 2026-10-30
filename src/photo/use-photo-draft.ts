import { useCallback, useEffect, useRef, useState } from 'react';

import type { PhotoFile } from '@/chain/payloads';

import { discardPhoto } from './photo';

function discardQuietly(photo: PhotoFile): void {
  try {
    discardPhoto(photo);
  } catch (error) {
    if (__DEV__) console.warn('Deleting a photo failed', error);
  }
}

export interface PhotoDraft {
  photos: readonly PhotoFile[];
  add: (photo: PhotoFile) => void;
  /** Removes the photo and deletes its file. */
  remove: (photo: PhotoFile) => void;
  /**
   * Runs the write that records the photos. From its start their files stay even if the guard leaves meanwhile; once it
   * has succeeded they are device data and are never deleted here.
   */
  recording: <T>(write: (photos: readonly PhotoFile[]) => Promise<T>) => Promise<T>;
}

/** The photos of a form not saved yet: their files live as long as the form, so leaving it leaves none behind. */
export function usePhotoDraft(): PhotoDraft {
  const [photos, setPhotos] = useState<readonly PhotoFile[]>([]);
  const draft = useRef({ photos: [] as readonly PhotoFile[], mounted: true, writing: false, recorded: false });

  const update = useCallback((next: readonly PhotoFile[]) => {
    draft.current.photos = next;
    setPhotos(next);
  }, []);

  const add = useCallback(
    (photo: PhotoFile) => {
      // The camera finished after the form was left.
      if (!draft.current.mounted) discardQuietly(photo);
      else update([...draft.current.photos, photo]);
    },
    [update],
  );

  const remove = useCallback(
    (photo: PhotoFile) => {
      update(draft.current.photos.filter((other) => other.id !== photo.id));
      discardQuietly(photo);
    },
    [update],
  );

  const recording = useCallback(async <T,>(write: (photos: readonly PhotoFile[]) => Promise<T>) => {
    const state = draft.current;
    state.writing = true;
    try {
      const result = await write(state.photos);
      state.recorded = true;
      return result;
    } finally {
      state.writing = false;
      if (!state.recorded && !state.mounted) state.photos.forEach(discardQuietly);
    }
  }, []);

  useEffect(() => {
    const state = draft.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      if (!state.writing && !state.recorded) state.photos.forEach(discardQuietly);
    };
  }, []);

  return { photos, add, remove, recording };
}
