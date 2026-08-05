import { beforeEach, describe, expect, it, vi } from 'vitest';

const appFetchMock = vi.fn();
vi.mock('@/react-app/lib/app-fetch', () => ({ appFetch: appFetchMock }));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeJwt(tenantId: number): string {
  return `header.${btoa(JSON.stringify({ empresa_id: tenantId, exp: 4_102_444_800 }))}.signature`;
}

describe('frontend service API contracts', () => {
  beforeEach(async () => {
    appFetchMock.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('airtrust_token', makeJwt(1));
    const { funcionariosService } = await import('@/services/funcionarios.service');
    funcionariosService.limparCache();
  });

  it('returns an employee entity instead of the API envelope', async () => {
    appFetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { id: 7, nome: 'Empresa A' } }),
    );
    const { funcionariosService } = await import('@/services/funcionarios.service');

    await expect(funcionariosService.buscarPorId('7')).resolves.toEqual({
      id: 7,
      nome: 'Empresa A',
    });
  });

  it('does not reuse employee ID 7 across tenants', async () => {
    appFetchMock
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 7, nome: 'Empresa A' } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 7, nome: 'Empresa B' } }))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { id: 7, nome: 'Empresa A nova' } }),
      );
    const { funcionariosService } = await import('@/services/funcionarios.service');
    const tenant = await import('@/react-app/lib/tenant-data-layer');

    expect((await funcionariosService.buscarPorId('7')).nome).toBe('Empresa A');
    sessionStorage.setItem('airtrust_token', makeJwt(2));
    tenant.resetTenantDataLayer({ tenantId: 2, reason: 'tenant-switch', broadcast: false });
    expect((await funcionariosService.buscarPorId('7')).nome).toBe('Empresa B');
    sessionStorage.setItem('airtrust_token', makeJwt(1));
    tenant.resetTenantDataLayer({ tenantId: 1, reason: 'tenant-switch', broadcast: false });
    expect((await funcionariosService.buscarPorId('7')).nome).toBe('Empresa A nova');
    expect(appFetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns export as Blob', async () => {
    const expected = new Blob(['employee-export'], { type: 'text/csv' });
    appFetchMock.mockResolvedValueOnce(
      new Response('employee-export', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      }),
    );
    const { funcionariosService } = await import('@/services/funcionarios.service');

    const result = await funcionariosService.exportar();
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBe(expected.size);
    expect(result.type).toBe('text/csv');
  });

  it('returns a created schedule entity instead of an envelope', async () => {
    appFetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { id: 11, status: 'AGENDADO' } }),
    );
    const { agendamentosService } = await import('@/services/agendamentos.service');

    await expect(agendamentosService.criar({ status: 'AGENDADO' } as never)).resolves.toMatchObject(
      { id: 11, status: 'AGENDADO' },
    );
  });

  it.each([
    [401, 'session-expired'],
    [403, 'permission'],
    [500, 'server'],
  ])('classifies HTTP %s without turning it into empty data', async (status, kind) => {
    appFetchMock.mockResolvedValueOnce(jsonResponse({ error: 'failure' }, status));
    const { funcionariosService } = await import('@/services/funcionarios.service');

    await expect(funcionariosService.buscarPorId('9')).rejects.toMatchObject({
      status,
      kind,
    });
  });
});
