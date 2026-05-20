export interface TwilioMessageStatus {
  sid: string;
  status: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  to: string | null;
  from: string | null;
  raw: Record<string, unknown>;
}

function toSortedCallbackBase(url: string, params: Record<string, string>): string {
  const sortedEntries = Object.entries(params).sort(([left], [right]) => left.localeCompare(right));
  return sortedEntries.reduce((acc, [key, value]) => `${acc}${key}${value}`, url);
}

function encodeBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export async function computeTwilioWebhookSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    {
      name: 'HMAC',
      hash: 'SHA-1',
    },
    false,
    ['sign'],
  );

  const base = toSortedCallbackBase(url, params);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(base));
  return encodeBase64(signature);
}

export async function verifyTwilioWebhookSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  providedSignature?: string | null,
): Promise<boolean> {
  if (!authToken || !providedSignature) {
    return false;
  }

  const expectedSignature = await computeTwilioWebhookSignature(authToken, url, params);

  if (expectedSignature.length !== providedSignature.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < expectedSignature.length; index += 1) {
    mismatch |= expectedSignature.charCodeAt(index) ^ providedSignature.charCodeAt(index);
  }

  return mismatch === 0;
}

export function getTwilioWhatsAppDiagnosis(
  status?: string | null,
  errorCode?: string | null,
  errorMessage?: string | null,
): string | null {
  const normalizedStatus = String(status || '')
    .trim()
    .toLowerCase();
  const normalizedCode = String(errorCode || '').trim();

  if (
    !normalizedStatus ||
    ['queued', 'accepted', 'sent', 'delivered', 'read'].includes(normalizedStatus)
  ) {
    return null;
  }

  if (normalizedCode === '63016') {
    return 'O Twilio aceitou a requisicao, mas o WhatsApp bloqueou a entrega porque a mensagem e livre e esta fora da janela de 24 horas. Para esse caso, e preciso usar template aprovado ou o destinatario iniciar/reabrir a conversa.';
  }

  if (normalizedCode === '63018') {
    return 'O Twilio aceitou a requisicao, mas a entrega foi rejeitada pelo canal WhatsApp. Verifique se o numero do destinatario pode receber WhatsApp e se a configuracao do remetente esta habilitada para esse destino.';
  }

  if (normalizedCode) {
    return `O Twilio informou falha posterior ao aceite. Codigo ${normalizedCode}${errorMessage ? `: ${errorMessage}` : ''}`;
  }

  if (normalizedStatus === 'failed' || normalizedStatus === 'undelivered') {
    return errorMessage || 'O Twilio marcou a mensagem como nao entregue apos o aceite inicial.';
  }

  return null;
}

export function mapTwilioMessageStatus(payload: Record<string, unknown>): TwilioMessageStatus {
  return {
    sid: String(payload.sid || payload.MessageSid || payload.SmsSid || ''),
    status: payload.status
      ? String(payload.status)
      : payload.MessageStatus
        ? String(payload.MessageStatus)
        : null,
    errorCode:
      payload.error_code !== undefined && payload.error_code !== null
        ? String(payload.error_code)
        : payload.ErrorCode !== undefined && payload.ErrorCode !== null
          ? String(payload.ErrorCode)
          : null,
    errorMessage:
      payload.error_message !== undefined && payload.error_message !== null
        ? String(payload.error_message)
        : payload.ErrorMessage !== undefined && payload.ErrorMessage !== null
          ? String(payload.ErrorMessage)
          : null,
    to: payload.to ? String(payload.to) : payload.To ? String(payload.To) : null,
    from: payload.from ? String(payload.from) : payload.From ? String(payload.From) : null,
    raw: payload,
  };
}
