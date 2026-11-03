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

  const recording = useCallback(async <T>(write: (photos: readonly PhotoFile[]) => Promise<T>) => {
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

export interface SinglePhotoDraft {
  photo: PhotoFile | null;
  /** Another photo instead of the one shown; one taken on this form and replaced is deleted at once. */
  take: (photo: PhotoFile) => void;
  remove: () => void;
  /**
   * The form's save has stored the photo shown: leaving deletes nothing after this. The saved photo it replaced is not
   * deleted here: whoever stored the save knows when nothing refers to it any more.
   */
  keep: () => void;
}

/**
 * One photo of a form that edits something saved (the point of a training): it starts with the saved photo, which is
 * never deleted here; the photos taken on the form live as long as the form, unless it is saved with one.
 */
export function useSinglePhotoDraft(saved: PhotoFile | null): SinglePhotoDraft {
  const [photo, setPhoto] = useState(saved);
  const draft = useRef({ saved, current: saved, mounted: true, kept: false });

  const show = useCallback((next: PhotoFile | null) => {
    const state = draft.current;
    const previous = state.current;
    if (previous !== null && previous.id !== state.saved?.id) discardQuietly(previous);
    state.current = next;
    setPhoto(next);
  }, []);

  const take = useCallback(
    (next: PhotoFile) => {
      // The camera finished after the form was left.
      if (!draft.current.mounted) discardQuietly(next);
      else show(next);
    },
    [show],
  );
  const remove = useCallback(() => show(null), [show]);
  const keep = useCallback(() => {
    draft.current.kept = true;
  }, []);

  useEffect(() => {
    const state = draft.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      if (!state.kept && state.current !== null && state.current.id !== state.saved?.id) discardQuietly(state.current);
    };
  }, []);

  return { photo, take, remove, keep };
}
