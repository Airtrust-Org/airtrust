import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('userRole', 'admin');
    c.set('empresaId', 6);
    c.set('tenantContext', {
      empresaId: 6,
      empresaCodigo: 'tenant-6',
      empresaNome: 'Tenant 6',
      role: 'admin',
      plano: 'pro',
      permissions: ['read', 'write'],
    });
    await next();
  },
  optionalAuth: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

let mockConflict: any = null;
const sendSimulatorSessionEmailNotificationsMock = vi.hoisted(() => vi.fn(async () => []));

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
  return {
    ...actual,
    findSessaoConflict: vi.fn(async () => mockConflict),
    syncSessaoEscalaEventos: vi.fn(async () => undefined),
    audit: vi.fn(async () => undefined),
    normalizeChecksSessao: vi.fn(async () => []),
    getSimuladorModeloAeronave: vi.fn(async () => 'AW139'),
    resolveTemplateIdSessao: vi.fn(async () => 501),
    criarQualificacoesPlanejadas: vi.fn(async () => ({
      criadas: 0,
      puladas: 0,
      conflitosUniques: 0,
      bloqueadasDataPassada: 0,
    })),
  };
});

vi.mock('../../shared/domainEvents', () => ({
  publishDomainEvent: vi.fn(async () => undefined),
}));

vi.mock('../../shared/syncEscalaEventosExternos', () => ({
  removeManagedEscalaEvents: vi.fn(async () => undefined),
}));

vi.mock('../../utils/whatsapp-send', () => ({
  sendWhatsAppMessage: vi.fn(async () => undefined),
}));

vi.mock('../../services/simuladores-session-notifications', () => ({
  loadSimulatorSessionNotificationData: vi.fn(async () => ({
    session: {
      id: 901,
      data: '2026-06-20',
      hora_inicio: '07:00',
      hora_fim: '09:00',
      tipo_sessao: 'PER',
      tema_sessao: 'Sessão simples',
      status: 'AGENDADO',
      observacoes: null,
      empresa_id: 6,
      tipo_dispositivo: 'SIMULADOR',
      simulador_nome: 'Sim 10',
      simulador_modelo: 'AW139',
      simulador_tipo: 'FSTD',
      instrutor_id: 201,
      instrutor_nome: 'Instrutor 201',
      instrutor_email: 'instrutor201@example.com',
      examinador_id: null,
      examinador_nome: null,
      examinador_email: null,
    },
    participants: [{ funcionario_id: 101, funcao: 'PIC', funcionario_nome: 'Aluno 101', funcionario_email: 'aluno101@example.com' }],
  })),
  sendSimulatorSessionEmailNotifications: (...args: unknown[]) =>
    (sendSimulatorSessionEmailNotificationsMock as any)(args[0], args[1], args[2], args[3]),
  shouldNotifySimulatorSessionUpdate: vi.fn(() => false),
}));

import simuladoresSessoesRoutes from '../../routes/simuladores-sessoes';

type QueryRun = { query: string; args: unknown[] };

