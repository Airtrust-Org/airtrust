export interface NormalizedWhatsAppPhone {
  e164: string;
  whatsapp: string;
}

export function normalizeWhatsAppPhone(
  telefone: string,
  defaultCountryCode = '55',
): NormalizedWhatsAppPhone {
  const raw = (telefone || '').trim();

  if (!raw) {
    throw new Error('WHATSAPP_INVALID_PHONE');
  }

  let value = raw.replace(/^whatsapp:/i, '').trim();
  value = value.replace(/[()\-\s]/g, '');

  if (value.startsWith('00')) {
    value = `+${value.slice(2)}`;
  }

  let digits = value.startsWith('+') ? value.slice(1) : value;
  digits = digits.replace(/\D/g, '');

  if (!digits) {
    throw new Error('WHATSAPP_INVALID_PHONE');
  }

  // Telefones brasileiros no sistema são armazenados sem DDI.
  // Para envio ao provedor, convertemos 10/11 dígitos locais para +55.
  if (!value.startsWith('+')) {
    if (digits.length === 10 || digits.length === 11) {
      digits = `${defaultCountryCode}${digits}`;
    }
  }

  const e164 = `+${digits}`;

  return {
    e164,
    whatsapp: `whatsapp:${e164}`,
  };
}
