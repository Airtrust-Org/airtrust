import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const empresaId = Number(c.req.header('x-empresa-id') || 1);
    c.set('userId', 101);
    c.set('userRole', c.req.header('x-role') || 'manager');
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
}));

vi.mock('../../shared/syncEscalaEventosExternos', () => ({
  removeManagedEscalaEvents: vi.fn(async () => undefined),
}));

vi.mock('../../routes/simuladores-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../routes/simuladores-shared')>();
  return {
    ...actual,
    syncSessaoEscalaEventos: vi.fn(async () => undefined),
    getSimuladorModeloAeronave: vi.fn(async () => 'AW139'),
    resolveTemplateIdSessao: vi.fn(async () => 701),
  };
});

import simuladoresSessoesRoutes from '../../routes/simuladores-sessoes';

type QueryLog = {
  sql: string;
  binds: unknown[];
  method: 'first' | 'all' | 'run';
};

type SessionRow = {
  id: string;
  empresa_id: number;
  simulador_id: number | null;
  template_id: number | null;
  nome: string | null;
  tipo_sessao: string | null;
  data: string;
  status: string | null;
  observacoes: string | null;
  deleted_at: string | null;
};

type ParticipantRow = {
  id: number;
  uuid: string;
  sessao_id: string;
  funcionario_id: number;
  funcao: string;
  presente: number;
  status: string;
  deleted_at: string | null;
};