function createDbForLegacyCharacterization() {
  const runs: QueryRun[] = [];
  const batches: Array<Array<{ query: string; args: unknown[] }>> = [];

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('SELECT COUNT(DISTINCT id) AS total') && query.includes('FROM funcionarios')) {
            const totalFuncionarios = args.length > 0 ? Number(args.length - 1) : 0;
            return { total: totalFuncionarios };
          }

          if (query.includes('SELECT id') && query.includes('FROM simuladores')) {
            return { id: 10 };
          }

          if (
            query.includes(
              'SELECT * FROM simulador_agendamentos WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
            )
          ) {
            return {
              id: 901,
              empresa_id: 6,
              simulador_id: 10,
              instrutor_id: 201,
              data: '2026-06-20',
              hora_inicio: '07:00',
              hora_fim: '09:00',
              duracao_minutos: 120,
              tipo_sessao: 'PER',
              nome: 'Sessão simples',
              status: 'AGENDADO',
              deleted_at: null,
            };
          }

          return null;
        },
        all: async () => {
          if (query === 'PRAGMA table_info(simulador_agendamentos)') {
            return {
              results: [
                { name: 'id' },
                { name: 'simulador_id' },
                { name: 'aeronave_id' },
                { name: 'tipo_dispositivo' },
                { name: 'empresa_id' },
              ],
            };
          }

          if (query === 'PRAGMA table_info(simuladores)') {
            // Production schema: `simuladores` has no empresa_id column.
            return {
              results: [
                { name: 'id' },
                { name: 'nome' },
                { name: 'modelo' },
                { name: 'tipo' },
                { name: 'deleted_at' },
              ],
            };
          }

          if (query.includes('FROM modelos_sessao_manobras')) {
            return { results: [] };
          }

          if (
            query.includes(
              'SELECT funcionario_id FROM sessoes_participantes WHERE sessao_id=? AND deleted_at IS NULL',
            )
          ) {
            return { results: [{ funcionario_id: 101 }] };
          }

          if (
            query.includes(
              'SELECT funcionario_id FROM sessoes_participantes WHERE sessao_id = ? AND deleted_at IS NULL',
            )
          ) {
            return { results: [{ funcionario_id: 101 }] };
          }

          return { results: [] };
        },
        run: async () => {
          runs.push({ query, args });

          if (query.startsWith('INSERT INTO simulador_agendamentos')) {
            return { meta: { changes: 1, last_row_id: 901 } };
          }
          if (query.startsWith('INSERT INTO fichas_sessao')) {
            return { meta: { changes: 1, last_row_id: 902 } };
          }

          return { meta: { changes: 1, last_row_id: 0 } };
        },
      }),
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ meta: { changes: 1, last_row_id: 0 } }),
    })),
    batch: vi.fn(async (statements: Array<{ run: () => Promise<{ meta: { last_row_id: number } }> }>) => {
      const currentBatch: Array<{ query: string; args: unknown[] }> = [];
      for (const statement of statements) {
        const mockStatement = statement as unknown as { statement?: { query?: string }; args?: unknown[]; run: () => Promise<any> };
        if (mockStatement.statement?.query) {
          currentBatch.push({
            query: String(mockStatement.statement.query),
            args: mockStatement.args || [],
          });
        }
        await statement.run();
      }
      batches.push(currentBatch);
      return [];
    }),
  } as unknown as D1Database;

  return { db, runs, batches };
}

describe('simuladores sessões legacy characterization', () => {
  const executionContext = {
    waitUntil: vi.fn(),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    mockConflict = null;
    sendSimulatorSessionEmailNotificationsMock.mockClear();
  });

  it('keeps the simple POST /sessoes flow creating one parent, one participant, and one ficha', async () => {
    const { db, runs } = createDbForLegacyCharacterization();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulador_id: 10,
          instrutor_id: 201,
          tipo_sessao: 'PER',
          tipo_aeronave: 'AW139',
          data: '2026-06-20',
          horario_inicio: '07:00',
          horario_fim: '09:00',
          participantes: [{ funcionario_id: 101, funcao: 'PIC' }],
        }),
      }),
      { DB: db } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(201);
    expect(runs.some((item) => item.query.startsWith('INSERT INTO simulador_agendamentos'))).toBe(true);
    expect(runs.some((item) => item.query.startsWith('INSERT INTO fichas_sessao'))).toBe(true);
  });

  it('keeps the legacy simulator conflict response on POST /sessoes', async () => {
    const { db } = createDbForLegacyCharacterization();
    mockConflict = {
      id: 88,
      hora_inicio: '07:00',
      hora_fim: '09:00',
    };

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulador_id: 10,
          instrutor_id: 201,
          tipo_sessao: 'PER',
          tipo_aeronave: 'AW139',
          data: '2026-06-20',
          horario_inicio: '07:00',
          horario_fim: '09:00',
          participantes: [{ funcionario_id: 101, funcao: 'PIC' }],
        }),
      }),
      { DB: db } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'SCHEDULE_CONFLICT',
    });
  });

  it('keeps DELETE /sessoes/:id as a soft-delete flow even after shared-session additive cleanup hooks', async () => {
    const { db, runs } = createDbForLegacyCharacterization();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/901', { method: 'DELETE' }),
      { DB: db } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(runs.some((item) => item.query.includes("UPDATE simulador_agendamentos SET deleted_at=datetime('now')"))).toBe(true);
    expect(runs.some((item) => item.query.includes("UPDATE fichas_sessao SET deleted_at=datetime('now') WHERE agendamento_slot_id=?"))).toBe(true);
    expect(sendSimulatorSessionEmailNotificationsMock).toHaveBeenCalledTimes(1);
    expect(sendSimulatorSessionEmailNotificationsMock).toHaveBeenCalledWith(
      expect.any(Object),
      db,
      901,
      expect.objectContaining({ reason: 'canceled', empresaId: 6 }),
    );
  });
});
