/**
 * TEN-EDAPP-001 (Tenant Readiness Matrix V3) — webhook legado EdApp é
 * fail-closed (410) para qualquer método/path, zero write possível.
 */
import { describe, expect, it } from 'vitest';
import edappRouter from '../../routes/integracoes_edapp';
import type { Env } from '../../types';

describe('integracoes_edapp — tombstone fail-closed', () => {
  it.each(['GET', 'POST', 'PUT', 'DELETE'])(
    '%s qualquer path retorna 410 EDAPP_INTEGRATION_GONE, nunca escreve',
    async (method) => {
      const response = await edappRouter.fetch(
        new Request('http://localhost/webhook', { method, body: method === 'GET' ? undefined : '{}' }),
        {} as Env,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(410);
      const body = await response.json();
      expect(body).toMatchObject({ success: false, code: 'EDAPP_INTEGRATION_GONE' });
    },
  );
});
