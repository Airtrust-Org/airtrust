/**
 * BOA/CBMMG — read-only projection of the canonical AirTrust employee registry.
 *
 * No parallel employee table, imported Costa do Sol records or offshore roles.
 * Explicit empresa_id AND sector scoping occur in SQL; a second result-level
 * tenant assertion rejects incoherent fixture/database results (fail-closed).
 */
import { buildFuncionarioScopeWhere, type EmployeeSectorAccess } from '../../services/employee-sector-access';
import { resolveFrmsWorkforceProfile, type FrmsWorkforceProfile } from './workforce-profile';
import { FRMS_FIREFIGHTER_AVIATION_PROFILE } from './parameter-governance';

export interface BombeirosWorkforceRow {
  id: number;
  nome: string;
  nome_guerra: string | null;
  cargo: string | null;
  funcao: string | null;
  perfil_frms: FrmsWorkforceProfile;
}

export interface BombeirosWorkforcePage {
  items: BombeirosWorkforceRow[];
  next_cursor: number | null;
  source: 'FUNCIONARIOS';
  /** All rows are registered personnel, not necessarily authorized flight crew. */
  interpretation: string;
}

interface EmployeeRecord {
  id: number;
  empresa_id: number;
  nome: string;
  nome_guerra: string | null;
  cargo: string | null;
  funcao: string | null;
}

/**
 * Only call after the BOA router has proven:
 * - active authenticated tenant code 'bombeiros' (not empresa 6);
 * - active governed FIREFIGHTER_AVIATION profile at the same empresa_id;
 * - an authorized administrator role.
 */
export async function listBombeirosWorkforce(
  db: D1Database,
  empresaId: number,
  access: EmployeeSectorAccess,
  options: { cursor?: number; limit?: number } = {},
): Promise<BombeirosWorkforcePage> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || empresaId === 6) {
    throw new Error('BOMBEIROS_INVALID_EMPRESA_CONTEXT');
  }
  const cursor = options.cursor ?? 0;
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(cursor) || cursor < 0
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 130) {
    throw new Error('BOMBEIROS_INVALID_ROSTER_PAGE');
  }
  const scope = buildFuncionarioScopeWhere(access, 'f');
  const rows = await db.prepare(
    `SELECT f.id, f.empresa_id, f.nome, f.guerra AS nome_guerra, f.cargo, f.funcao
       FROM funcionarios f
      WHERE f.empresa_id = ?
        AND f.deleted_at IS NULL
        AND f.ativo = 1
        AND f.id > ?
        AND ${scope.clause}
      ORDER BY f.id ASC
      LIMIT ?`
  ).bind(empresaId, cursor, ...scope.bindings, limit + 1).all<EmployeeRecord>();
  const records = rows.results ?? [];
  // Never trust the response shape to be well-scoped just because SQL was.
  if (records.some(row => Number(row.empresa_id) !== empresaId
    || !Number.isSafeInteger(Number(row.id)) || Number(row.id) <= cursor)) {
    throw new Error('BOMBEIROS_EMPLOYEE_TENANT_INTEGRITY_ERROR');
  }
  const page = records.slice(0, limit);
  return {
    items: page.map(row => ({
      id: Number(row.id),
      nome: String(row.nome ?? ''),
      nome_guerra: row.nome_guerra == null ? null : String(row.nome_guerra),
      cargo: row.cargo == null ? null : String(row.cargo),
      funcao: row.funcao == null ? null : String(row.funcao),
      perfil_frms: resolveFrmsWorkforceProfile(
        row.cargo, row.funcao, FRMS_FIREFIGHTER_AVIATION_PROFILE,
      ),
    })),
    next_cursor: records.length > limit && page.length > 0
      ? Number(page[page.length - 1].id)
      : null,
    source: 'FUNCIONARIOS',
    interpretation: 'Cadastro de pessoas ativas; classificação FRMS não equivale a tripulação escalada, treinamento válido ou aptidão.',
  };
}
