import type { D1Database } from '@cloudflare/workers-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSimulatorPlanningConfig } from '../../services/cae-planning-policy';

const { resolvePublishedRosterDayFromD1 } = vi.hoisted(() => ({
  resolvePublishedRosterDayFromD1: vi.fn(),
}));

vi.mock('../../services/cae-planning-roster-d1', () => ({
  resolvePublishedRosterDayFromD1,
}));

import { executeSimulatorPlanningApproval } from '../../services/cae-planning-approval';

function baseSnapshot(overrides: Record<string, unknown> = {}) {
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
    mode: 'NORMAL',
    simulator_id: 88,
    instructor_id: 9,
    canonical_session_fingerprint: 'sessions:v1',
    pairing_fingerprint: 'pairing:v1',
    participants: [
      {
        employee_id: 10,
        employee_active: true,
        equipment: 'AW139',
        qualification_history_id: 100,
        qualification_expiry_date: '2026-11-30',
        training_id: 200,
        session_model_ids: [1, 2, 3],
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
  employeeStatus?: string;
  expiry?: string;
  liveSessionModelIds?: number[];
  configRow?: Record<string, unknown>;
  instructorInactive?: boolean;
  simulatorInactive?: boolean;
  updates?: Array<{ sql: string; binds: unknown[] }>;
}) {
  const updates = options.updates || [];
  const snapshot = options.snapshot;
  return {
    prepare(sql: string) {
      const statement = {
        bind(..._binds: unknown[]) {
          return statement;
        },
        async first() {
          if (sql.includes('FROM treinamentos_planejados')) {
            return {
              planejamento_status: 'PROPOSTO',
              planejamento_aprovacao_status: 'PENDENTE',
              planejamento_snapshot_json: JSON.stringify(snapshot),
            };
          }
          if (sql.includes('FROM empresas_config')) {
            return (
              options.configRow || {
                planejamento_simulador_antecedencia_dias: 90,
                planejamento_simulador_regra_quinzena: 'FOLGA',
                planejamento_simulador_preferencia_sessoes_por_dia: 2,
                planejamento_simulador_preferencia_minutos_por_dia: 240,
                planejamento_simulador_permitir_quebra_preferencia: 1,
                planejamento_simulador_permitir_sessao_compartilhada: 1,
                planejamento_simulador_preferir_mesmo_treinamento: 1,
                planejamento_simulador_preferir_mesma_sessao: 1,
                planejamento_simulador_aprovacao_obrigatoria: 1,
              }
            );
          }
          if (sql.includes('FROM funcionarios') && sql.includes('ativo')) {
            // Query do validateInstructorAssignment: SELECT id, ativo[, is_instrutor]
            return {
              id: 9,
              ativo: options.instructorInactive ? 0 : 1,
              is_instrutor: 1,
            };
          }
          if (sql.includes('FROM funcionarios')) {
            return { id: 10, status: options.employeeStatus || 'ATIVO' };
          }
          if (sql.includes('FROM qualificacoes_historico')) {
            return { id: 100, data_vencimento: options.expiry || '2026-11-30' };
          }
          if (sql.includes('FROM simuladores')) {
            return { status: options.simulatorInactive ? 'INATIVO' : 'ATIVO' };
          }
          return null;
        },
        async all() {
          if (sql.includes('FROM modelos_sessao')) {
            return {
              results: (options.liveSessionModelIds || [1, 2, 3]).map((id) => ({ id })),
            };
          }
          if (sql.includes("table_info('funcionarios')")) {
            return { results: [{ name: 'is_instrutor' }, { name: 'ativo' }] };
          }
          return { results: [] };
        },
        async run() {
          updates.push({ sql, binds: [] });
          return { success: true };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe('CAE approval live revalidation', () => {
  beforeEach(() => {
    resolvePublishedRosterDayFromD1.mockReset();
    resolvePublishedRosterDayFromD1.mockResolvedValue({ state: 'FOLGA' });
  });

  it('não aprova nem materializa quando João muda de FOLGA para TRABALHO', async () => {
    resolvePublishedRosterDayFromD1.mockResolvedValue({ state: 'TRABALHO' });
    const updates: Array<{ sql: string; binds: unknown[] }> = [];
    const db = createDb({ snapshot: baseSnapshot(), updates });

    const result = await executeSimulatorPlanningApproval({
      db,
      empresaId: 1,
      planningId: 44,
      action: 'APPROVE',
      userId: 8,
      userName: 'manager',
    });

    expect(result.success).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['ROSTER_POLICY_NO_LONGER_SATISFIED']));
    expect(result.planning_status).toBe('REPLANEJAR');
    expect(result.approval_status).toBe('DEVOLVIDO');
    expect(updates.some((item) => item.sql.includes('UPDATE treinamentos_planejados'))).toBe(true);
    expect(updates.some((item) => String(item.binds[0]) === 'AGENDADO')).toBe(false);
  });

  it('bloqueia funcionário inativo', async () => {
    const db = createDb({ snapshot: baseSnapshot(), employeeStatus: 'INATIVO' });
    const result = await executeSimulatorPlanningApproval({
      db,
      empresaId: 1,
      planningId: 44,
      action: 'APPROVE',
      userId: 8,
      userName: 'manager',
    });
    expect(result.success).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['PARTICIPANT_INACTIVE']));
  });

  it('bloqueia vencimento alterado', async () => {
    const db = createDb({ snapshot: baseSnapshot(), expiry: '2026-12-31' });
    const result = await executeSimulatorPlanningApproval({
      db,
      empresaId: 1,
      planningId: 44,
      action: 'APPROVE',
      userId: 8,
      userName: 'manager',
    });
    expect(result.success).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['QUALIFICATION_STATE_CHANGED']));
  });

  it('bloqueia currículo alterado', async () => {
    const db = createDb({ snapshot: baseSnapshot(), liveSessionModelIds: [9001] });
    const result = await executeSimulatorPlanningApproval({
      db,
      empresaId: 1,
      planningId: 44,
      action: 'APPROVE',
      userId: 8,
      userName: 'manager',
    });
    expect(result.success).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['PARTICIPANT_CURRICULUM_CHANGED']));
  });

  it('bloqueia slot CAE indisponível', async () => {
    const db = createDb({
      snapshot: baseSnapshot({
        cae_slots: [
          {
            slot_key: 'AW139|2026-11-20|08:00|2026-11-20|12:00',
            state: 'UNAVAILABLE',
            equipment: 'AW139',
            date: '2026-11-20',
            start_time: '08:00',
            end_time: '12:00',
          },
        ],
      }),
    });
    const result = await executeSimulatorPlanningApproval({
      db,
      empresaId: 1,
      planningId: 44,
      action: 'APPROVE',
      userId: 8,
      userName: 'manager',
    });
    expect(result.success).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['CAE_SLOT_NOT_AVAILABLE']));
  });

  it('bloqueia aprovação quando instrutor previamente atribuído foi desativado (revalidação de recursos)', async () => {
    const db = createDb({ snapshot: baseSnapshot(), instructorInactive: true });
    const result = await executeSimulatorPlanningApproval({
      db,
      empresaId: 1,
      planningId: 44,
      action: 'APPROVE',
      userId: 8,
      userName: 'manager',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('RESOURCE_ASSIGNMENT_STALE');
    expect(result.blockers?.[0]).toMatch(/^INSTRUCTOR_NO_LONGER_ELIGIBLE:/);
  });

  it('bloqueia aprovação quando simulador previamente atribuído foi desativado (revalidação de recursos)', async () => {
    const db = createDb({ snapshot: baseSnapshot(), simulatorInactive: true });
    const result = await executeSimulatorPlanningApproval({
      db,
      empresaId: 1,
      planningId: 44,
      action: 'APPROVE',
      userId: 8,
      userName: 'manager',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('RESOURCE_ASSIGNMENT_STALE');
    expect(result.blockers).toEqual(['SIMULATOR_NO_LONGER_ACTIVE']);
  });

  it('bloqueia mudança da configuração do tenant', async () => {
    const db = createDb({
      snapshot: baseSnapshot(),
      configRow: {
        planejamento_simulador_antecedencia_dias: 90,
        planejamento_simulador_regra_quinzena: 'TRABALHO',
        planejamento_simulador_preferencia_sessoes_por_dia: 2,
        planejamento_simulador_preferencia_minutos_por_dia: 240,
        planejamento_simulador_permitir_quebra_preferencia: 1,
        planejamento_simulador_permitir_sessao_compartilhada: 1,
        planejamento_simulador_preferir_mesmo_treinamento: 1,
        planejamento_simulador_preferir_mesma_sessao: 1,
        planejamento_simulador_aprovacao_obrigatoria: 1,
      },
    });
    const result = await executeSimulatorPlanningApproval({
      db,
      empresaId: 1,
      planningId: 44,
      action: 'APPROVE',
      userId: 8,
      userName: 'manager',
    });
    expect(result.success).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['PLANNING_CONFIG_CHANGED']));
  });
});
