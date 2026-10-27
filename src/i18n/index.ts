import hu from './hu.json';

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Dot-separated key of a text in hu.json, e.g. "sync.offlineQueued". */
export type TranslationKey = Leaves<typeof hu>;

/** Values for the {{name}} placeholders of a text. */
export type TranslationParams = Record<string, string | number>;

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

function lookup(key: string): string {
  let node: unknown = hu;
  for (const part of key.split('.')) {
    node = typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }
  if (typeof node !== 'string') throw new Error(`Unknown text key: ${key}`);
  return node;
}

/**
 * The Hungarian text of a key, with its {{name}} placeholders replaced. Throws for an unknown key or a
 * missing parameter, so a wrong call fails in tests instead of showing a broken text.
 */
export function t(key: TranslationKey, params: TranslationParams = {}): string {
  return lookup(key).replace(PLACEHOLDER, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing parameter "${name}" for text ${key}`);
    return String(value);
  });
}
