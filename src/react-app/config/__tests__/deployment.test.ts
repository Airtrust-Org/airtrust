import { describe, expect, it, vi } from 'vitest';
import {
  extractBuildVersionFromHtml,
  fetchServedFrontendVersion,
  readServedFrontendVersionFromDocument,
} from '../deployment';

describe('deployment version helpers', () => {
  it('lê a versão servida a partir do meta build-version do documento', () => {
    const doc = {
      querySelector: vi.fn(() => ({ content: '808bb11' })),
    } as unknown as Document;

    expect(readServedFrontendVersionFromDocument(doc)).toBe('808bb11');
  });

  it('ignora placeholders não carimbados', () => {
    expect(
      extractBuildVersionFromHtml('<meta name="build-version" content="__BUILD_VERSION__" />'),
    ).toBeNull();
  });

  it('extrai a versão real do HTML servido via fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        '<html><head><meta name="build-version" content="808bb11" /></head><body></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      ),
    );

    await expect(fetchServedFrontendVersion(fetchMock as unknown as typeof fetch, () => 123))
      .resolves.toBe('808bb11');

    expect(fetchMock).toHaveBeenCalledWith(
      '/index.html?v=123',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Accept: 'text/html' },
      }),
    );
  });
});
