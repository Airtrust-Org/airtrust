import { describe, expect, it } from 'vitest';
import { parseApiResponse } from '../lmsContentUpload';

async function rejectionMessage(response: Response): Promise<string> {
  try {
    await parseApiResponse(response);
    throw new Error('expected parseApiResponse to reject');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('lmsContentUpload parseApiResponse visible error safety', () => {
  it('hides raw non-JSON 5xx proxy/runtime text', async () => {
    const response = new Response(
      '<html>Cloudflare D1_ERROR: no such table: lms_cursos at worker.ts:418:11</html>',
      { status: 502, headers: { 'content-type': 'text/html' } },
    );

    await expect(rejectionMessage(response)).resolves.toBe(
      'O servidor não conseguiu concluir a operação.',
    );
  });

  it('hides raw technical JSON error on 5xx', async () => {
    const response = new Response(
      JSON.stringify({
        success: false,
        error: 'SQLITE_ERROR: database unavailable at src/routes/lms.ts:91:7',
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );

    await expect(rejectionMessage(response)).resolves.toBe(
      'O servidor não conseguiu concluir a operação.',
    );
  });

  it('preserves useful non-technical 4xx business feedback', async () => {
    const response = new Response(
      JSON.stringify({ success: false, error: 'O pacote SCORM não contém imsmanifest.xml.' }),
      { status: 422, headers: { 'content-type': 'application/json' } },
    );

    await expect(rejectionMessage(response)).resolves.toBe(
      'O pacote SCORM não contém imsmanifest.xml.',
    );
  });

  it('keeps the dedicated package-size message for 413', async () => {
    const response = new Response('Payload Too Large', { status: 413 });

    await expect(rejectionMessage(response)).resolves.toBe(
      'O pacote excede um dos limites seguros de upload.',
    );
  });

  it('does not surface an invalid successful HTML response body', async () => {
    const response = new Response('<html>unexpected upstream page</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    await expect(rejectionMessage(response)).resolves.toBe('Resposta inválida do servidor.');
  });

  it('returns data for a valid successful envelope', async () => {
    const response = new Response(JSON.stringify({ success: true, data: { packageId: 'pkg-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await expect(parseApiResponse<{ packageId: string }>(response)).resolves.toEqual({
      packageId: 'pkg-1',
    });
  });
});
