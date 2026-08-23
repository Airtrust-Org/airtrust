import type { D1Database } from '@cloudflare/workers-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  executeSharedSessionCreation,
  executeNormalSessionCreation,
} = vi.hoisted(() => ({
  executeSharedSessionCreation: vi.fn(),
  executeNormalSessionCreation: vi.fn(),
}));

vi.mock('../../routes/simuladores-shared-session-helpers', () => ({
  executeSharedSessionCreation,
}));

vi.mock('../../services/cae-planning-normal-session', () => ({
  executeNormalSessionCreation,
}));

import { materializeSimulatorPlanning } from '../../services/cae-planning-materialization';
import { resolveSimulatorPlanningConfig } from '../../services/cae-planning-policy';

function snapshot(overrides: Record<string, unknown> = {}) {
  const config = resolveSimulatorPlanningConfig({
    planejamento_simulador_antecedencia_dias: 90,
    planejamento_simulador_regra_quinzena: 'FOLGA',
    planejamento_simulador_preferencia_sessoes_por_dia: 2,
    planejamento_simulador_preferencia_minutos_por_dia: 240,
    planejamento_simulador_permitir_quebra_preferencia: 1,
    planejamento_simulador_permitir_sessao_compartilhada: 1,
    planejamento_simulador_preferir_mesmo_treinamento: 1,
    planejamento_simulador_preferir_mesma_sessao: 1,
    planejamento_simulador_aprovacao_obrigatoria: 1,
  });
  return {
    generated_at: '2026-08-22T20:00:00Z',
    config,
    mode: 'COMPARTILHADA',
    simulator_id: 88,
    instructor_id: 9,
    canonical_session_fingerprint: 'sessions:v1',
    pairing_fingerprint: 'pairing:v1',
    participants: [
      {
        employee_id: 101,
        employee_active: true,
        equipment: 'AW139',
        qualification_history_id: 1,
        qualification_expiry_date: '2026-11-30',
        training_id: 11,
        session_model_ids: [501],
        roster_by_date: { '2026-11-20': 'FOLGA' },
      },
      {
        employee_id: 202,
        employee_active: true,
        equipment: 'AW139',
        qualification_history_id: 2,
        qualification_expiry_date: '2026-11-30',
        training_id: 22,
        session_model_ids: [777],
        roster_by_date: { '2026-11-20': 'FOLGA' },
      },
    ],
    cae_slots: [
      {
        slot_key: 'AW139|2026-11-20|08:00|2026-11-20|12:00',
        state: 'OFFERED',
        equipment: 'AW139',
        date: '2026-11-20',
        start_time: '08:00',
        end_time: '12:00',
      },
    ],
    ...overrides,
  };
}

function createDb(options: {
  snapshot: unknown;
  existingSessionId?: number | null;
}) {
  return {
    prepare(sql: string) {
      return {
        bind(..._binds: unknown[]) {
          return {
            async first() {
              if (sql.includes('FROM treinamentos_planejados')) {
                return {
                  planejamento_status: 'CONFIRMADO',
                  planejamento_aprovacao_status: 'APROVADO',
                  planejamento_snapshot_json: JSON.stringify(options.snapshot),
                };
              }
              if (sql.includes('FROM simulador_agendamentos')) {
                return options.existingSessionId ? { id: options.existingSessionId } : null;
              }
              return null;
            },
            async run() {
              return { meta: { last_row_id: 0 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('CAE materialization integration', () => {
  beforeEach(() => {
    executeSharedSessionCreation.mockReset();
    executeNormalSessionCreation.mockReset();
    executeSharedSessionCreation.mockResolvedValue({
      created: { sessaoId: 9001 },
      detail: {},
      fichasResult: { created: 2, skipped: 0 },
    });
    executeNormalSessionCreation.mockResolvedValue({ sessaoId: 8001 });
  });

  it('cria UM agendamento compartilhado com duas atribuições e modelos individuais', async () => {
    const db = createDb({ snapshot: snapshot() });
    const first = await materializeSimulatorPlanning({
      db,
      empresaId: 7,
      planningId: 44,
      userId: 3,
    });

    expect(first.success).toBe(true);
    expect(first.sessao_id).toBe(9001);
    expect(executeSharedSessionCreation).toHaveBeenCalledTimes(1);
    expect(executeNormalSessionCreation).not.toHaveBeenCalled();

    const payload = executeSharedSessionCreation.mock.calls[0][2];
    expect(payload.participantes).toHaveLength(2);
    expect(payload.atribuicoes_planejadas).toHaveLength(2);
    expect(
      payload.atribuicoes_planejadas.map((item: { modelo_sessao_id: number }) => item.modelo_sessao_id).sort(),
    ).toEqual([501, 777]);

    const retry = await materializeSimulatorPlanning({
      db: createDb({ snapshot: snapshot({ materialized_session_id: 9001 }), existingSessionId: 9001 }),
      empresaId: 7,
      planningId: 44,
      userId: 3,
    });
    expect(retry.success).toBe(true);
    expect(retry.sessao_id).toBe(9001);
    expect(retry.reused).toBe(true);
    expect(executeSharedSessionCreation).toHaveBeenCalledTimes(1);
  });

  it('falha fechado se o payload compartilhado estiver inconsistente', async () => {
    const db = createDb({
      snapshot: snapshot({
        participants: [
          {
            employee_id: 101,
            employee_active: true,
            equipment: 'AW139',
            training_id: 11,
            session_model_ids: [],
            roster_by_date: {},
          },
          {
            employee_id: 202,
            employee_active: true,
            equipment: 'AW139',
            training_id: 22,
            session_model_ids: [777],
            roster_by_date: {},
          },
        ],
      }),
    });
    const result = await materializeSimulatorPlanning({
      db,
      empresaId: 7,
      planningId: 44,
      userId: 3,
    });
    expect(result.success).toBe(false);
    expect(executeSharedSessionCreation).not.toHaveBeenCalled();
  });
});
