import type { D1Database } from '@cloudflare/workers-types';

/**
 * Simulador físico: catálogo GLOBAL, intencionalmente sem empresa_id (mesma
 * convenção já usada por GET /simuladores-equipamentos — ver comentário lá).
 * Resolução determinística apenas quando exatamente um simulador ativo
 * compatível existe; nunca escolhe arbitrariamente entre vários.
 */
export type SimulatorResolution =
  | { status: 'RESOLVED'; simulator_id: number }
  | { status: 'NEEDS_ASSIGNMENT'; candidates: [] }
  | { status: 'AMBIGUOUS'; candidates: Array<{ id: number; nome: string }> };

function normalizeEquipmentCode(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export async function resolveGlobalSimulatorForEquipment(
  db: D1Database,
  equipment: string,
): Promise<SimulatorResolution> {
  const normalizedTarget = normalizeEquipmentCode(equipment);
  const rows = await db
    .prepare(
      `SELECT id, nome, aeronave_codigo, codigo_aeronave
         FROM simuladores
        WHERE deleted_at IS NULL
          AND status = 'ATIVO'`,
    )
    .all<{ id: number; nome: string; aeronave_codigo: string | null; codigo_aeronave: string | null }>();

  const candidates = (rows.results || []).filter((row) => {
    const codeA = normalizeEquipmentCode(row.aeronave_codigo);
    const codeB = normalizeEquipmentCode(row.codigo_aeronave);
    return (
      (codeA && codeA.includes(normalizedTarget)) ||
      (codeB && codeB.includes(normalizedTarget)) ||
      (normalizedTarget && (codeA === normalizedTarget || codeB === normalizedTarget))
    );
  });

  if (candidates.length === 1) {
    return { status: 'RESOLVED', simulator_id: Number(candidates[0].id) };
  }
  if (candidates.length === 0) {
    return { status: 'NEEDS_ASSIGNMENT', candidates: [] };
  }
  return {
    status: 'AMBIGUOUS',
    candidates: candidates.map((row) => ({ id: Number(row.id), nome: row.nome })),
  };
}

export type InstructorEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

/**
 * Mesma checagem canônica usada em POST /simuladores/sessoes (manual):
 * tenant-scoped, ativo, e flag is_instrutor quando a coluna existir no
 * schema. Não duplica regra nova — só reaplica o contrato existente.
 */
export async function validateInstructorAssignment(
  db: D1Database,
  empresaId: number,
  instructorId: number,
): Promise<InstructorEligibility> {
  if (!Number.isInteger(instructorId) || instructorId <= 0) {
    return { eligible: false, reason: 'instructor_id inválido' };
  }

  const columns = await db.prepare("PRAGMA table_info('funcionarios')").all<{ name: string }>();
  const columnNames = new Set((columns.results || []).map((row) => row.name));
  const hasIsInstrutor = columnNames.has('is_instrutor');

  const row = await db
    .prepare(
      `SELECT id, ativo${hasIsInstrutor ? ', is_instrutor' : ''}
         FROM funcionarios
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(instructorId, empresaId)
    .first<{ id: number; ativo: number | null; is_instrutor?: number | null }>();

  if (!row) {
    return { eligible: false, reason: 'Instrutor não pertence a este tenant ou não existe' };
  }
  if (row.ativo !== null && row.ativo !== undefined && Number(row.ativo) !== 1) {
    return { eligible: false, reason: 'Instrutor inativo' };
  }
  if (hasIsInstrutor && Number(row.is_instrutor || 0) !== 1) {
    return { eligible: false, reason: 'Funcionário não possui o flag is_instrutor' };
  }
  return { eligible: true };
}
