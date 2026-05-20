import { describe, expect, it } from 'vitest';

import {
  computeTwilioWebhookSignature,
  getTwilioWhatsAppDiagnosis,
  mapTwilioMessageStatus,
  verifyTwilioWebhookSignature,
} from '../../utils/twilio';

describe('twilio utils', () => {
  it('verifica assinatura do webhook com os mesmos parametros', async () => {
    const authToken = 'token-teste';
    const url =
      'https://airtrust-api-production.airtrust.workers.dev/api/alertas/whatsapp/status-callback';
    const params = {
      MessageSid: 'SM123',
      MessageStatus: 'delivered',
      To: 'whatsapp:+5522998209617',
    };

    const signature = await computeTwilioWebhookSignature(authToken, url, params);

    await expect(verifyTwilioWebhookSignature(authToken, url, params, signature)).resolves.toBe(
      true,
    );
    await expect(
      verifyTwilioWebhookSignature(
        authToken,
        url,
        { ...params, MessageStatus: 'failed' },
        signature,
      ),
    ).resolves.toBe(false);
  });

  it('gera diagnostico para falha fora da janela de 24 horas', () => {
    expect(getTwilioWhatsAppDiagnosis('failed', '63016', 'outside allowed window')).toContain(
      'janela de 24 horas',
    );
  });

  it('mapeia payload do Twilio vindo do callback', () => {
    expect(
      mapTwilioMessageStatus({
        MessageSid: 'SM123',
        MessageStatus: 'undelivered',
        ErrorCode: '63016',
        ErrorMessage: 'outside allowed window',
        To: 'whatsapp:+5522998209617',
        From: 'whatsapp:+14155238886',
      }),
    ).toEqual({
      sid: 'SM123',
      status: 'undelivered',
      errorCode: '63016',
      errorMessage: 'outside allowed window',
      to: 'whatsapp:+5522998209617',
      from: 'whatsapp:+14155238886',
      raw: {
        MessageSid: 'SM123',
        MessageStatus: 'undelivered',
        ErrorCode: '63016',
        ErrorMessage: 'outside allowed window',
        To: 'whatsapp:+5522998209617',
        From: 'whatsapp:+14155238886',
      },
    });
  });
});
