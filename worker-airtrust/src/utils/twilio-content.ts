import type { Env } from '../types';
import type { AlertWhatsAppTemplateDefinition } from './whatsapp-templates';

type TwilioContentRecord = {
  sid: string;
  friendly_name?: string;
  language?: string;
  types?: Record<string, unknown>;
};

type TwilioApprovalResponse = {
  status?: string;
  name?: string;
  category?: string;
  rejection_reason?: string;
  message?: string;
};

function getTwilioAuthHeader(env: Env): string {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error('TWILIO_NOT_CONFIGURED');
  }

  return `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`;
}

async function twilioContentRequest<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://content.twilio.com${path}`, {
    ...init,
    headers: {
      Authorization: getTwilioAuthHeader(env),
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TWILIO_CONTENT_ERROR: ${response.status} - ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function createTwilioContentTemplate(
  env: Env,
  template: AlertWhatsAppTemplateDefinition,
): Promise<TwilioContentRecord> {
  return twilioContentRequest<TwilioContentRecord>(env, '/v1/Content', {
    method: 'POST',
    body: JSON.stringify({
      friendly_name: template.friendlyName,
      language: template.language,
      variables: Object.fromEntries(
        template.variables.map((variable) => [variable.id, variable.sample]),
      ),
      types: {
        'twilio/text': {
          body: template.bodyText,
        },
      },
    }),
  });
}

export async function getTwilioContentTemplate(
  env: Env,
  contentSid: string,
): Promise<TwilioContentRecord> {
  return twilioContentRequest<TwilioContentRecord>(env, `/v1/Content/${contentSid}`, {
    method: 'GET',
  });
}

export async function submitTwilioWhatsAppApproval(
  env: Env,
  contentSid: string,
  template: AlertWhatsAppTemplateDefinition,
): Promise<TwilioApprovalResponse> {
  return twilioContentRequest<TwilioApprovalResponse>(
    env,
    `/v1/Content/${contentSid}/ApprovalRequests/whatsapp`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: template.templateName,
        category: template.category,
      }),
    },
  );
}
