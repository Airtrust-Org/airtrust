import { describe, expect, it } from 'vitest';

import {
  getAlertWhatsAppTemplateDefinition,
} from '../../utils/whatsapp-templates';
import {
  isTwilioContentTemplateCurrent,
  type TwilioContentRecord,
} from '../../utils/twilio-content';

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
});
