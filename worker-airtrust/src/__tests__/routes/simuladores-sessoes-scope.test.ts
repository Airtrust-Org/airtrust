import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const getEmployeeSectorAccessMock = vi.hoisted(() => vi.fn());

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const empresaId = Number(c.env?.__mockEmpresaId ?? 6);
    c.set('userId', Number(c.env?.__mockUserId ?? 101));
    c.set('userRole', String(c.env?.__mockRole || 'manager'));
    c.set('empresaId', empresaId);
    c.set('tenantContext', {
      empresaId,
      empresaCodigo: `tenant-${empresaId}`,
      empresaNome: `Tenant ${empresaId}`,
      role: 'manager',
      plano: 'pro',
      permissions: ['read', 'write'],
    });
    await next();
  },
  optionalAuth: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: (...args: unknown[]) => getEmployeeSectorAccessMock(...args),
}));

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
  return {
    ...actual,
    findSessaoConflict: vi.fn(async () => null),
    syncSessaoEscalaEventos: vi.fn(async () => undefined),
    audit: vi.fn(async () => undefined),
    normalizeChecksSessao: vi.fn(async () => []),
    getSimuladorModeloAeronave: vi.fn(async () => 'AW139'),
    resolveTemplateIdSessao: vi.fn(async () => 701),
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
  sendSimulatorSessionEmailNotifications: vi.fn(async () => []),
  shouldNotifySimulatorSessionUpdate: vi.fn(() => false),
}));

import simuladoresSessoesRoutes from '../../routes/simuladores-sessoes';

const FUNCIONARIO_SETORES = new Map<number, number>([
  [201, 10],
  [202, 20],
  [301, 10],
]);

function createSessoesDb() {
  const runs: Array<{ query: string; args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (query === 'PRAGMA table_info(simulador_agendamentos)') {
            return null;
          }

          if (query.includes('SELECT f.id FROM usuarios u') && query.includes('JOIN funcionarios f')) {
            return { id: Number(args[0]) + 100 };
          }

          if (
            query.includes('SELECT id, empresa_id, instrutor_id, examinador_id') &&
            query.includes('FROM simulador_agendamentos')
          ) {
            const sessaoId = String(args[0]);
            if (sessaoId !== '501') return null;
            return {
              id: 501,
              empresa_id: 6,
              instrutor_id: 301,
              examinador_id: null,
            };
          }

          if (query.includes('FROM simulador_agendamentos sa') && query.includes('WHERE sa.id = ?')) {
            const sessaoId = String(args[0]);
            if (sessaoId !== '501') return null;
            return {
              id: 501,
              empresa_id: 6,
              simulador_id: 41,
              instrutor_id: 301,
              examinador_id: null,
              data: '2026-06-21',
              hora_inicio: '08:00',
              hora_fim: '10:00',
              tipo_sessao: 'PER',
              nome: 'Sessão Escopo',
              status: 'AGENDADO',
              observacoes: '',
              simulador_nome: 'Sim A',
              simulador_modelo: 'AW139',
              simulador_tipo: 'FSTD',
              simulador_aeronave_codigo: 'AW139',
              tipo_dispositivo: 'SIMULADOR',
              aeronave_id: null,
              aeronave_prefixo: null,
              aeronave_modelo: null,
              tipo_sessao_id: 701,
              tipo_sessao_codigo: 'PER',
              tipo_sessao_nome: 'Periódico',
              examinador_nome: null,
            };
          }

          if (
            query.includes('SELECT id, nome, matricula FROM funcionarios WHERE id=?') &&
            query.includes('empresa_id = ?')
          ) {
            return { id: 301, nome: 'Instrutor 301', matricula: 'I-301' };
          }

          if (query.includes('SELECT COUNT(DISTINCT id) AS total') && query.includes('FROM funcionarios')) {
            const ids = args.slice(0, -1).map((value) => Number(value));
            return { total: ids.length };
          }

          if (query.includes('FROM simuladores') && query.includes('WHERE id = ?')) {
            return { id: 41 };
          }

          if (query.includes('FROM simulador_agendamentos') && query.includes('WHERE id = ?') && query.includes('empresa_id = ?')) {
            const sessaoId = Number(args[0]);
            const empresaId = Number(args[1]);
            if (sessaoId === 501 && empresaId === 6) return { id: 501 };
            return null;
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

          if (query.includes('SELECT sp.*, f.nome as funcionario_nome')) {
            return {
              results: [
                {
                  id: 1,
                  sessao_id: 501,
                  funcionario_id: 201,
                  funcao: 'PIC',
                  status: 'CONFIRMADO',
                  funcionario_nome: 'Aluno 201',
                  funcionario_matricula: 'M-201',
                },
                {
                  id: 2,
                  sessao_id: 501,
                  funcionario_id: 202,
                  funcao: 'SIC',
                  status: 'CONFIRMADO',
                  funcionario_nome: 'Aluno 202',
                  funcionario_matricula: 'M-202',
                },
              ],
            };
          }

          if (
            query.includes('SELECT f.*, aluno.nome as aluno_nome, aluno.matricula as aluno_matricula') &&
            !query.includes('CASE')
          ) {
            return {
              results: [
                {
                  id: 901,
                  agendamento_slot_id: 501,
                  colaborador_id_aluno: 201,
                  instrutor_id: 301,
                  aluno_nome: 'Aluno 201',
                  aluno_matricula: 'M-201',
                },
                {
                  id: 902,
                  agendamento_slot_id: 501,
                  colaborador_id_aluno: 202,
                  instrutor_id: 301,
                  aluno_nome: 'Aluno 202',
                  aluno_matricula: 'M-202',
                },
              ],
            };
          }

          if (query.includes('SELECT id, setor_id') && query.includes('FROM funcionarios')) {
            const ids = args.slice(0, -1).map((value) => Number(value));
            return {
              results: ids.map((id) => ({
                id,
                setor_id: FUNCIONARIO_SETORES.get(id) ?? null,
              })),
            };
          }

          if (query.includes('FROM fichas_sessao f') && query.includes('CASE')) {
            return {
              results: [
                {
                  id: 901,
                  colaborador_id_aluno: 201,
                  instrutor_id: 301,
                  participante_nome: 'Aluno 201',
                },
                {
                  id: 902,
                  colaborador_id_aluno: 202,
                  instrutor_id: 301,
                  participante_nome: 'Aluno 202',
                },
              ],
            };
          }

          if (query.includes('FROM modelos_sessao_manobras')) {
            return { results: [] };
          }

          return { results: [] };
        },
        run: async () => {
          runs.push({ query, args });
          return { meta: { changes: 1, last_row_id: 777 } };
        },
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    }),
    batch: vi.fn(async () => []),
  } as unknown as D1Database;

  return { db, runs };
}

