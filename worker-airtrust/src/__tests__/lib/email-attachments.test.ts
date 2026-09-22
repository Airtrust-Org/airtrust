import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendEmailDetailed } from '../../lib/email';
import type { Env } from '../../types';

describe('sendEmailDetailed attachments', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends Brevo attachment payload only when explicitly provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messageId: 'brevo-123' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const env = {
      BREVO_API_KEY: 'test-key',
      BREVO_FROM_EMAIL: 'treinamento@example.com',
      BREVO_FROM_NAME: 'Gerência de Treinamento',
    } as unknown as Env;

    const result = await sendEmailDetailed(env, {
      to: [{ email: 'gestor@example.com', name: 'Gestor' }],
      subject: 'Relatório',
      textContent: 'Segue relatório.',
      htmlContent: '<p>Segue relatório.</p>',
      attachments: [{ content: 'JVBERi0xLjQ=', name: 'compliance.pdf' }],
    });

    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.attachment).toEqual([{ content: 'JVBERi0xLjQ=', name: 'compliance.pdf' }]);
  });
});
