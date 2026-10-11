import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../services/lms-native-content-loader', async (original) => {
  const real = await original<typeof import('../../services/lms-native-content-loader')>();
  return { ...real, loadNativePublishedCourse: mocked.load };
});

import {
  loadNativeVerifiedAsset,
} from '../../services/lms-native-asset-loader';

const rawBytes = new Uint8Array([1, 3, 5, 7, 9]);
const digest = async (buffer: ArrayBuffer) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
  b => b.toString(16).padStart(2, '0')
).join('');

function prepareDb(missing=false, corrupt=false) {
  const paths: string[] = [];
  const bucket = {
    get: vi.fn(async (key: string) => {
      paths.push(key);
      if (missing) return null;
      const bytes = corrupt ? new Uint8Array([9, 9, 9, 9, 9]) : rawBytes;
      return { size: bytes.byteLength, arrayBuffer: () => Promise.resolve(bytes.slice().buffer) };
    }),
  } as unknown as R2Bucket;
  return { bucket, paths, db: {} as D1Database };
}

const args = (db: D1Database, bucket: R2Bucket, assetId='illustration') => ({
  db, bucket, empresaId: 6, matriculaId: 101, actorUserId: 900, assetId,
});

describe('Native V1 byte-verified media transport (staging preview)', () => {
  beforeEach(async () => {
    mocked.load.mockReset();
    const expected = await digest(rawBytes.buffer);
    mocked.load.mockResolvedValue({
      course: {
        courseId: 'author-nr6',
        assets: [
          { id: 'illustration', path: 'media/hero.webp', sha256: expected, mime: 'image/webp' },
          { id: 'orphan', path: 'media/orphan.webp', sha256: expected, mime: 'image/webp' },
        ],
        units: [{ blocks: [{ type: 'image', assetId: 'illustration', alt: 'EPI' }] }],
      },
      cursoId: 31, editionHash: 'a'.repeat(64), cicloId: 9, mode: 'LEARN',
    });
  });

  it('loads exact pinned asset path only after canonical enrollment ownership', async () => {
    const f = prepareDb();
    const result = await loadNativeVerifiedAsset(args(f.db,f.bucket));
    expect(result.contentType).toBe('image/webp');
    expect(Array.from(new Uint8Array(result.bytes))).toEqual(Array.from(rawBytes));
    expect(f.paths).toEqual(['lms/native/6/31/'+'a'.repeat(64)+'/media/hero.webp']);
    expect(mocked.load).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 6, actorUserId: 900, matriculaId: 101,
    }));
  });

  it('cannot request arbitrary media IDs or any unreferenced media', async () => {
    const f=prepareDb();
    await expect(loadNativeVerifiedAsset(args(f.db,f.bucket,'../../secret')))
      .rejects.toMatchObject({ code:'NATIVE_ASSET_INVALID_ID' });
    expect(mocked.load).not.toHaveBeenCalled();
    await expect(loadNativeVerifiedAsset(args(f.db,f.bucket,'orphan')))
      .rejects.toMatchObject({ code:'NATIVE_ASSET_NOT_REFERENCED' });
    await expect(loadNativeVerifiedAsset(args(f.db,f.bucket,'unknown')))
      .rejects.toMatchObject({ code:'NATIVE_ASSET_NOT_REFERENCED' });
    expect(f.paths).toEqual([]);
  });

  it('rejects tampering after media is published', async () => {
    const f=prepareDb(false,true);
    await expect(loadNativeVerifiedAsset(args(f.db,f.bucket)))
      .rejects.toMatchObject({ code:'NATIVE_ASSET_INTEGRITY_FAILED' });
  });

  it('does not fall back to another edition when media is absent', async () => {
    const f=prepareDb(true);
    await expect(loadNativeVerifiedAsset(args(f.db,f.bucket)))
      .rejects.toMatchObject({ code:'NATIVE_ASSET_MISSING_OR_TOO_LARGE' });
    expect(f.paths).toHaveLength(1);
  });

  it('fails closed for oversized media without buffering it', async () => {
    const f=prepareDb();
    const head = f.bucket.get as ReturnType<typeof vi.fn>;
    head.mockImplementationOnce(async () => ({
      size: 50*1024*1024,
      arrayBuffer: vi.fn(() => { throw new Error('MUST_NOT_READ'); }),
    }));
    await expect(loadNativeVerifiedAsset(args(f.db,f.bucket)))
      .rejects.toMatchObject({ code:'NATIVE_ASSET_MISSING_OR_TOO_LARGE' });
  });
});
