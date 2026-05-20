/**
 * Email helper — thin wrapper around Brevo's SMTP API.
 *
 * Uses the same BREVO_API_KEY / BREVO_FROM_EMAIL / BREVO_FROM_NAME env vars
 * already present in the project (see treinamentos-convocacao-email.ts).
 *
 * Never throws — callers must not rely on email delivery for correctness.
 */

import type { Env } from '../types';

export interface EmailPayload {
  to: { email: string; name?: string }[];
  subject: string;
  textContent: string;
  htmlContent: string;
}

export async function sendEmail(env: Env, payload: EmailPayload): Promise<boolean> {
  if (!env.BREVO_API_KEY || !env.BREVO_FROM_EMAIL) {
    console.warn('[email] BREVO not configured — skipping');
    return false;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: env.BREVO_FROM_EMAIL,
          name: env.BREVO_FROM_NAME || 'AirTrust',
        },
        to: payload.to,
        subject: payload.subject,
        textContent: payload.textContent,
        htmlContent: payload.htmlContent,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[email] Brevo error:', response.status, err);
      return false;
    }

    console.log('[email] Sent to', payload.to.map((t) => t.email).join(', '));
    return true;
  } catch (err) {
    console.error('[email] Failed to send:', err);
    return false;
  }
}
