import { describe, expect, it, vi } from 'vitest';
import { serveAuthorizedRenderedPptx } from '../../routes/lms-pptx-rendered';

const pptxKey = 'lms/pptx/6/22/presentation.pptx';
const firstEtag = 'a'.repeat(32);
const secondEtag = 'b'.repeat(32);
const firstPdfKey = `lms/pptx/6/22/rendered/${firstEtag}.pdf`;

function fakeDb() {
  return { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first: vi.fn(async () => ({
    pptx_r2_key: pptxKey, pptx_slide_count: 111,
    // Intentionally no version_tag: thumbnail changes must never affect identity.
  })) })) })) } as unknown as D1Database;
}

function fakeR2(getSourceEtag: () => string) {
  const get = vi.fn(async (key: string) => key === firstPdfKey ? ({
    body: new Blob(['%PDF-1.7']).stream(),
  }) : null);
  const head = vi.fn(async () => ({
    etag: getSourceEtag(), httpEtag: `"${getSourceEtag()}"`,
  }));
  return { bucket: { get, head } as unknown as R2Bucket, get, head };
}

describe('PPTX PDF derivative is strictly tied to actual R2 bytes', () => {
  it('serves PDF with original source ETag, without using catalog version', async () => {
    const db = fakeDb(); const { bucket, get } = fakeR2(() => firstEtag);
    const result = await serveAuthorizedRenderedPptx(db, bucket, 6, 22,
      'https://airtrust.online', 'https://airtrust.online');
    expect(result.status).toBe(200);
    expect(result.headers.get('Content-Type')).toBe('application/pdf');
    expect(result.headers.get('ETag')).toBe(`"${firstEtag}"`);
    expect(result.headers.get('X-Pptx-Slide-Count')).toBe('111');
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(get).toHaveBeenCalledWith(firstPdfKey);
  });
  it('rejects previously rendered PDF after source replacement even if database version did not change', async () => {
    const db = fakeDb();let actualEtag = firstEtag;
    const { bucket, get } = fakeR2(() => actualEtag);
    const before = await serveAuthorizedRenderedPptx(db, bucket, 6, 22, undefined, undefined);
    expect(before.status).toBe(200);
    actualEtag = secondEtag; // R2 source overwritten, D1 thumbnail/version still unchanged
    const after = await serveAuthorizedRenderedPptx(db, bucket, 6, 22, undefined, undefined);
    expect(after.status).toBe(404);
    expect(get).toHaveBeenLastCalledWith(`lms/pptx/6/22/rendered/${secondEtag}.pdf`);
  });
  it('changing only a thumbnail does not invalidate PDF when the actual source ETag stays the same', async () => {
    const { bucket, get } = fakeR2(() => firstEtag);
    const first = await serveAuthorizedRenderedPptx(fakeDb(), bucket, 6, 22, undefined, undefined);
    const second = await serveAuthorizedRenderedPptx(fakeDb(), bucket, 6, 22, undefined, undefined);
    expect(first.status).toBe(200);expect(second.status).toBe(200);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
