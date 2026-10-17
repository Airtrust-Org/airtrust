import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  selectNativeEnrollmentEdition,
} from '../../services/lms-native-enrollment-edition-selector';
import type { Env } from '../../types';

const fixture = JSON.parse(readFileSync(
  join(process.cwd(), '..', 'scripts', 'learning-factory', 'fixtures', 'native-v1-synthetic.json'),
  'utf8',
));
const bytes = new TextEncoder().encode(JSON.stringify(fixture));
const array = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const digest = async () => {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', array));
  return [...hash].map(n => n.toString(16).padStart(2, '0')).join('');
};

async function setup(options: { rows?: number; invalidHash?: boolean; prefix?: string;
  version?: string; missing?: boolean; corrupt?: boolean; failRead?: boolean } = {}) {
  const hash = options.invalidHash ? 'b'.repeat(64) : await digest();
  const row = { id: 77, artifact_sha256: hash,
    package_version: options.version ?? fixture.packageVersion,
    r2_prefix: options.prefix ?? `lms/native/6/31/${hash}/` };
  const calls: { sql: string; binds: unknown[] }[] = [];
  const lookup = vi.fn(async () => ({ results: Array.from(
    { length: options.rows ?? 1 }, (_, index) => ({ ...row, id: row.id + index }),
  ) }));
  const prepare = vi.fn((sql: string) => ({
    bind: (...binds: unknown[]) => {
      calls.push({ sql, binds });
      return { all: lookup };
    },
  }));
  const get = vi.fn(async () => options.missing ? null : {
    size: bytes.byteLength,
    arrayBuffer: async () => {
      if (options.failRead) throw Error('R2 unavailable');
      if (options.corrupt) return new TextEncoder().encode('corrupt').buffer;
      return array;
    },
  });
  const env = { DB: { prepare } as unknown as D1Database,
    BUCKET: { get } as unknown as R2Bucket } as Env;
  const call = () => selectNativeEnrollmentEdition({ env, empresaId: 6, cursoId: 31 });
  return { call, lookup, get, calls };
}

describe('Native enrollment edition chooser validates immutable R2 before DB writes', () => {
  it('requires unique published edition with exact tenant/course binding', async () => {
    const x = await setup();
    expect(await x.call()).toBe(77);
    expect(x.calls[0].binds).toEqual([31,6]);
    expect(x.calls[0].sql).toContain('a.empresa_id=c.empresa_id');
    expect(x.calls[0].sql).toContain("ed.status='PUBLISHED'");
    expect(x.calls[0].sql).toContain('LIMIT 2');
    expect(x.get).toHaveBeenCalledWith(`lms/native/6/31/${await digest()}/native-private-candidate.json`);
  });
  it('fails closed for zero and multiple published editions without R2', async () => {
    for (const rows of [0,2]) {
      const x = await setup({ rows });
      await expect(x.call()).rejects.toMatchObject({ code: 'NATIVE_EDITION_NOT_UNAMBIGUOUS' });
      expect(x.get).not.toHaveBeenCalled();
    }
  });
  it('rejects mismatched scope and hashes before accessing the object', async () => {
    for (const prefix of [
      'lms/native/7/31/' + (await digest()) + '/',
      'lms/native/6/31/../other/',
    ]) {
      const x = await setup({ prefix });
      await expect(x.call()).rejects.toMatchObject({ code: 'NATIVE_EDITION_METADATA_INVALID' });
      expect(x.get).not.toHaveBeenCalled();
    }
  });
  it('rejects tampered object bytes and missing R2 media', async () => {
    for (const opts of [{ invalidHash: true }, { missing: true }, { failRead: true }, { corrupt: true }]) {
      const x = await setup(opts);
      await expect(x.call()).rejects.toThrow();
    }
  });
  it('rejects mismatched private course version after verifying bytes', async () => {
    const x = await setup({ version: 'n-'+'c'.repeat(32) });
    await expect(x.call()).rejects.toMatchObject({ code: 'NATIVE_EDITION_ARTIFACT_INVALID' });
  });
  it('rejects malformed identities without probing either storage service', async () => {
    const x = await setup();
    const env = { DB: { prepare: vi.fn() }, BUCKET: { get: vi.fn() } } as unknown as Env;
    await expect(selectNativeEnrollmentEdition({ env, empresaId: 0, cursoId: 31 }))
      .rejects.toMatchObject({ code: 'NATIVE_EDITION_SELECTION_INVALID_CONTEXT' });
    expect(x.get).not.toHaveBeenCalled();
  });
});
