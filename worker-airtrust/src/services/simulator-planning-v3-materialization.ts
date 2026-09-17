import type { D1Database } from '@cloudflare/workers-types';
import { executeSharedSessionCreation } from '../routes/simuladores-shared-session-helpers';
import { validateAndNormalizeSharedSessionRequest } from '../routes/simuladores-shared-session-logic';
import { executeNormalSessionCreation } from './cae-planning-normal-session';
import { validateInstructorAssignment } from './cae-planning-resource-assignment';

export type SimulatorPlanningV3MaterializationSnapshot = {
  draft_id: string;
  workflow_status: string;
  proposal: Record<string, unknown>;
  materialized_sessions?: Record<string, number>;
  [key: string]: unknown;
};

type ParsedSession = {
  employee_id: number;
  employee_name: string;
  employee_role: string | null;
  session_model_id: number;
  session_name: string;
};

type ParsedBlock = {
  block_id: string;
  class_name: string;
  equipment: string;
  date: string;
  start_time: string;
  end_time: string;
  sessions: ParsedSession[];
};

function normalizeEquipment(value: unknown): string {
  const compact = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (compact.includes('AW139')) return 'AW139';
  if (compact.includes('SK76') || compact.includes('S76')) return 'SK76';
  return compact;
}

function roleKind(value: string | null): 'PIC' | 'SIC' | 'OTHER' {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (normalized.includes('COMANDANTE') || normalized.includes('PIC')) return 'PIC';
  if (normalized.includes('COPILOTO') || normalized.includes('SIC')) return 'SIC';
  return 'OTHER';
}

function marker(draftId: string, blockId: string): string {
  return `[sim-v3:${draftId}:${blockId}]`;
}

function parseScheduledBlocks(proposal: Record<string, unknown>): ParsedBlock[] {
  const classes = Array.isArray(proposal.classes) ? proposal.classes : [];
  const blocks: ParsedBlock[] = [];
  for (const rawClass of classes) {
    if (!rawClass || typeof rawClass !== 'object' || Array.isArray(rawClass)) continue;
    const trainingClass = rawClass as Record<string, unknown>;
    const className = String(trainingClass.class_name || 'Planejamento de simulador');
    const rawBlocks = Array.isArray(trainingClass.blocks) ? trainingClass.blocks : [];
    for (const rawBlock of rawBlocks) {
      if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) continue;
      const block = rawBlock as Record<string, unknown>;
      if (String(block.schedule_status || '') !== 'SCHEDULED') continue;
      const slot = block.scheduled_slot;
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) continue;
      const slotRow = slot as Record<string, unknown>;
      const sessions = (Array.isArray(block.sessions) ? block.sessions : [])
        .map((rawSession) => {
          if (!rawSession || typeof rawSession !== 'object' || Array.isArray(rawSession))
            return null;
          const session = rawSession as Record<string, unknown>;
          const employeeId = Number(session.employee_id);
          const modelId = Number(session.session_model_id);
          if (
            !Number.isInteger(employeeId) ||
            employeeId <= 0 ||
            !Number.isInteger(modelId) ||
            modelId <= 0
          )
            return null;
          return {
            employee_id: employeeId,
            employee_name: String(session.employee_name || `Funcionário ${employeeId}`),
            employee_role: session.employee_role == null ? null : String(session.employee_role),
            session_model_id: modelId,
            session_name: String(
              session.session_name || session.session_code || `Sessão ${modelId}`,
            ),
          } satisfies ParsedSession;
        })
        .filter((item): item is ParsedSession => Boolean(item));
      const blockId = String(block.block_id || '').trim();
      const equipment = normalizeEquipment(block.equipment);
      const date = String(slotRow.date || '').slice(0, 10);
      const start = String(slotRow.start_time || '');
      const end = String(slotRow.end_time || '');
      if (
        !blockId ||
        !equipment ||
        sessions.length < 1 ||
        sessions.length > 2 ||
        !date ||
        !start ||
        !end
      )
        continue;
      blocks.push({
        block_id: blockId,
        class_name: className,
        equipment,
        date,
        start_time: start,
        end_time: end,
        sessions,
      });
    }
  }
  return blocks;
}

