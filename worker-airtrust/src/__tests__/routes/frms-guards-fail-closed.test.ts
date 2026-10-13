import { describe, expect, it, vi } from 'vitest';
import type { FrmsAppContext } from '../../routes/frms-shared';
import {
  assertTripulanteEmpresa,
  assertJornadaEmpresa,
  assertAlertaEmpresa,
} from '../../routes/frms-shared';

function withoutTenant() {
  const prepare = vi.fn(() => {
    throw new Error('Tenant guard should deny before querying the database');
  });
  const c = {
    env: { DB: { prepare } },
    get: () => { throw new Error('No tenant in authenticated context'); },
    json: (payload: unknown, status: number) =>
      new Response(JSON.stringify(payload), {
        status, headers: { 'Content-Type': 'application/json' },
      }),
  } as unknown as FrmsAppContext;
  return { c, prepare };
}

describe('FRMS ownership guards — fail closed on missing empresa_id', () => {
  it.each([
    ['tripulante', assertTripulanteEmpresa],
    ['jornada', assertJornadaEmpresa],
    ['alerta', assertAlertaEmpresa],
  ] as const)('nega acesso a %s sem contexto tenant antes de qualquer leitura', async (_, check) => {
    const { c, prepare } = withoutTenant();
    const response = await check(c, '123');
    expect(response?.status).toBe(403);
    const payload = await response!.json() as { code: string; success: boolean };
    expect(payload).toMatchObject({
      success: false,
      code: 'FRMS_TENANT_CONTEXT_REQUIRED',
    });
    expect(prepare).not.toHaveBeenCalled();
  });
});
