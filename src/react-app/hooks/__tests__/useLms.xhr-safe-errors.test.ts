import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  fetchWithAuth: vi.fn(),
  getAccessToken: () => null,
}));

import { uploadLmsContent } from '../useLms';

class MockXMLHttpRequest {
  static status = 500;
  static responseText = '';

  status = MockXMLHttpRequest.status;
  responseText = MockXMLHttpRequest.responseText;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open() {}
  setRequestHeader() {}
  send() {
    this.onload?.();
  }
}

describe('LMS XHR upload error safety', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    MockXMLHttpRequest.status = 500;
    MockXMLHttpRequest.responseText = '';
  });

  it('does not expose technical JSON errors returned by upload endpoints', async () => {
    MockXMLHttpRequest.status = 500;
    MockXMLHttpRequest.responseText = JSON.stringify({
      success: false,
      error: 'D1_ERROR: SQLITE_ERROR no such table lms_uploads at worker/src/routes/lms.ts:91',
    });
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);

    const result = await uploadLmsContent(
      '/api/lms/cursos/42/thumbnail-upload',
      new FormData(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('O servidor não conseguiu concluir a operação.');
    expect(result.error).not.toMatch(/D1_ERROR|SQLITE|worker\/src/i);
  });

  it('preserves useful business feedback for non-technical 4xx upload errors', async () => {
    MockXMLHttpRequest.status = 409;
    MockXMLHttpRequest.responseText = JSON.stringify({
      success: false,
      error: 'Já existe um pacote ativo para este curso.',
    });
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);

    const result = await uploadLmsContent('/api/lms/cursos/42/scorm-upload', new FormData());

    expect(result.error).toBe('Já existe um pacote ativo para este curso.');
  });
});
