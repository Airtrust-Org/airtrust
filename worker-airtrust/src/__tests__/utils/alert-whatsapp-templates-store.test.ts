import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../types';
import {
  refreshLocalWhatsAppTemplateApproval,
  type LocalWhatsAppTemplateRecord,
} from '../../utils/alert-whatsapp-templates-store';

const env = {
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: 'token_test',
} as Env;

const existingRecord: LocalWhatsAppTemplateRecord = {
  template_key: 'ead_expiring',
  provider: 'twilio',
  friendly_name: 'AirTrust alerta EAD a vencer',
  template_name: 'airtrust_alerta_ead_a_vencer',
  category: 'UTILITY',
  language: 'pt_BR',
  body_text: 'body',
  variables_json: '[]',
  twilio_content_sid: 'HX0123456789abcdef0123456789abcdef',
  approval_status: 'received',
  approval_error: null,
  approval_payload_json: null,
  last_synced_at: '2026-09-21 20:55:51',
  updated_at: '2026-09-21 20:55:51',
};

afterEach(() => vi.unstubAllGlobals());

describe('refreshLocalWhatsAppTemplateApproval', () => {
  it('refreshes received to approved using the provider approval endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            sid: existingRecord.twilio_content_sid,
            whatsapp: {
              type: 'whatsapp',
              status: 'approved',
              category: 'UTILITY',
              rejection_reason: '',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const writes: unknown[][] = [];
    const db = {
      prepare: () => ({
        bind: (...args: unknown[]) => ({
          run: async () => {
            writes.push(args);
            return {};
          },
        }),
      }),
    } as unknown as D1Database;

    const refreshed = await refreshLocalWhatsAppTemplateApproval(
      env,
      db,
      'ead_expiring',
      existingRecord,
    );

    expect(refreshed?.approval_status).toBe('approved');
    expect(refreshed?.approval_error).toBeNull();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[0]).toBe('approved');
    expect(writes[0]?.[3]).toBe('ead_expiring');
  });

  it('keeps the last known state when the provider status lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('provider unavailable'))));
    const db = {
      prepare: vi.fn(() => {
        throw new Error('must not write when provider lookup fails');
      }),
    } as unknown as D1Database;

    const refreshed = await refreshLocalWhatsAppTemplateApproval(
      env,
      db,
      'ead_expiring',
      existingRecord,
    );

    expect(refreshed?.approval_status).toBe('received');
  });
});
