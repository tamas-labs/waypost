import { ImageManipulator } from 'expo-image-manipulator';

import { discardPhoto, photoResize, savePhoto } from './photo';

/** The phone's files: URI → size in bytes. */
const mockFiles = new Map<string, number>();

jest.mock('expo-file-system', () => {
  const uriOf = (parts: unknown[]) => parts.map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = uriOf(parts);
    }
    create = jest.fn();
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = uriOf(parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri) ?? 0;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    moveSync(destination: File) {
      mockFiles.set(destination.uri, mockFiles.get(this.uri)!);
      mockFiles.delete(this.uri);
      this.uri = destination.uri;
    }
    digest = jest.fn(async () => (mockFiles.has(this.uri) ? 'ab'.repeat(32) : ''));
  }
  return { Directory, File, Paths: { document: { uri: 'file:///documents' } } };
});

const renderAsync = jest.fn();
const resize = jest.fn();
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: jest.fn() } }));

const saveAsync = jest.fn(async () => {
  mockFiles.set('file:///cache/ImageManipulator/out.jpg', 312_456);
  return { uri: 'file:///cache/ImageManipulator/out.jpg', width: 1600, height: 1200 };
});

beforeEach(() => {
  mockFiles.clear();
  jest.clearAllMocks();
  renderAsync.mockResolvedValue({ saveAsync, release: jest.fn() });
  jest.mocked(ImageManipulator.manipulate).mockReturnValue({ resize, renderAsync, release: jest.fn() } as unknown as ReturnType<typeof ImageManipulator.manipulate>);
});

describe('photo size', () => {
  it('shrinks the longer side to 1600 px, the other in proportion, and leaves a smaller picture as it is', () => {
    expect(photoResize(4032, 3024)).toEqual({ width: 1600, height: null });
    expect(photoResize(3024, 4032)).toEqual({ width: null, height: 1600 });
    expect(photoResize(2000, 2000)).toEqual({ width: 1600, height: null });
    expect(photoResize(1600, 1200)).toBeNull();
  });
});

describe('saving a photo', () => {
  it('compresses to JPEG 0.7 into the documents, hashes it, and deletes the camera file', async () => {
    mockFiles.set('file:///cache/Camera/shot.jpg', 3_900_000);
    const photo = await savePhoto({ uri: 'file:///cache/Camera/shot.jpg', width: 3024, height: 4032 }, Date.parse('2026-10-27T21:04:05.123Z'));

    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///cache/Camera/shot.jpg');
    expect(resize).toHaveBeenCalledWith({ width: null, height: 1600 });
    expect(saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.7 });
    expect(photo).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/),
      sha256: 'ab'.repeat(32),
      mime: 'image/jpeg',
      size_bytes: 312_456,
      local_uri: `file:///documents/media/${photo.id}.jpg`,
      taken_at: '2026-10-27T21:04:05.123Z',
    });
    expect([...mockFiles.keys()]).toEqual([photo.local_uri]);
  });

  it('does not resize a picture that is small enough', async () => {
    await savePhoto({ uri: 'file:///cache/Camera/small.jpg', width: 1200, height: 900 });
    expect(resize).not.toHaveBeenCalled();
  });

  it('deletes the file of a discarded photo', async () => {
    const photo = await savePhoto({ uri: 'file:///cache/Camera/shot.jpg', width: 4032, height: 3024 });
    discardPhoto(photo);
    expect(mockFiles.size).toBe(0);
    expect(() => discardPhoto(photo)).not.toThrow();
  });
});
