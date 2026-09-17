import { beforeEach, describe, expect, it, vi } from 'vitest';

const { validateInstructorAssignment, executeNormalSessionCreation, executeSharedSessionCreation, validateAndNormalizeSharedSessionRequest } = vi.hoisted(() => ({
  validateInstructorAssignment: vi.fn(),
  executeNormalSessionCreation: vi.fn(),
  executeSharedSessionCreation: vi.fn(),
  validateAndNormalizeSharedSessionRequest: vi.fn((value) => value),
}));

vi.mock('../../services/cae-planning-resource-assignment', () => ({ validateInstructorAssignment }));
vi.mock('../../services/cae-planning-normal-session', () => ({ executeNormalSessionCreation }));
vi.mock('../../routes/simuladores-shared-session-helpers', () => ({ executeSharedSessionCreation }));
vi.mock('../../routes/simuladores-shared-session-logic', () => ({ validateAndNormalizeSharedSessionRequest }));

import { materializeSimulatorPlanningV3Draft, type SimulatorPlanningV3MaterializationSnapshot } from '../../services/simulator-planning-v3-materialization';

function snapshot(blocks: Record<string, unknown>[], status = 'PLANEJADO'): SimulatorPlanningV3MaterializationSnapshot {
  return { draft_id: 'draft-1', workflow_status: status, proposal: { classes: [{ class_name: 'Turma A', blocks }] } };
}
function block(id: string, modelIds = [101]) {
  return { block_id: id, equipment: 'AW139', schedule_status: 'SCHEDULED', scheduled_slot: { date: '2026-11-20', start_time: '08:00', end_time: '10:00' }, sessions: modelIds.map((session_model_id, i) => ({ employee_id: i + 1, employee_name: `Crew ${i + 1}`, employee_role: i ? 'COPILOTO' : 'COMANDANTE', session_model_id, session_name: `S${i + 1}` })) };
}
function db(options: { existing?: Record<string, number>; simulatorCode?: string | null } = {}) {
  const updates: unknown[][] = [];
  return {
    updates,
    prepare(sql: string) {
      return { bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM simulador_agendamentos')) {
            const literalMarker = String(args[1] || '');
            const match = Object.entries(options.existing || {}).find(([id]) =>
              literalMarker.includes(`:${id}]`),
            );
            return match ? { id: match[1] } : null;
          }
          if (sql.includes('FROM simuladores')) return { id: Number(args[0]), aeronave_codigo: options.simulatorCode === undefined ? 'AW139' : options.simulatorCode, codigo_aeronave: null, status: 'ATIVO' };
          return null;
        },
        run: async () => { updates.push(args); return { success: true }; },
      }) };
    },
  } as any;
}

