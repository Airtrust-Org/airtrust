import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Env } from '../../types';

// empresaId é controlado por teste via este mutável — simula getEmpresaIdSafe()
// retornando `number | undefined`, exatamente como em produção (frms-shared.ts).
const empresaIdBox: { value: number | undefined } = vi.hoisted(() => ({ value: 42 }));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

const { publishDomainEvent, logDomainEventError, auditFrms } = vi.hoisted(() => ({
  publishDomainEvent: vi.fn(async () => undefined),
  logDomainEventError: vi.fn(),
  auditFrms: vi.fn(async () => undefined),
}));

vi.mock('../../routes/frms-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../routes/frms-shared')>();
  return {
    ...actual,
    safe: (fn: (c: any) => Promise<Response>) => fn,
    getEmpresaIdSafe: () => empresaIdBox.value,
    assertTripulanteEmpresa: async () => null,
    assertJornadaEmpresa: async () => null,
    resolveFuncionarioId: async () => '7',
    auditFrms,
    logDomainEventError,
  };
});

vi.mock('../../lib/frms/db-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/db-service')>();
  return {
    ...actual,
    carregarLimites: async () => ({}) as any,
    salvarJornada: async () => ({ jornada: { id: 501 }, bloqueado: false }) as any,
  };
});

vi.mock('../../shared/domainEvents', () => ({
  publishDomainEvent,
}));

vi.mock('../../shared/getTripulanteOperacional', () => ({
  getFrmsOperationalState: async () => ({ frms_score: 10, frms_status: 'normal' }) as any,
}));

vi.mock('../../shared/handlers/horasVooFromFrms.handler', () => ({
  syncHorasVooFromFrmsJornada: vi.fn(async () => undefined),
}));

import frmsRoutes from '../../routes/frms';

function jornadaRequest() {
  return new Request('http://localhost/jornadas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripulante_id: '7',
      data: '2026-07-08',
      status: 'ES',
    }),
  });
}

const fakeDb = {} as unknown as Env['DB'];

describe('frms POST /jornadas — empresaId guard em domain events', () => {
  beforeEach(() => {
    publishDomainEvent.mockClear();
    logDomainEventError.mockClear();
    auditFrms.mockClear();
    empresaIdBox.value = 42;
  });

  it('caminho feliz: publica evento FRMS com empresa_id quando empresaId está presente', async () => {
    empresaIdBox.value = 42;

    const response = await frmsRoutes.fetch(
      jornadaRequest(),
      { DB: fakeDb } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { success: boolean };
    expect(payload.success).toBe(true);

    expect(publishDomainEvent).toHaveBeenCalledWith(
      fakeDb,
      'frms',
      'FRMS_AVALIACAO_CRIADA',
      expect.objectContaining({ empresa_id: 42 }),
    );
  });

  it('sem empresaId no contexto: nao publica evento FRMS mas ainda salva a jornada com sucesso', async () => {
    empresaIdBox.value = undefined;

    const response = await frmsRoutes.fetch(
      jornadaRequest(),
      { DB: fakeDb } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { success: boolean };
    expect(payload.success).toBe(true);

    expect(publishDomainEvent).not.toHaveBeenCalled();
    expect(logDomainEventError).toHaveBeenCalledWith(
      expect.anything(),
      'FRMS_STATUS_CRITICO',
      expect.any(Error),
      expect.objectContaining({ funcionario_id: '7' }),
    );
  });
});