async function findExistingSession(
  db: D1Database,
  empresaId: number,
  draftId: string,
  blockId: string,
): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT id FROM simulador_agendamentos
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND instr(COALESCE(observacoes, ''), ?) > 0
        ORDER BY id LIMIT 1`,
    )
    .bind(empresaId, marker(draftId, blockId))
    .first<{ id: number }>();
  return row?.id ? Number(row.id) : null;
}

async function validateSimulatorForEquipment(
  db: D1Database,
  simulatorId: number,
  equipment: string,
): Promise<boolean> {
  if (!Number.isInteger(simulatorId) || simulatorId <= 0) return false;
  const row = await db
    .prepare(
      `SELECT id, aeronave_codigo, codigo_aeronave, status
         FROM simuladores
        WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(simulatorId)
    .first<{
      id: number;
      aeronave_codigo: string | null;
      codigo_aeronave: string | null;
      status: string | null;
    }>();
  if (!row || String(row.status || '').toUpperCase() !== 'ATIVO') return false;
  const target = normalizeEquipment(equipment);
  return [row.aeronave_codigo, row.codigo_aeronave]
    .map(normalizeEquipment)
    .filter(Boolean)
    .some((code) => code === target || code.includes(target) || target.includes(code));
}

async function persistProgress(params: {
  db: D1Database;
  empresaId: number;
  planningId: number;
  snapshot: SimulatorPlanningV3MaterializationSnapshot;
  completed: boolean;
}) {
  await params.db
    .prepare(
      `UPDATE treinamentos_planejados
          SET planejamento_snapshot_json = ?,
              planejamento_status = ?,
              status = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(
      JSON.stringify(params.snapshot),
      params.completed ? 'AGENDADO' : 'PLANEJADO',
      params.completed ? 'CONFIRMADO' : 'PLANEJADO',
      params.planningId,
      params.empresaId,
    )
    .run();
}

export async function materializeSimulatorPlanningV3Draft(params: {
  db: D1Database;
  empresaId: number;
  planningId: number;
  snapshot: SimulatorPlanningV3MaterializationSnapshot;
  instructorId: number;
  simulatorByEquipment: Record<string, number>;
}): Promise<{
  success: boolean;
  materialized_sessions: Record<string, number>;
  created: number;
  reused: number;
  error?: string;
  failed_block_id?: string;
}> {
  const { db, empresaId, planningId, snapshot } = params;
  if (snapshot.workflow_status !== 'PLANEJADO' && snapshot.workflow_status !== 'AGENDADO') {
    return {
      success: false,
      materialized_sessions: snapshot.materialized_sessions || {},
      created: 0,
      reused: 0,
      error: 'PLANNING_NOT_READY',
    };
  }
  const instructor = await validateInstructorAssignment(db, empresaId, params.instructorId);
  if (!instructor.eligible) {
    return {
      success: false,
      materialized_sessions: snapshot.materialized_sessions || {},
      created: 0,
      reused: 0,
      error: instructor.reason,
    };
  }
  const blocks = parseScheduledBlocks(snapshot.proposal);
  const allProposalBlocks = (
    Array.isArray(snapshot.proposal.classes) ? snapshot.proposal.classes : []
  ).flatMap((rawClass) => {
    if (!rawClass || typeof rawClass !== 'object' || Array.isArray(rawClass)) return [];
    const rawBlocks = (rawClass as Record<string, unknown>).blocks;
    return Array.isArray(rawBlocks) ? rawBlocks : [];
  });
  if (blocks.length === 0 || blocks.length !== allProposalBlocks.length) {
    return {
      success: false,
      materialized_sessions: snapshot.materialized_sessions || {},
      created: 0,
      reused: 0,
      error: 'PLANNING_HAS_UNSCHEDULED_BLOCKS',
    };
  }

  const materialized = { ...(snapshot.materialized_sessions || {}) };
  let created = 0;
  let reused = 0;
  for (const block of blocks) {
    try {
      const existing =
        materialized[block.block_id] ||
        (await findExistingSession(db, empresaId, snapshot.draft_id, block.block_id));
      if (existing) {
        materialized[block.block_id] = Number(existing);
        reused += 1;
        continue;
      }
      const simulatorId = Number(
        params.simulatorByEquipment[normalizeEquipment(block.equipment)] || 0,
      );
      if (!(await validateSimulatorForEquipment(db, simulatorId, block.equipment))) {
        throw new Error(`SIMULATOR_NOT_VALID_FOR_${normalizeEquipment(block.equipment)}`);
      }
      const notes = `Criado do Planejamento V3 ${marker(snapshot.draft_id, block.block_id)}`;
      const sameModel = block.sessions.every(
        (session) => session.session_model_id === block.sessions[0].session_model_id,
      );
      let sessionId: number;
      if (block.sessions.length === 1 || sameModel) {
        const createdSession = await executeNormalSessionCreation(db, empresaId, {
          date: block.date,
          start_time: block.start_time,
          end_time: block.end_time,
          simulator_id: simulatorId,
          instructor_id: params.instructorId,
          session_model_id: block.sessions[0].session_model_id,
          theme: block.class_name,
          notes,
          participants: block.sessions.map((session, index) => ({
            employee_id: session.employee_id,
            role:
              roleKind(session.employee_role) === 'PIC'
                ? 'PIC'
                : roleKind(session.employee_role) === 'SIC'
                  ? 'SIC'
                  : index === 0
                    ? 'PIC'
                    : 'SIC',
          })),
        });
        sessionId = createdSession.sessaoId;
      } else {
        const [first, second] = block.sessions;
        const firstRole = roleKind(first.employee_role);
        const secondRole = roleKind(second.employee_role);
        const firstFunction = firstRole === 'SIC' && secondRole !== 'SIC' ? 'PM' : 'PF';
        const secondFunction = firstFunction === 'PF' ? 'PM' : 'PF';
        const payload = validateAndNormalizeSharedSessionRequest({
          data: block.date,
          hora_inicio: block.start_time,
          hora_fim: block.end_time,
          simulador_id: simulatorId,
          instrutor_id: params.instructorId,
          observacoes: notes,
          tema_sessao: block.class_name,
          participantes: block.sessions.map((session) => ({
            funcionario_id: session.employee_id,
            cumpre_treinamento: true,
            gera_ficha: true,
            modelo_sessao_id: session.session_model_id,
          })),
          segmentos: [
            {
              inicio: block.start_time,
              fim: block.end_time,
              atribuicao_funcionario_ids: block.sessions.map((session) => session.employee_id),
              finalidade_codigo: 'SOP_NORMAL',
              participantes: [
                {
                  funcionario_id: first.employee_id,
                  funcao: firstFunction,
                  cumpre_treinamento: true,
                  gera_ficha: true,
                  modelo_sessao_id: first.session_model_id,
                },
                {
                  funcionario_id: second.employee_id,
                  funcao: secondFunction,
                  cumpre_treinamento: true,
                  gera_ficha: true,
                  modelo_sessao_id: second.session_model_id,
                },
              ],
            },
          ],
        });
        const shared = await executeSharedSessionCreation(db, empresaId, payload);
        sessionId = shared.created.sessaoId;
      }
      materialized[block.block_id] = sessionId;
      created += 1;
      snapshot.materialized_sessions = materialized;
      await persistProgress({ db, empresaId, planningId, snapshot, completed: false });
    } catch (error) {
      snapshot.materialized_sessions = materialized;
      await persistProgress({ db, empresaId, planningId, snapshot, completed: false }).catch(
        () => undefined,
      );
      return {
        success: false,
        materialized_sessions: materialized,
        created,
        reused,
        failed_block_id: block.block_id,
        error: error instanceof Error ? error.message : 'MATERIALIZATION_FAILED',
      };
    }
  }
  snapshot.materialized_sessions = materialized;
  snapshot.workflow_status = 'AGENDADO';
  await persistProgress({ db, empresaId, planningId, snapshot, completed: true });
  return { success: true, materialized_sessions: materialized, created, reused };
}
