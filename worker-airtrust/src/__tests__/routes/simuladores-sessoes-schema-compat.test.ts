import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const empresaId = Number(c.env?.__mockEmpresaId ?? 6);
    c.set('userId', 1);
    c.set('userRole', String(c.env?.__mockRole || 'admin'));
    c.set('empresaId', empresaId);
    c.set('tenantContext', {
      empresaId,
      empresaCodigo: `tenant-${empresaId}`,
      empresaNome: `Tenant ${empresaId}`,
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

import simuladoresSessoesRoutes from '../../routes/simuladores-sessoes';

type CompatDbOptions = {
  hasTipoDispositivo: boolean;
  hasAeronaveId: boolean;
};

function createCompatDb(opts: CompatDbOptions) {
  const queries: string[] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      queries.push(query);

      if (query === 'PRAGMA table_info(simulador_agendamentos)') {
        const results = [
          { name: 'id' },
          { name: 'simulador_id' },
          { name: 'template_id' },
          { name: 'data' },
          { name: 'hora_inicio' },
          { name: 'hora_fim' },
          { name: 'duracao_minutos' },
          { name: 'instrutor_id' },
          { name: 'examinador_id' },
          { name: 'tipo_sessao' },
          { name: 'status' },
          { name: 'observacoes' },
          { name: 'nome' },
          { name: 'empresa_id' },
          { name: 'deleted_at' },
          ...(opts.hasTipoDispositivo ? [{ name: 'tipo_dispositivo' }] : []),
          ...(opts.hasAeronaveId ? [{ name: 'aeronave_id' }] : []),
        ];

        return {
          bind: (..._args: unknown[]) => ({
            all: async () => ({ results }),
            first: async (): Promise<null> => null,
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (query.includes('FROM simulador_agendamentos sa') && query.includes('sa.uuid')) {
        return {
          bind: (..._args: unknown[]) => ({
            all: async () => ({
              results: [
                {
                  id: 501,
                  uuid: 'sessao-501',
                  simulador_id: 7,
                  template_id: 9,
                  simulador_nome: 'FFS-SK76-007',
                  simulador_modelo: 'SK76',
                  simulador_tipo: 'FFS',
                  tipo_dispositivo: opts.hasTipoDispositivo ? 'SIMULADOR' : null,
                  aeronave_id: opts.hasAeronaveId ? 33 : null,
                  aeronave_prefixo: opts.hasAeronaveId ? 'PR-XYZ' : null,
                  aeronave_modelo: opts.hasAeronaveId ? 'AW139' : null,
                  data: '2026-06-25',
                  horario_inicio: '08:00',
                  horario_fim: '10:00',
                  duracao_minutos: 120,
                  instrutor_id: 41,
                  instrutor_nome: 'Filipe Passaroni Daumas',
                  examinador_id: null,
                  examinador_nome: null,
                  tipo_sessao: 'REC',
                  tema_sessao: 'Treino LOFT',
                  status: 'AGENDADO',
                  observacoes: null,
                  created_at: '2026-06-01T10:00:00.000Z',
                  updated_at: '2026-06-01T10:00:00.000Z',
                  participantes_json: '[]',
                  fichas_json: '[]',
                },
              ],
            }),
            first: async (): Promise<null> => null,
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (query.includes('FROM simulador_agendamentos sa') && query.includes('WHERE sa.id = ?')) {
        return {
          bind: (..._args: unknown[]) => ({
            all: async () => ({ results: [] }),
            first: async () => ({
              id: 501,
              empresa_id: 6,
              simulador_id: 7,
              template_id: 9,
              simulador_nome: 'FFS-SK76-007',
              simulador_modelo: 'SK76',
              simulador_tipo: 'FFS',
              simulador_aeronave_codigo: 'SK76',
              tipo_dispositivo: opts.hasTipoDispositivo ? 'SIMULADOR' : null,
              aeronave_id: opts.hasAeronaveId ? 33 : null,
              aeronave_prefixo: opts.hasAeronaveId ? 'PR-XYZ' : null,
              aeronave_modelo: opts.hasAeronaveId ? 'AW139' : null,
              tipo_sessao_id: 12,
              tipo_sessao_codigo: 'REC',
              tipo_sessao_nome: 'Recorrente',
              examinador_nome: null,
              instrutor_id: 41,
              deleted_at: null,
            }),
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (query.includes('FROM sessoes_participantes sp')) {
        return {
          bind: (..._args: unknown[]) => ({
            all: async () => ({ results: [] }),
            first: async (): Promise<null> => null,
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (
        query ===
        'SELECT id, nome, matricula FROM funcionarios WHERE id=? AND empresa_id = ? AND deleted_at IS NULL'
      ) {
        return {
          bind: (..._args: unknown[]) => ({
            all: async () => ({ results: [] }),
            first: async () => ({ id: 41, nome: 'Instrutor Teste', matricula: 'IT-41' }),
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (query.includes('FROM fichas_sessao f')) {
        return {
          bind: (..._args: unknown[]) => ({
            all: async () => ({ results: [] }),
            first: async (): Promise<null> => null,
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      throw new Error(`Unhandled query in compat test: ${query}`);
    }),
  } as unknown as D1Database;

  return { db, queries };
}

describe('simuladores sessoes GET schema compatibility', () => {
  it('tolera schema antigo sem tipo_dispositivo/aeronave_id', async () => {
    const { db, queries } = createCompatDb({
      hasTipoDispositivo: false,
      hasAeronaveId: false,
    });

    const response = await simuladoresSessoesRoutes.fetch(
      new Request(
        'http://localhost/sessoes?data_inicio=2026-06-01&data_fim=2026-06-30&tipo_dispositivo=SIMULADOR',
        { method: 'GET' },
      ),
      { DB: db, __mockRole: 'admin' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: Array<{
        tipo_dispositivo: string | null;
        aeronave_id: number | null;
        aeronave_prefixo: string | null;
      }>;
    };

    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toMatchObject({
      tipo_dispositivo: null,
      aeronave_id: null,
      aeronave_prefixo: null,
    });

    const selectQuery = queries.find(
      (sql) => sql.includes('FROM simulador_agendamentos sa') && sql.includes('sa.uuid'),
    );
    expect(selectQuery).toContain('NULL as tipo_dispositivo');
    expect(selectQuery).toContain('NULL as aeronave_id');
    expect(selectQuery).not.toContain('sa.tipo_dispositivo');
    expect(selectQuery).not.toContain('sa.aeronave_id');
    expect(selectQuery).not.toContain('LEFT JOIN aeronaves ae ON sa.aeronave_id = ae.id');
  });

  it('preserva query completa quando schema novo possui colunas opcionais', async () => {
    const { db, queries } = createCompatDb({
      hasTipoDispositivo: true,
      hasAeronaveId: true,
    });

    const response = await simuladoresSessoesRoutes.fetch(
      new Request(
        'http://localhost/sessoes?data_inicio=2026-06-01&data_fim=2026-06-30&tipo_dispositivo=SIMULADOR',
        { method: 'GET' },
      ),
      { DB: db, __mockRole: 'admin' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: Array<{ tipo_dispositivo: string | null; aeronave_id: number | null }>;
    };

    expect(payload.success).toBe(true);
    expect(payload.data[0]).toMatchObject({
      tipo_dispositivo: 'SIMULADOR',
      aeronave_id: 33,
    });

    const selectQuery = queries.find(
      (sql) => sql.includes('FROM simulador_agendamentos sa') && sql.includes('sa.uuid'),
    );
    expect(selectQuery).toContain("COALESCE(sa.tipo_dispositivo, 'SIMULADOR') as tipo_dispositivo");
    expect(selectQuery).toContain('sa.aeronave_id');
    expect(selectQuery).toContain('LEFT JOIN aeronaves ae ON sa.aeronave_id = ae.id');
    expect(selectQuery).toContain("AND COALESCE(sa.tipo_dispositivo, 'SIMULADOR') = ?");
  });

  it('GET /sessoes/:id também tolera schema antigo sem aeronave_id/tipo_dispositivo', async () => {
    const { db, queries } = createCompatDb({
      hasTipoDispositivo: false,
      hasAeronaveId: false,
    });

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/501', { method: 'GET' }),
      { DB: db, __mockRole: 'admin' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      sessao: { tipo_dispositivo: string | null; aeronave_id: number | null };
    };

    expect(payload.success).toBe(true);
    expect(payload.sessao).toMatchObject({
      tipo_dispositivo: null,
      aeronave_id: null,
    });

    const detailQuery = queries.find(
      (sql) => sql.includes('FROM simulador_agendamentos sa') && sql.includes('WHERE sa.id = ?'),
    );
    expect(detailQuery).toContain('NULL as tipo_dispositivo');
    expect(detailQuery).toContain('NULL as aeronave_id');
    expect(detailQuery).not.toContain('sa.aeronave_id');
    expect(detailQuery).not.toContain('LEFT JOIN aeronaves ae ON sa.aeronave_id = ae.id');
  });
});
