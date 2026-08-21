import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import type { FrmsOperationalSnapshotItem } from '../../lib/frms/operational-snapshot';

const listSnapshotMock = vi.fn();

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', Number(c.req.header('x-user-id') || 88));
    c.set('userRole', c.req.header('x-role') || 'manager');
    const funcionarioId = c.req.header('x-funcionario-id');
    c.set('funcionarioId', funcionarioId ? Number(funcionarioId) : null);
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.req.header('x-empresa-id') || 5),
}));

vi.mock('../../lib/frms/operational-snapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/operational-snapshot')>();
  return {
    ...actual,
    listFrmsOperationalSnapshot: (...args: unknown[]) => listSnapshotMock(...args),
  };
});

import projectionRoutes, { buildProjectionItems } from '../../routes/frms-projection';

function item(overrides: Partial<FrmsOperationalSnapshotItem> = {}): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 5,
    data_operacional: '2099-01-10',
    funcionario_id: 20,
    tripulante_id: 20,
    nome: 'Nome Interno',
    nome_guerra: 'Guerra',
    funcao: 'PIC',
    base: 'SBJR',
    aeronave: 'AW139',
    escalado: true,
    escala_source: 'EVD',
    hora_apresentacao: '08:00',
    hora_termino: '18:00',
    horas_voo_minutos: 240,
    duracao_jornada_minutos: 600,
    teve_jornada: true,
    checkin_status: 'PENDENTE',
    checkin_horario: null,
    kss_score: null,
    horas_sono: null,
    qualidade_sono: null,
    hora_acordar: null,
    fadiga_score: null,
    status_operacional_checkin: null,
    effectiveness_pct: 55,
    nivel_fadiga_calculado: 'VERMELHO',
    fatorizacao_status: 'CALCULADA',
    sleep_data_source: 'ESTIMADO',
    wake_data_source: 'ESTIMADO',
    jornada_data_source: 'REAL',
    jornada_origem: 'SIGVOOS',
    snapshot_status: 'CRITICO',
    fortnight_indicator: null,
    alertas: ['EFETIVIDADE_BAIXA'],
    natureza_dado: 'JORNADA_REALIZADA',
    causa: 'Indice de efetividade abaixo de 70%',
    mitigacao_recomendada: 'REDUZIR_JORNADA',
    decisao: 'EXIGE_OVERRIDE',
    limite_referencia: null,
    estado_operacional: 'MITIGACAO_NECESSARIA',
    motivos_principais: ['Indice de efetividade abaixo de 70%'],
    acao_recomendada_texto: 'Avaliar mitigação.',
    ...overrides,
  };
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/frms', projectionRoutes);
  return app;
}

function createDb(ownFuncionarioId = 20) {
  const runs: string[] = [];
  const db = {
    prepare: vi.fn((query: string) => ({
      bind: () => ({
        first: async () => {
          if (query.includes('FROM usuarios u') || query.includes('FROM funcionarios')) {
            return { id: ownFuncionarioId };
          }
          return null;
        },
        run: async () => {
          runs.push(query);
          return { meta: { changes: 0 } };
        },
      }),
    })),
  } as unknown as D1Database;
  return { db, runs };
}

describe('FRMS projection', () => {
  beforeEach(() => {
    listSnapshotMock.mockReset();
  });

  it('retorna itens como PROJECAO e nunca exige override', () => {
    const projected = buildProjectionItems([item()]);
    expect(projected[0].natureza_dado).toBe('PROJECAO');
    expect(projected[0].snapshot_status).toBe('CRITICO');
    expect(projected[0].decisao).toBe('ALERTA');
  });

  it('student ve apenas proprio escopo', async () => {
    listSnapshotMock.mockResolvedValueOnce({ items: [item({ funcionario_id: 20 })], summary: {} });
    const app = createApp();
    const response = await app.request(
      '/frms/projection?data_inicio=2099-01-01&data_fim=2099-01-31&funcionario_id=99',
      {
        method: 'GET',
        headers: {
          'x-role': 'student',
          'x-user-id': '88',
          'x-empresa-id': '5',
        },
      },
      { DB: createDb(20).db } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const [, params] = listSnapshotMock.mock.calls[0];
    expect(params).toMatchObject({
      empresaId: 5,
      filters: expect.objectContaining({ funcionario_id: 20 }),
    });
    await expect(response.json()).resolves.toMatchObject({
      meta: { scope: 'self', forced_funcionario_id: 20, writes: 0 },
    });
  });

  it('manager/admin respeita escopo permitido e nao escreve no banco', async () => {
    listSnapshotMock.mockResolvedValueOnce({ items: [item({ funcionario_id: 99 })], summary: {} });
    const app = createApp();
    const { db, runs } = createDb();
    const response = await app.request(
      '/frms/projection?data_inicio=2099-01-01&data_fim=2099-01-31&funcionario_id=99',
      {
        method: 'GET',
        headers: {
          'x-role': 'admin',
          'x-user-id': '88',
          'x-empresa-id': '5',
        },
      },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const [, params] = listSnapshotMock.mock.calls[0];
    expect(params).toMatchObject({
      empresaId: 5,
      filters: expect.objectContaining({ funcionario_id: 99 }),
    });
    expect(runs).toHaveLength(0);
    const payload = (await response.json()) as {
      data: Array<{ decisao: string }>;
      meta: { writes: number };
    };
    expect(payload.meta.writes).toBe(0);
    expect(payload.data.every((entry) => entry.decisao !== 'EXIGE_OVERRIDE')).toBe(true);
    expect(payload.data.every((entry) => entry.decisao !== 'BLOQUEIA')).toBe(true);
  });
});
