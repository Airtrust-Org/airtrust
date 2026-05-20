import type { Env } from '../types';
import { normalizeWhatsAppPhone } from './whatsapp';

export type WhatsAppTemplateSendOptions = {
  contentSid: string;
  contentVariables: Record<string, string>;
  templateKey: string;
  templateName: string;
  approvalStatus?: string | null;
};

export async function sendWhatsAppMessage(
  env: Env,
  telefone: string,
  mensagem: string,
  statusCallbackUrl?: string,
  templateOptions?: WhatsAppTemplateSendOptions,
): Promise<{
  provider: 'generic' | 'twilio';
  destination: string;
  source?: string;
  providerStatus?: string;
  providerMessageId?: string;
  templateKey?: string;
  templateName?: string;
  templateApprovalStatus?: string | null;
  messageMode?: 'free-form' | 'template';
}> {
  const telefoneDestino = normalizeWhatsAppPhone(telefone);

  if (templateOptions && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    const twilioEndpoint = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
    const authHeader = `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`;
    const requestBody = new URLSearchParams({
      To: telefoneDestino.whatsapp,
      ContentSid: templateOptions.contentSid,
      ContentVariables: JSON.stringify(templateOptions.contentVariables),
    });

    if (env.TWILIO_MESSAGING_SERVICE_SID) {
      requestBody.set('MessagingServiceSid', env.TWILIO_MESSAGING_SERVICE_SID);
    } else if (env.TWILIO_WHATSAPP_FROM) {
      const twilioFrom = env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
        ? env.TWILIO_WHATSAPP_FROM
        : `whatsapp:${env.TWILIO_WHATSAPP_FROM}`;
      requestBody.set('From', twilioFrom);
    } else {
      throw new Error('TWILIO_WHATSAPP_FROM_NOT_CONFIGURED');
    }

    if (statusCallbackUrl) {
      requestBody.set('StatusCallback', statusCallbackUrl);
      requestBody.set('StatusCallbackMethod', 'POST');
    }

    const response = await fetch(twilioEndpoint, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: requestBody.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TWILIO_WHATSAPP_ERROR: ${response.status} - ${errorText}`);
    }

    const twilioPayload = (await response.json().catch(() => null)) as {
      sid?: string;
      status?: string;
      error_code?: string | number | null;
      error_message?: string | null;
      from?: string;
      messaging_service_sid?: string;
    } | null;

    if (twilioPayload?.error_code || twilioPayload?.error_message) {
      throw new Error(
        `TWILIO_WHATSAPP_ERROR: ${twilioPayload.error_code || 'UNKNOWN'} - ${twilioPayload.error_message || 'Erro desconhecido'}`,
      );
    }

    return {
      provider: 'twilio',
      destination: telefoneDestino.whatsapp,
      source:
        twilioPayload?.from ||
        env.TWILIO_WHATSAPP_FROM ||
        env.TWILIO_MESSAGING_SERVICE_SID ||
        undefined,
      providerStatus: twilioPayload?.status || 'accepted',
      providerMessageId: twilioPayload?.sid,
      templateKey: templateOptions.templateKey,
      templateName: templateOptions.templateName,
      templateApprovalStatus: templateOptions.approvalStatus,
      messageMode: 'template',
    };
  }

  if (env.WHATSAPP_API_URL && env.WHATSAPP_API_TOKEN) {
    const response = await fetch(env.WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: telefoneDestino.e164,
        message: mensagem,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WHATSAPP_ERROR: ${response.status} - ${errorText}`);
    }

    return {
      provider: 'generic',
      destination: telefoneDestino.e164,
      providerStatus: 'accepted',
      messageMode: 'free-form',
    };
  }

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
    throw new Error('WHATSAPP_NOT_CONFIGURED');
  }

  const twilioFrom = env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
    ? env.TWILIO_WHATSAPP_FROM
    : `whatsapp:${env.TWILIO_WHATSAPP_FROM}`;
  const twilioEndpoint = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const authHeader = `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`;

  const requestBody = new URLSearchParams({
    From: twilioFrom,
    To: telefoneDestino.whatsapp,
    Body: mensagem,
  });

  if (statusCallbackUrl) {
    requestBody.set('StatusCallback', statusCallbackUrl);
    requestBody.set('StatusCallbackMethod', 'POST');
  }

  const response = await fetch(twilioEndpoint, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: requestBody.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TWILIO_WHATSAPP_ERROR: ${response.status} - ${errorText}`);
  }

  const twilioPayload = (await response.json().catch(() => null)) as {
    sid?: string;
    status?: string;
    error_code?: string | number | null;
    error_message?: string | null;
  } | null;

  if (twilioPayload?.error_code || twilioPayload?.error_message) {
    throw new Error(
      `TWILIO_WHATSAPP_ERROR: ${twilioPayload.error_code || 'UNKNOWN'} - ${twilioPayload.error_message || 'Erro desconhecido'}`,
    );
  }

  return {
    provider: 'twilio',
    destination: telefoneDestino.whatsapp,
    source: twilioFrom,
    providerStatus: twilioPayload?.status || 'accepted',
    providerMessageId: twilioPayload?.sid,
    messageMode: 'free-form',
  };
}
