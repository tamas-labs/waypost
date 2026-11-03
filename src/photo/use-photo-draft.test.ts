import { act, renderHook } from '@testing-library/react-native';

import type { PhotoFile } from '@/chain/payloads';

import { discardPhoto } from './photo';
import { usePhotoDraft, useSinglePhotoDraft } from './use-photo-draft';

jest.mock('./photo', () => ({ discardPhoto: jest.fn() }));

const photo = (id: string): PhotoFile => ({
  id,
  sha256: 'c'.repeat(64),
  mime: 'image/jpeg',
  size_bytes: 1,
  local_uri: `file:///media/${id}.jpg`,
  taken_at: '2026-10-30T12:00:00.000Z',
});

beforeEach(() => jest.clearAllMocks());

describe('the photos of a form', () => {
  it('deletes a removed photo, and the others when the form is left', async () => {
    const { result, unmount } = await renderHook(() => usePhotoDraft());
    await act(async () => {
      result.current.add(photo('a'));
      result.current.add(photo('b'));
    });
    await act(async () => result.current.remove(photo('a')));
    expect(result.current.photos.map((p) => p.id)).toEqual(['b']);
    expect(jest.mocked(discardPhoto).mock.calls).toEqual([[photo('a')]]);
    await unmount();
    expect(jest.mocked(discardPhoto).mock.calls).toEqual([[photo('a')], [photo('b')]]);
  });

  it('never deletes recorded photos', async () => {
    const { result, unmount } = await renderHook(() => usePhotoDraft());
    await act(async () => result.current.add(photo('a')));
    await act(async () => void (await result.current.recording(() => Promise.resolve())));
    await unmount();
    expect(discardPhoto).not.toHaveBeenCalled();
  });

  it('keeps the photos while they are written, even if the form is left meanwhile', async () => {
    const { result, unmount } = await renderHook(() => usePhotoDraft());
    await act(async () => result.current.add(photo('a')));
    let finish: () => void = () => {};
    const writing = result.current.recording((photos) => {
      expect(photos).toEqual([photo('a')]);
      return new Promise<void>((resolve) => (finish = resolve));
    });
    await unmount();
    expect(discardPhoto).not.toHaveBeenCalled();
    finish();
    await writing;
    expect(discardPhoto).not.toHaveBeenCalled();
  });

  it('deletes them if the write fails after the form was left, but not while it is open', async () => {
    const { result, unmount } = await renderHook(() => usePhotoDraft());
    await act(async () => result.current.add(photo('a')));
    await expect(result.current.recording(() => Promise.reject(new Error('no')))).rejects.toThrow('no');
    expect(discardPhoto).not.toHaveBeenCalled();

    let fail: (error: Error) => void = () => {};
    const writing = result.current.recording(() => new Promise((_resolve, reject) => (fail = reject)));
    await unmount();
    expect(discardPhoto).not.toHaveBeenCalled();
    fail(new Error('no'));
    await expect(writing).rejects.toThrow('no');
    expect(discardPhoto).toHaveBeenCalledTimes(1);
  });

  it('deletes a photo that arrives after the form was left', async () => {
    const { result, unmount } = await renderHook(() => usePhotoDraft());
    const { add } = result.current;
    await unmount();
    add(photo('late'));
    expect(jest.mocked(discardPhoto).mock.calls).toEqual([[photo('late')]]);
  });
});

describe('the one photo of a form that edits something saved', () => {
  it('never deletes the saved photo, and deletes the ones taken here that are replaced or left', async () => {
    const { result, unmount } = await renderHook(() => useSinglePhotoDraft(photo('saved')));
    expect(result.current.photo).toEqual(photo('saved'));
    await act(async () => result.current.take(photo('a')));
    await act(async () => result.current.take(photo('b')));
    expect(result.current.photo).toEqual(photo('b'));
    expect(jest.mocked(discardPhoto).mock.calls).toEqual([[photo('a')]]);
    await unmount();
    expect(jest.mocked(discardPhoto).mock.calls).toEqual([[photo('a')], [photo('b')]]);
  });

  it('deletes a removed photo taken here, and keeps the one the form saved', async () => {
    const { result, unmount } = await renderHook(() => useSinglePhotoDraft(null));
    await act(async () => result.current.take(photo('a')));
    await act(async () => result.current.remove());
    expect(result.current.photo).toBeNull();
    expect(jest.mocked(discardPhoto).mock.calls).toEqual([[photo('a')]]);
    await act(async () => result.current.take(photo('b')));
    result.current.keep();
    await unmount();
    expect(jest.mocked(discardPhoto).mock.calls).toEqual([[photo('a')]]);
  });

  it('deletes a photo the camera finished after the form was left', async () => {
    const { result, unmount } = await renderHook(() => useSinglePhotoDraft(photo('saved')));
    const { take } = result.current;
    await act(async () => result.current.remove());
    expect(discardPhoto).not.toHaveBeenCalled();
    await unmount();
    take(photo('late'));
    expect(jest.mocked(discardPhoto).mock.calls).toEqual([[photo('late')]]);
  });

  it('starts with a saved photo known only by its media ID, which is never deleted', async () => {
    const { result, unmount } = await renderHook(() => useSinglePhotoDraft<{ id: string }>({ id: 'on-the-server' }));
    expect(result.current.photo).toEqual({ id: 'on-the-server' });
    await act(async () => result.current.remove());
    await act(async () => result.current.take(photo('a')));
    await unmount();
    expect(jest.mocked(discardPhoto).mock.calls).toEqual([[photo('a')]]);
  });
});
