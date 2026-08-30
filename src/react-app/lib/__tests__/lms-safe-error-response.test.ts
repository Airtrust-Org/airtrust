import { describe, expect, it } from 'vitest';
import {
  safeLmsResponseErrorText,
  sanitizeLmsAuthenticatedErrorResponse,
} from '../lms-safe-error-response';

describe('LMS authenticated error response safety', () => {
  it('preserves useful 4xx business feedback', () => {
    expect(
      safeLmsResponseErrorText('O curso já está publicado.', 409),
    ).toBe('O curso já está publicado.');
  });

  it('replaces technical 4xx and all 5xx visible messages', () => {
    expect(
      safeLmsResponseErrorText('SQLITE_ERROR: no such column: lms.secret_token', 400),
    ).toBe('Não foi possível concluir a operação.');
    expect(
      safeLmsResponseErrorText('upstream database unavailable', 500),
    ).toBe('O servidor não conseguiu concluir a operação.');
  });

  it('sanitizes only error/message fields and preserves diagnostic payload fields', async () => {
    const original = new Response(
      JSON.stringify({
        success: false,
        error: 'D1_ERROR: database unavailable',
        code: 'LMS_WRITE_FAILED',
        details: { correlation_id: 'corr-123' },
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      },
    );

    const safe = await sanitizeLmsAuthenticatedErrorResponse(
      original,
      '/api/lms/cursos/42',
    );
    const body = await safe.json();

    expect(body.error).toBe('O servidor não conseguiu concluir a operação.');
    expect(body.error).not.toContain('D1_ERROR');
    expect(body.code).toBe('LMS_WRITE_FAILED');
    expect(body.details).toEqual({ correlation_id: 'corr-123' });
  });

  it('does not rewrite successful or non-LMS responses', async () => {
    const success = new Response(JSON.stringify({ success: true, data: { id: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const otherModule = new Response(
      JSON.stringify({ success: false, error: 'SQLITE_ERROR: hidden' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );

    expect(
      await sanitizeLmsAuthenticatedErrorResponse(success, '/api/lms/cursos'),
    ).toBe(success);
    expect(
      await sanitizeLmsAuthenticatedErrorResponse(otherModule, '/api/frms/dashboard'),
    ).toBe(otherModule);
  });

  it('sanitizes technical plain-text LMS errors', async () => {
    const original = new Response('TypeError: Cannot read properties of undefined', {
      status: 400,
      headers: { 'content-type': 'text/plain' },
    });

    const safe = await sanitizeLmsAuthenticatedErrorResponse(
      original,
      '/api/lms/cursos/42',
    );

    expect(await safe.text()).toBe('Não foi possível concluir a operação.');
  });
});
