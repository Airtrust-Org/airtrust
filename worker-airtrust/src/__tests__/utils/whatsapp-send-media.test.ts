import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { sendWhatsAppMessage } from '../../utils/whatsapp-send';

afterEach(() => vi.unstubAllGlobals());

describe('sendWhatsAppMessage media', () => {
  it('envia o PDF como MediaUrl no WhatsApp Twilio', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('api.twilio.com');
      const body = new URLSearchParams(String(init?.body || ''));
      expect(body.get('Body')).toBe('Programação do voo');
      expect(body.get('MediaUrl')).toBe('https://api.airtrust.online/api/public/controle-voos/planejamento-previo/token');
      return new Response(JSON.stringify({ sid: 'SM123', status: 'queued' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const env = {
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_WHATSAPP_FROM: '+5522000000000',
      WHATSAPP_API_URL: 'https://provider.example/messages',
      WHATSAPP_API_TOKEN: 'generic-token',
    } as Env;

    const result = await sendWhatsAppMessage(
      env,
      '22998209617',
      'Programação do voo',
      undefined,
      undefined,
      { mediaUrl: 'https://api.airtrust.online/api/public/controle-voos/planejamento-previo/token' },
    );

    expect(result.provider).toBe('twilio');
    expect(result.providerMessageId).toBe('SM123');
  });

  it('inclui link seguro no texto para gateway generico que nao possui contrato de mídia', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { message: string };
      expect(body.message).toContain('Programação do voo');
      expect(body.message).toContain('Planejamento prévio (PDF): https://api.airtrust.online/pdf-token');
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const env = {
      WHATSAPP_API_URL: 'https://provider.example/messages',
      WHATSAPP_API_TOKEN: 'token',
    } as Env;

    await sendWhatsAppMessage(
      env,
      '22998209617',
      'Programação do voo',
      undefined,
      undefined,
      { mediaUrl: 'https://api.airtrust.online/pdf-token' },
    );
  });
});