describe('V3 simulator planning materialization', () => {
  beforeEach(() => { vi.clearAllMocks(); validateInstructorAssignment.mockResolvedValue({ eligible: true }); executeNormalSessionCreation.mockResolvedValue({ sessaoId: 501 }); executeSharedSessionCreation.mockResolvedValue({ created: { sessaoId: 601 } }); });

  it('fails closed before any write when planning is not ready', async () => {
    const database = db();
    const result = await materializeSimulatorPlanningV3Draft({ db: database, empresaId: 7, planningId: 9, snapshot: snapshot([block('b1')], 'AGUARDANDO_CAE'), instructorId: 3, simulatorByEquipment: { AW139: 4 } });
    expect(result.error).toBe('PLANNING_NOT_READY'); expect(database.updates).toHaveLength(0); expect(executeNormalSessionCreation).not.toHaveBeenCalled();
  });

  it('rejects simulator without a real compatible equipment code', async () => {
    const result = await materializeSimulatorPlanningV3Draft({ db: db({ simulatorCode: null }), empresaId: 7, planningId: 9, snapshot: snapshot([block('b1')]), instructorId: 3, simulatorByEquipment: { AW139: 4 } });
    expect(result.success).toBe(false); expect(result.error).toBe('SIMULATOR_NOT_VALID_FOR_AW139'); expect(executeNormalSessionCreation).not.toHaveBeenCalled();
  });

  it('creates a normal session and marks the draft AGENDADO', async () => {
    const database = db(); const snap = snapshot([block('b1', [101, 101])]);
    const result = await materializeSimulatorPlanningV3Draft({ db: database, empresaId: 7, planningId: 9, snapshot: snap, instructorId: 3, simulatorByEquipment: { AW139: 4 } });
    expect(result).toMatchObject({ success: true, created: 1, reused: 0, materialized_sessions: { b1: 501 } }); expect(snap.workflow_status).toBe('AGENDADO'); expect(executeNormalSessionCreation).toHaveBeenCalledTimes(1); expect(database.updates.length).toBeGreaterThanOrEqual(2);
  });

  it('uses shared creation for different curricular models in the same physical block', async () => {
    const result = await materializeSimulatorPlanningV3Draft({ db: db(), empresaId: 7, planningId: 9, snapshot: snapshot([block('b1', [101, 202])]), instructorId: 3, simulatorByEquipment: { AW139: 4 } });
    expect(result).toMatchObject({ success: true, materialized_sessions: { b1: 601 } }); expect(executeSharedSessionCreation).toHaveBeenCalledTimes(1); expect(executeNormalSessionCreation).not.toHaveBeenCalled();
  });

  it('reuses an existing session with a literal marker query instead of LIKE', async () => {
    const preparedSql: string[] = [];
    const boundValues: unknown[][] = [];
    const database = db({ existing: { '196:999049:112+2:999049:112': 888 } });
    const originalPrepare = database.prepare.bind(database);
    database.prepare = (sql: string) => {
      preparedSql.push(sql);
      const statement = originalPrepare(sql);
      return {
        bind: (...args: unknown[]) => {
          boundValues.push(args);
          return statement.bind(...args);
        },
      };
    };
    const result = await materializeSimulatorPlanningV3Draft({
      db: database,
      empresaId: 7,
      planningId: 9,
      snapshot: snapshot([block('196:999049:112+2:999049:112')]),
      instructorId: 3,
      simulatorByEquipment: { AW139: 4 },
    });
    expect(result).toMatchObject({ success: true, created: 0, reused: 1 });
    const lookupIndex = preparedSql.findIndex((sql) => sql.includes('FROM simulador_agendamentos'));
    expect(preparedSql[lookupIndex]).toContain("instr(COALESCE(observacoes, ''), ?) > 0");
    expect(preparedSql[lookupIndex]).not.toContain('LIKE');
    expect(String(boundValues[lookupIndex]?.[1] || '')).toBe(
      '[sim-v3:draft-1:196:999049:112+2:999049:112]',
    );
    expect(executeNormalSessionCreation).not.toHaveBeenCalled();
  });

  it('is idempotent when a block already carries its materialized session id', async () => {
    const snap = snapshot([block('b1')]); snap.materialized_sessions = { b1: 777 };
    const result = await materializeSimulatorPlanningV3Draft({ db: db(), empresaId: 7, planningId: 9, snapshot: snap, instructorId: 3, simulatorByEquipment: { AW139: 4 } });
    expect(result).toMatchObject({ success: true, created: 0, reused: 1, materialized_sessions: { b1: 777 } }); expect(executeNormalSessionCreation).not.toHaveBeenCalled();
  });

  it('persists partial progress and safely reuses it on retry', async () => {
    executeNormalSessionCreation.mockResolvedValueOnce({ sessaoId: 501 }).mockRejectedValueOnce(new Error('CONFLICT'));
    const snap = snapshot([block('b1'), block('b2')]); const database = db();
    const first = await materializeSimulatorPlanningV3Draft({ db: database, empresaId: 7, planningId: 9, snapshot: snap, instructorId: 3, simulatorByEquipment: { AW139: 4 } });
    expect(first).toMatchObject({ success: false, created: 1, failed_block_id: 'b2', materialized_sessions: { b1: 501 } });
    executeNormalSessionCreation.mockResolvedValueOnce({ sessaoId: 502 });
    const second = await materializeSimulatorPlanningV3Draft({ db: database, empresaId: 7, planningId: 9, snapshot: snap, instructorId: 3, simulatorByEquipment: { AW139: 4 } });
    expect(second).toMatchObject({ success: true, created: 1, reused: 1, materialized_sessions: { b1: 501, b2: 502 } }); expect(executeNormalSessionCreation).toHaveBeenCalledTimes(3);
  });
});