type FuncionarioRow = {
  id: number;
  empresa_id: number;
  nome: string;
  ativo: number;
  is_instrutor: number;
  deleted_at: string | null;
};

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createSimuladoresDb() {
  const logs: QueryLog[] = [];
  const sessions: SessionRow[] = [
    {
      id: 'sess-1',
      empresa_id: 1,
      simulador_id: 10,
      template_id: 701,
      nome: 'Sessao tenant A',
      tipo_sessao: 'PER',
      data: '2026-06-04',
      status: 'AGENDADO',
      observacoes: null,
      deleted_at: null,
    },
    {
      id: 'sess-2',
      empresa_id: 2,
      simulador_id: 20,
      template_id: 702,
      nome: 'Sessao tenant B',
      tipo_sessao: 'PER',
      data: '2026-06-05',
      status: 'AGENDADO',
      observacoes: null,
      deleted_at: null,
    },
  ];
  const participants: ParticipantRow[] = [
    {
      id: 1,
      uuid: 'part-a',
      sessao_id: 'sess-1',
      funcionario_id: 11,
      funcao: 'ALUNO',
      presente: 1,
      status: 'CONFIRMADO',
      deleted_at: null,
    },
    {
      id: 2,
      uuid: 'part-b',
      sessao_id: 'sess-2',
      funcionario_id: 22,
      funcao: 'ALUNO',
      presente: 1,
      status: 'CONFIRMADO',
      deleted_at: null,
    },
  ];
  const funcionarios: FuncionarioRow[] = [
    { id: 11, empresa_id: 1, nome: 'Instrutor A', ativo: 1, is_instrutor: 1, deleted_at: null },
    { id: 12, empresa_id: 1, nome: 'Aluno A', ativo: 1, is_instrutor: 0, deleted_at: null },
    { id: 22, empresa_id: 2, nome: 'Instrutor B', ativo: 1, is_instrutor: 1, deleted_at: null },
  ];

  const db = {
    prepare: vi.fn((sql: string) => {
      const normalized = normalizeSql(sql);
      let binds: unknown[] = [];

      const statement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return statement;
        },
        first: async <T = unknown>() => {
          logs.push({ sql: normalized, binds, method: 'first' });

          // operational-domain-access.ts: isTenantRbacEnabled — legacy tenant.
          if (normalized.includes('FROM empresas WHERE id')) {
            return { operational_domain_rbac_enabled: 0 } as unknown as T;
          }

          if (
            normalized.includes(
              'SELECT * FROM simulador_agendamentos WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
            )
          ) {
            const [sessaoId, empresaId] = binds as [string, number];
            return (
              sessions.find(
                (session) =>
                  session.id === sessaoId &&
                  session.empresa_id === empresaId &&
                  session.deleted_at === null,
              ) || null
            ) as T | null;
          }

          if (
            normalized.includes(
              'FROM simulador_agendamentos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
            )
          ) {
            const [sessaoId, empresaId] = binds as [string, number];
            return (
              sessions.find(
                (session) =>
                  session.id === sessaoId &&
                  session.empresa_id === empresaId &&
                  session.deleted_at === null,
              ) || null
            ) as T | null;
          }

          if (
            normalized.includes(
              'FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
            )
          ) {
            const [funcionarioId, empresaId] = binds as [number, number];
            return (
              funcionarios.find(
                (funcionario) =>
                  funcionario.id === funcionarioId &&
                  funcionario.empresa_id === empresaId &&
                  funcionario.deleted_at === null,
              ) || null
            ) as T | null;
          }

          if (
            normalized.includes(
              'FROM sessoes_participantes sp INNER JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id AND sa.empresa_id = ? AND sa.deleted_at IS NULL WHERE sp.id = ? AND sp.deleted_at IS NULL LIMIT 1',
            )
          ) {
            const [empresaId, participanteId] = binds as [number, string];
            const participant = participants.find(
              (item) => String(item.id) === String(participanteId) && item.deleted_at === null,
            );
            if (!participant) return null as T | null;
            const session = sessions.find(
              (item) =>
                item.id === participant.sessao_id &&
                item.empresa_id === empresaId &&
                item.deleted_at === null,
            );
            if (!session) return null as T | null;
            return {
              id: participant.id,
              sessao_id: participant.sessao_id,
              funcionario_id: participant.funcionario_id,
              funcao: participant.funcao,
              presente: participant.presente,
            } as T;
          }

          if (
            normalized.includes('FROM funcionarios') &&
            normalized.includes('WHERE id = ?') &&
            normalized.includes('empresa_id = ?') &&
            normalized.includes('deleted_at IS NULL') &&
            normalized.includes('as is_instrutor')
          ) {
            const [funcionarioId, empresaId] = binds as [number, number];
            const funcionario = funcionarios.find(
              (item) =>
                item.id === Number(funcionarioId) &&
                item.empresa_id === Number(empresaId) &&
                item.deleted_at === null,
            );
            return funcionario
              ? ({ is_instrutor: funcionario.is_instrutor } as T)
              : (null as T | null);
          }

          return null as T | null;
        },
        all: async <T = unknown>() => {
          logs.push({ sql: normalized, binds, method: 'all' });

          if (normalized.includes("PRAGMA table_info('funcionarios')")) {
            return {
              results: [
                { name: 'id' },
                { name: 'empresa_id' },
                { name: 'is_instrutor' },
              ] as T[],
            };
          }

          if (
            normalized.includes(
              'FROM funcionarios WHERE deleted_at IS NULL AND ativo = 1 AND is_instrutor = 1 AND empresa_id = ? ORDER BY nome LIMIT ? OFFSET ?',
            )
          ) {
            const [empresaId] = binds as [number, number, number];
            return {
              results: funcionarios
                .filter(
                  (funcionario) =>
                    funcionario.empresa_id === empresaId &&
                    funcionario.ativo === 1 &&
                    funcionario.is_instrutor === 1 &&
                    funcionario.deleted_at === null,
                )
                .map((funcionario) => ({
                  id: funcionario.id,
                  nome: funcionario.nome,
                })) as T[],
            };
          }

          if (
            normalized.includes(
              'FROM sessoes_participantes sp INNER JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id AND sa.empresa_id = ? AND sa.deleted_at IS NULL LEFT JOIN funcionarios f ON sp.funcionario_id = f.id AND f.empresa_id = ? AND f.deleted_at IS NULL WHERE sp.sessao_id = ? AND sp.deleted_at IS NULL',
            )
          ) {
            const [empresaId, _funcEmpresaId, sessaoId] = binds as [number, number, string];
            return {
              results: participants
                .filter(
                  (participant) =>
                    participant.sessao_id === sessaoId &&
                    participant.deleted_at === null &&
                    sessions.some(
                      (session) =>
                        session.id === participant.sessao_id &&
                        session.empresa_id === empresaId &&
                        session.deleted_at === null,
                    ),
                )
                .map((participant) => ({
                  ...participant,
                  funcionario_nome:
                    funcionarios.find((funcionario) => funcionario.id === participant.funcionario_id)?.nome || null,
                })) as T[],
            };
          }

          if (
            normalized.includes(
              'FROM sessoes_checks sc INNER JOIN qualificacoes_tipos qt ON sc.qualificacao_tipo_id = qt.id AND qt.deleted_at IS NULL AND qt.ativo = 1 AND qt.empresa_id = ? LEFT JOIN sessoes_checks_resultados scr ON sc.id = scr.sessao_check_id AND scr.deleted_at IS NULL WHERE sc.sessao_id = ? AND sc.deleted_at IS NULL ORDER BY qt.codigo',
            )
          ) {
            return { results: [] as T[] };
          }

          if (
            normalized.includes(
              'FROM modelos_sessao_checks msc INNER JOIN qualificacoes_tipos qt ON qt.id = msc.qualificacao_tipo_id WHERE msc.modelo_id = ? AND msc.deleted_at IS NULL AND qt.deleted_at IS NULL AND qt.ativo = 1 AND qt.empresa_id = ? ORDER BY qt.codigo',
            )
          ) {
            const [modeloId, empresaId] = binds as [number, number];
            if (modeloId !== 701) {
              return { results: [] as T[] };
            }

            const rows = empresaId === 1 ? [{ qualificacao_tipo_id: 501, codigo: 'FAP14', nome: 'Check A', descricao: null }] : [];
            return { results: rows as T[] };
          }

          return { results: [] as T[] };
        },
        run: async () => {
          logs.push({ sql: normalized, binds, method: 'run' });

          if (
            normalized.includes(
              'INSERT INTO sessoes_participantes(uuid,sessao_id,funcionario_id,funcao,status)VALUES(?,?,?,?,?)',
            )
          ) {
            const [uuid, sessaoId, funcionarioId, funcao, status] = binds as [
              string,
              string,
              number,
              string,
              string,
            ];
            const nextId = participants.length + 1;
            participants.push({
              id: nextId,
              uuid,
              sessao_id: sessaoId,
              funcionario_id: funcionarioId,
              funcao,
              presente: 1,
              status,
              deleted_at: null,
            });
            return { meta: { changes: 1, last_row_id: nextId } };
          }

          if (
            normalized.includes(
              "UPDATE sessoes_participantes AS sp SET funcao=?,presente=?,updated_at=datetime('now') WHERE sp.id=? AND sp.sessao_id=? AND sp.deleted_at IS NULL",
            )
          ) {
            const [funcao, presente, participanteId, sessaoId] = binds as [string, number, string, string];
            const participant = participants.find(
              (item) => String(item.id) === String(participanteId) && item.sessao_id === sessaoId,
            );
            if (participant && participant.deleted_at === null) {
              participant.funcao = funcao;
              participant.presente = presente;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }

          if (
            normalized.includes(
              "UPDATE sessoes_participantes AS sp SET deleted_at=datetime('now') WHERE sp.id=? AND sp.sessao_id=? AND sp.deleted_at IS NULL",
            )
          ) {
            const [participanteId, sessaoId] = binds as [string, string];
            const participant = participants.find(
              (item) => String(item.id) === String(participanteId) && item.sessao_id === sessaoId,
            );
            if (participant && participant.deleted_at === null) {
              participant.deleted_at = '2026-06-04T12:00:00Z';
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }

          return { meta: { changes: 0, last_row_id: 0 } };
        },
      };

      return statement;
    }),
  } as unknown as D1Database;

  return { db, logs };
}