describe('simuladores sessoes scope guards', () => {
  it('GET /sessoes/:id fecha a sessão quando gestor setorial encontra participante fora do escopo', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'restricted',
      setorIds: [10],
      funcionarioId: null,
    });
    const { db } = createSessoesDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/501'),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'manager' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Não encontrada',
    });
  });

  it('GET /sessoes/:id entrega apenas os dados próprios para aluno participante', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'self',
      setorIds: [10],
      funcionarioId: 201,
    });
    const { db } = createSessoesDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/501'),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'aluno', __mockUserId: 101 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      sessao: {
        participantes: Array<{ funcionario_id: number }>;
        alunos: Array<{ id: number }>;
        fichas: Array<{ colaborador_id_aluno: number }>;
      };
    };
    expect(body.success).toBe(true);
    expect(body.sessao.participantes.map((row) => row.funcionario_id)).toEqual([201]);
    expect(body.sessao.alunos.map((row) => row.id)).toEqual([201]);
    expect(body.sessao.fichas.map((row) => row.colaborador_id_aluno)).toEqual([201]);
  });

  it('GET /sessoes/:id/fichas devolve apenas a própria ficha para aluno participante', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'self',
      setorIds: [10],
      funcionarioId: 201,
    });
    const { db } = createSessoesDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/501/fichas'),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'aluno', __mockUserId: 101 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ colaborador_id_aluno: number }>;
    };
    expect(body.success).toBe(true);
    expect(body.data.map((row) => row.colaborador_id_aluno)).toEqual([201]);
  });

  it('POST /sessoes bloqueia escrita setorial quando há participante fora do escopo', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'restricted',
      setorIds: [10],
      funcionarioId: null,
    });
    const { db, runs } = createSessoesDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulador_id: 41,
          instrutor_id: 301,
          tipo_sessao: 'PER',
          tipo_aeronave: 'AW139',
          data: '2026-06-21',
          horario_inicio: '08:00',
          horario_fim: '10:00',
          participantes: [
            { funcionario_id: 201, funcao: 'PIC' },
            { funcionario_id: 202, funcao: 'SIC' },
          ],
        }),
      }),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'manager' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'FUNCIONARIO_OUT_OF_SCOPE',
    });
    expect(runs.some((item) => item.query.startsWith('INSERT INTO simulador_agendamentos'))).toBe(
      false,
    );
  });

  it('POST /sessoes bloqueia escrita para perfil autoescopado', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'self',
      setorIds: [10],
      funcionarioId: 201,
    });
    const { db, runs } = createSessoesDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulador_id: 41,
          instrutor_id: 301,
          tipo_sessao: 'PER',
          tipo_aeronave: 'AW139',
          data: '2026-06-21',
          horario_inicio: '08:00',
          horario_fim: '10:00',
          participantes: [{ funcionario_id: 201, funcao: 'PIC' }],
        }),
      }),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'aluno', __mockUserId: 101 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    });
    expect(runs.some((item) => item.query.startsWith('INSERT INTO simulador_agendamentos'))).toBe(
      false,
    );
  });
});
