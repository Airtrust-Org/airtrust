import { describe, expect, it } from 'vitest';

import { normalizeWhatsAppPhone } from '../../utils/whatsapp';

describe('normalizeWhatsAppPhone', () => {
  it('adiciona o DDI 55 a telefones brasileiros sem país', () => {
    expect(normalizeWhatsAppPhone('22998209617')).toEqual({
      e164: '+5522998209617',
      whatsapp: 'whatsapp:+5522998209617',
    });
  });

  it('normaliza telefones formatados com mascara brasileira', () => {
    expect(normalizeWhatsAppPhone('(22) 99820-9617')).toEqual({
      e164: '+5522998209617',
      whatsapp: 'whatsapp:+5522998209617',
    });
  });

  it('preserva numeros ja em E.164 ou com prefixo whatsapp', () => {
    expect(normalizeWhatsAppPhone('+5522998209617')).toEqual({
      e164: '+5522998209617',
      whatsapp: 'whatsapp:+5522998209617',
    });

    expect(normalizeWhatsAppPhone('whatsapp:+5522998209617')).toEqual({
      e164: '+5522998209617',
      whatsapp: 'whatsapp:+5522998209617',
    });
  });

  it('converte prefixo internacional 00 para +', () => {
    expect(normalizeWhatsAppPhone('005522998209617')).toEqual({
      e164: '+5522998209617',
      whatsapp: 'whatsapp:+5522998209617',
    });
  });

  it('rejeita telefone vazio', () => {
    expect(() => normalizeWhatsAppPhone('')).toThrow('WHATSAPP_INVALID_PHONE');
  });
});