describe('simuladores sessoes data-quality guards', () => {
  it('scopes /instrutores by tenant and returns only same-tenant instructors', async () => {
    const { db, logs } = createSimuladoresDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/instrutores', { headers: { 'x-empresa-id': '1' } }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { success: boolean; data: Array<{ id: number }> };
    expect(payload.success).toBe(true);
    expect(payload.data.map((row) => row.id)).toEqual([11]);
    expect(logs.some((log) => log.sql.includes('empresa_id = ?') && log.method === 'all')).toBe(true);
  });

  it('blocks cross-tenant participant reads and preserves same-tenant reads', async () => {
    const { db } = createSimuladoresDb();

    const okResponse = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/sess-1/participantes', { headers: { 'x-empresa-id': '1' } }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(okResponse.status).toBe(200);
    const okPayload = (await okResponse.json()) as { success: boolean; data: Array<{ id: number }> };
    expect(okPayload.success).toBe(true);
    expect(okPayload.data.map((row) => row.id)).toEqual([1]);

    const forbiddenResponse = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/sess-2/participantes', { headers: { 'x-empresa-id': '1' } }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(forbiddenResponse.status).toBe(404);
  });

  it('rejects cross-tenant instructor reassignment before updating the session', async () => {
    const { db, logs } = createSimuladoresDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/sess-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-empresa-id': '1' },
        body: JSON.stringify({ instrutor_id: 22 }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Instrutor inválido para esta empresa.',
    });
    expect(
      logs.some(
        (log) =>
          log.method === 'first' &&
          log.sql.includes('FROM funcionarios') &&
          log.sql.includes('empresa_id = ?') &&
          Number(log.binds[0]) === 22 &&
          Number(log.binds[1]) === 1,
      ),
    ).toBe(true);
    expect(
      logs.some(
        (log) =>
          log.method === 'run' &&
          log.sql.includes('UPDATE simulador_agendamentos SET'),
      ),
    ).toBe(false);
  });

  it('tenant-scopes employee joins in session list queries', async () => {
    const { db, logs } = createSimuladoresDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes?limit=10', {
        headers: { 'x-empresa-id': '1', 'x-role': 'manager' },
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const listQuery = logs.find(
      (log) => log.method === 'all' && log.sql.includes('FROM simulador_agendamentos sa'),
    );
    expect(listQuery?.sql).toContain('fi.empresa_id = sa.empresa_id');
    expect(listQuery?.sql).toContain('fe.empresa_id = sa.empresa_id');
  });

  it('rejects participant creation when funcionario belongs to another tenant', async () => {
    const { db, logs } = createSimuladoresDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/sess-1/participantes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-empresa-id': '1' },
        body: JSON.stringify({ funcionario_id: 22, funcao: 'ALUNO' }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Funcionário não encontrado',
    });
    expect(logs.some((log) => log.sql.includes('INSERT INTO sessoes_participantes'))).toBe(false);
  });

  it('rejects participant creation when sessao does not exist and avoids orphan inserts', async () => {
    const { db, logs } = createSimuladoresDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/sess-missing/participantes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-empresa-id': '1' },
        body: JSON.stringify({ funcionario_id: 11, funcao: 'ALUNO' }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Sessão não encontrada',
    });
    expect(logs.some((log) => log.sql.includes('INSERT INTO sessoes_participantes'))).toBe(false);
  });

  it('blocks cross-tenant participant update and delete by id', async () => {
    const { db } = createSimuladoresDb();

    const updateResponse = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/participantes/2', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-empresa-id': '1' },
        body: JSON.stringify({ funcao: 'INSTRUTOR' }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(updateResponse.status).toBe(404);

    const deleteResponse = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/participantes/2', {
        method: 'DELETE',
        headers: { 'x-empresa-id': '1', 'x-role': 'manager' },
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(deleteResponse.status).toBe(404);
  });

  it('blocks cross-tenant checks and keeps fallback checks tenant-scoped', async () => {
    const { db, logs } = createSimuladoresDb();

    const tenantResponse = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/sess-1/checks', { headers: { 'x-empresa-id': '1' } }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(tenantResponse.status).toBe(200);
    const tenantPayload = (await tenantResponse.json()) as {
      success: boolean;
      data: Array<{ qualificacao_tipo_id: number }>;
    };
    expect(tenantPayload.success).toBe(true);
    expect(tenantPayload.data.map((row) => row.qualificacao_tipo_id)).toEqual([501]);
    expect(
      logs.some(
        (log) =>
          log.sql.includes('qt.empresa_id = ?') &&
          log.sql.includes('FROM modelos_sessao_checks') &&
          log.method === 'all',
      ),
    ).toBe(true);

    const forbiddenResponse = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/sess-2/checks', { headers: { 'x-empresa-id': '1' } }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(forbiddenResponse.status).toBe(404);
  });
});
