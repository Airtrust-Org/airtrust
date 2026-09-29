import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getAlertWhatsAppTemplateDefinition,
} from '../../utils/whatsapp-templates';
import {
  getTwilioWhatsAppApproval,
  isTwilioContentTemplateCurrent,
  type TwilioContentRecord,
} from '../../utils/twilio-content';

afterEach(() => vi.unstubAllGlobals());

describe('twilio-content template sync', () => {
  it('considera atual o ContentSid somente quando idioma e corpo correspondem ao template canonico', () => {
    const template = getAlertWhatsAppTemplateDefinition('ead_expiring');
    expect(template).toBeDefined();

    const current: TwilioContentRecord = {
      sid: 'HX_current',
      language: template!.language,
      types: {
        'twilio/text': {
          body: template!.bodyText,
        },
      },
    };

    const stale: TwilioContentRecord = {
      ...current,
      sid: 'HX_stale',
      types: {
        'twilio/text': {
          body: 'Template antigo do AirTrust',
        },
      },
    };

    expect(isTwilioContentTemplateCurrent(current, template!)).toBe(true);
    expect(isTwilioContentTemplateCurrent(stale, template!)).toBe(false);
  });

  it('consulta o status atual de aprovacao do WhatsApp pelo ApprovalRequests', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'https://content.twilio.com/v1/Content/HX0123456789abcdef0123456789abcdef/ApprovalRequests',
      );
      expect(init?.method).toBe('GET');
      return new Response(
        JSON.stringify({
          sid: 'HX0123456789abcdef0123456789abcdef',
          whatsapp: { status: 'approved', rejection_reason: '', category: 'UTILITY' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const approval = await getTwilioWhatsAppApproval(
      {
        TWILIO_ACCOUNT_SID: 'AC_test',
        TWILIO_AUTH_TOKEN: 'token_test',
      } as never,
      'HX0123456789abcdef0123456789abcdef',
    );

    expect(approval?.status).toBe('approved');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

});
