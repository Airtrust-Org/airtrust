/**
 * R2 em memória para testes de backup: list com prefixo/cursor/paginação, get, put, delete
 * (chave única ou lista), head, mais pontos de injeção de falha. Nunca toca em rede.
 */
export interface FakeR2Hooks {
  /** Chamado antes de cada get; retornar 'missing' simula objeto que sumiu entre list e get. */
  beforeGet?: (key: string) => 'missing' | void;
  /** Chamado antes de cada put; lançar simula falha de gravação/encerramento do isolate. */
  beforePut?: (key: string, putCount: number) => void | Promise<void>;
  /** Tamanho de página do list (default 1000, como R2). */
  pageSize?: number;
}

export class FakeR2Bucket {
  readonly store = new Map<string, { bytes: Uint8Array; uploaded: Date; metadata?: unknown }>();
  readonly ops = { list: 0, get: 0, put: 0, delete: 0 };
  hooks: FakeR2Hooks;

  constructor(initial: Record<string, string | Uint8Array> = {}, hooks: FakeR2Hooks = {}) {
    this.hooks = hooks;
    for (const [key, value] of Object.entries(initial)) {
      this.store.set(key, {
        bytes: typeof value === 'string' ? new TextEncoder().encode(value) : value,
        uploaded: new Date('2026-06-14T10:00:00.000Z'),
      });
    }
  }

  asR2(): R2Bucket {
    return this as unknown as R2Bucket;
  }

  keys(prefix = ''): string[] {
    return [...this.store.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  text(key: string): string {
    const entry = this.store.get(key);
    if (!entry) throw new Error(`FakeR2: chave inexistente ${key}`);
    return new TextDecoder().decode(entry.bytes);
  }

  bytes(key: string): Uint8Array {
    const entry = this.store.get(key);
    if (!entry) throw new Error(`FakeR2: chave inexistente ${key}`);
    return entry.bytes;
  }

  async put(
    key: string,
    value: string | ArrayBuffer | Uint8Array,
    options?: { customMetadata?: unknown },
  ) {
    this.ops.put += 1;
    await this.hooks.beforePut?.(key, this.ops.put);
    const bytes =
      typeof value === 'string'
        ? new TextEncoder().encode(value)
        : value instanceof Uint8Array
          ? new Uint8Array(value)
          : new Uint8Array(value.slice(0));
    this.store.set(key, { bytes, uploaded: new Date(), metadata: options?.customMetadata });
    return null;
  }

  async get(key: string) {
    this.ops.get += 1;
    if (this.hooks.beforeGet?.(key) === 'missing') return null;
    const entry = this.store.get(key);
    if (!entry) return null;
    const { bytes, uploaded } = entry;
    return {
      key,
      size: bytes.byteLength,
      uploaded,
      etag: `etag-${key}`,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as unknown as R2ObjectBody;
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
    this.ops.list += 1;
    const prefix = options?.prefix ?? '';
    const pageSize = Math.min(options?.limit ?? 1000, this.hooks.pageSize ?? 1000);
    const all = this.keys(prefix);
    const start = options?.cursor ? Number(options.cursor) : 0;
    const page = all.slice(start, start + pageSize);
    const truncated = start + pageSize < all.length;
    return {
      objects: page.map((key) => {
        const { bytes, uploaded } = this.store.get(key)!;
        return { key, size: bytes.byteLength, uploaded, etag: `etag-${key}` };
      }),
      truncated,
      cursor: truncated ? String(start + pageSize) : undefined,
      delimitedPrefixes: [],
    };
  }

  async delete(keys: string | string[]) {
    this.ops.delete += 1;
    for (const key of Array.isArray(keys) ? keys : [keys]) this.store.delete(key);
  }
}
