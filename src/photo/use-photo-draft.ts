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

/** A photo of the form: a saved one (anything with its media ID) or one taken now. */
type FormPhoto<S> = S | PhotoFile;

const isTaken = (photo: { id: string }): photo is PhotoFile => 'local_uri' in photo && 'sha256' in photo;

/** Deletes a photo taken on the form; the saved one stays. */
function discardTaken(saved: { id: string } | null, photo: { id: string } | null): void {
  if (photo !== null && photo.id !== saved?.id && isTaken(photo)) discardQuietly(photo);
}

export interface SinglePhotoDraft<S extends { id: string } = PhotoFile> {
  photo: FormPhoto<S> | null;
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
 * One photo of a form that edits something saved (the point of a training or of a route): it starts with the saved
 * photo, which is never deleted here (it may be only a media ID, its file on the server); the photos taken on the form
 * live as long as the form, unless it is saved with one.
 */
export function useSinglePhotoDraft<S extends { id: string } = PhotoFile>(saved: S | null): SinglePhotoDraft<S> {
  const [photo, setPhoto] = useState<FormPhoto<S> | null>(saved);
  const draft = useRef<{ saved: S | null; current: FormPhoto<S> | null; mounted: boolean; kept: boolean }>({
    saved,
    current: saved,
    mounted: true,
    kept: false,
  });

  const show = useCallback((next: FormPhoto<S> | null) => {
    const state = draft.current;
    discardTaken(state.saved, state.current);
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
      if (!state.kept) discardTaken(state.saved, state.current);
    };
  }, []);

  return { photo, take, remove, keep };
}
