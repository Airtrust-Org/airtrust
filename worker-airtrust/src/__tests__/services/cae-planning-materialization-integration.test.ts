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
    // Regressão: treinamento_planejado_id precisa ser o planningId (a própria
    // linha treinamentos_planejados que está sendo materializada), nunca o
    // snapshot's participant.training_id (que guarda qualificacao_tipo_id —
    // 11 e 22 neste fixture — e nunca foi um treinamento_planejado_id real).
    // Usar esse valor como FK fazia a materialização SHARED falhar ao vivo
    // com "Treinamento planejado fora do tenant".
    expect(
      payload.atribuicoes_planejadas.map(
        (item: { treinamento_planejado_id: number }) => item.treinamento_planejado_id,
      ),
    ).toEqual([44, 44]);

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

  it('retry idempotente funciona mesmo apos planejamento_status avancar para AGENDADO (pos-materializacao real)', async () => {
    // Reproduz o estado real pos-materializacao: a UPDATE final do fluxo de
    // sucesso avanca planejamento_status para 'AGENDADO', que nao satisfaz
    // canMaterializeSimulatorSessions (exige 'CONFIRMADO'). Uma segunda
    // chamada (retry de rede, duplo clique) precisa ainda assim retornar o
    // resultado idempotente, nao NOT_APPROVED.
    const db = {
      prepare(sql: string) {
        return {
          bind(..._binds: unknown[]) {
            return {
              async first() {
                if (sql.includes('FROM treinamentos_planejados')) {
                  return {
                    planejamento_status: 'AGENDADO',
                    planejamento_aprovacao_status: 'APROVADO',
                    planejamento_snapshot_json: JSON.stringify(snapshot({ materialized_session_id: 9001 })),
                  };
                }
                if (sql.includes('FROM simulador_agendamentos')) {
                  return { id: 9001 };
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

    const result = await materializeSimulatorPlanning({
      db,
      empresaId: 7,
      planningId: 44,
      userId: 3,
    });

    expect(result.success).toBe(true);
    expect(result.sessao_id).toBe(9001);
    expect(result.reused).toBe(true);
  });

  it('nao retorna SNAPSHOT_SLOT_MISSING quando o snapshot ja traz o slot selecionado pelo matcher', async () => {
    const db = createDb({ snapshot: snapshot() });
    const result = await materializeSimulatorPlanning({
      db,
      empresaId: 7,
      planningId: 44,
      userId: 3,
    });
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('falha fechado com SNAPSHOT_SLOT_MISSING quando cae_slots esta vazio (regressao do bug de persistencia)', async () => {
    const db = createDb({ snapshot: snapshot({ cae_slots: [] }) });
    const result = await materializeSimulatorPlanning({
      db,
      empresaId: 7,
      planningId: 44,
      userId: 3,
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe('SNAPSHOT_SLOT_MISSING');
    expect(executeSharedSessionCreation).not.toHaveBeenCalled();
    expect(executeNormalSessionCreation).not.toHaveBeenCalled();
  });

  it('nao deixa simulador_agendamentos orfao quando a etapa final de materializacao falha (atomicidade)', async () => {
    executeNormalSessionCreation.mockResolvedValue({ sessaoId: 9101 });
    const executed: string[] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(..._binds: unknown[]) {
            return {
              async first() {
                if (sql.includes('FROM treinamentos_planejados')) {
                  return {
                    planejamento_status: 'CONFIRMADO',
                    planejamento_aprovacao_status: 'APROVADO',
                    planejamento_snapshot_json: JSON.stringify(
                      snapshot({
                        mode: 'NORMAL',
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
                        ],
                      }),
                    ),
                  };
                }
                if (sql.includes('FROM simulador_agendamentos')) {
                  return null;
                }
                return null;
              },
              async run() {
                executed.push(sql.replace(/\s+/g, ' ').trim());
                if (sql.includes('UPDATE treinamentos_planejados') && sql.includes('planejamento_status')) {
                  throw new Error('CHECK constraint failed: status IN (...)');
                }
                return { meta: { last_row_id: 0 } };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const result = await materializeSimulatorPlanning({
      db,
      empresaId: 7,
      planningId: 44,
      userId: 3,
    });

    expect(result.success).toBe(false);
    expect(executed.some((s) => s.startsWith('DELETE FROM simulador_agendamentos') )).toBe(true);
    expect(executed.some((s) => s.startsWith('DELETE FROM sessoes_participantes'))).toBe(true);
    expect(executed.some((s) => s.startsWith('DELETE FROM qualificacoes_historico'))).toBe(true);
    // A ordem importa: a sessao/orfa precisa ser removida DEPOIS de criada e ANTES do retorno de erro.
    const finalUpdateIndex = executed.findIndex((s) => s.startsWith('UPDATE treinamentos_planejados'));
    const cleanupIndex = executed.findIndex((s) => s.startsWith('DELETE FROM simulador_agendamentos'));
    expect(cleanupIndex).toBeGreaterThan(finalUpdateIndex);
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
