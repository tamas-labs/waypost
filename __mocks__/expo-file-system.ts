// In-memory file system for Jest (used automatically: a mock of a node module next to node_modules).

/** The files: URI → size in bytes and when they were last written; tests may fill and read it. */
export const files = new Map<string, { size: number; modifiedAtMs: number }>();

const uriOf = (parts: unknown[]) => parts.map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri)).join('/');

export class File {
  uri: string;
  constructor(...parts: unknown[]) {
    this.uri = uriOf(parts);
  }
  get name() {
    return this.uri.slice(this.uri.lastIndexOf('/') + 1);
  }
  get exists() {
    return files.has(this.uri);
  }
  get size() {
    return files.get(this.uri)?.size ?? 0;
  }
  get modificationTime() {
    return files.get(this.uri)?.modifiedAtMs ?? null;
  }
  delete() {
    if (!files.delete(this.uri)) throw new Error(`No such file: ${this.uri}`);
  }
}

export class Directory {
  uri: string;
  constructor(...parts: unknown[]) {
    this.uri = uriOf(parts);
  }
  get exists() {
    return [...files.keys()].some((uri) => uri.startsWith(`${this.uri}/`));
  }
  create() {}
  list() {
    return [...files.keys()].filter((uri) => uri.startsWith(`${this.uri}/`)).map((uri) => new File(uri));
  }
}

export const Paths = { document: { uri: 'file:///documents' } };
