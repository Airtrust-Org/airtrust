import { hasSchemaTable } from '../utils/db-schema';
import { getSetorGestoresBySetor } from './setores-gestores';

export type SetorResponsavelComplianceDetail = {
  id: number;
  empresa_id: number;
  setor_id: number;
  setor_nome: string;
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_email: string;
  funcionario_cargo: string | null;
  ativo: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type ResponsavelComplianceElegivel = {
  id: number;
  nome: string;
  email: string;
  cargo: string | null;
  setor_id: number | null;
  setor_nome: string | null;
};

export class SetorResponsavelComplianceValidationError extends Error {}

async function tableExists(db: D1Database): Promise<boolean> {
  return hasSchemaTable(db, 'setores_responsaveis_compliance');
}

async function assertSetorAtivoNoTenant(db: D1Database, empresaId: number, setorId: number) {
  const setor = await db
    .prepare(
      `SELECT id FROM setores
       WHERE id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL`,
    )
    .bind(setorId, empresaId)
    .first<{ id: number }>();
  if (!setor) {
    throw new SetorResponsavelComplianceValidationError(
      'Setor não encontrado, inativo ou pertencente a outra empresa',
    );
  }
}

async function assertFuncionariosElegiveis(
  db: D1Database,
  empresaId: number,
  funcionarioIds: number[],
): Promise<number[]> {
  const ids = [...new Set(funcionarioIds.map(Number))].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (ids.length === 0) {
    throw new SetorResponsavelComplianceValidationError(
      'Selecione ao menos um responsável pelo setor',
    );
  }

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT id FROM funcionarios
       WHERE empresa_id = ?
         AND id IN (${placeholders})
         AND deleted_at IS NULL
         AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
         AND NULLIF(TRIM(COALESCE(email, '')), '') IS NOT NULL`,
    )
    .bind(empresaId, ...ids)
    .all<{ id: number }>();

  const found = new Set((rows.results || []).map((row) => Number(row.id)));
  const invalid = ids.filter((id) => !found.has(id));
  if (invalid.length > 0) {
    throw new SetorResponsavelComplianceValidationError(
      `Responsável inválido, inativo, sem e-mail ou fora da empresa: ${invalid.join(', ')}`,
    );
  }
  return ids;
}

export async function listResponsaveisComplianceElegiveis(
  db: D1Database,
  empresaId: number,
): Promise<ResponsavelComplianceElegivel[]> {
  const { results } = await db
    .prepare(
      `SELECT f.id, f.nome, f.email, f.cargo, f.setor_id, s.nome AS setor_nome
       FROM funcionarios f
       LEFT JOIN setores s
         ON s.id = f.setor_id
        AND s.empresa_id = f.empresa_id
        AND s.deleted_at IS NULL
       WHERE f.empresa_id = ?
         AND f.deleted_at IS NULL
         AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
         AND NULLIF(TRIM(COALESCE(f.email, '')), '') IS NOT NULL
       ORDER BY f.nome COLLATE NOCASE`,
    )
    .bind(empresaId)
    .all<ResponsavelComplianceElegivel>();
  return results || [];
}

export async function listSetoresResponsaveisCompliance(
  db: D1Database,
  empresaId: number,
): Promise<SetorResponsavelComplianceDetail[]> {
  if (!(await tableExists(db))) return [];

  const { results } = await db
    .prepare(
      `SELECT src.id, src.empresa_id, src.setor_id, s.nome AS setor_nome,
              src.funcionario_id, f.nome AS funcionario_nome,
              f.email AS funcionario_email, f.cargo AS funcionario_cargo,
              src.ativo, src.created_at, src.updated_at
       FROM setores_responsaveis_compliance src
       INNER JOIN setores s
         ON s.id = src.setor_id
        AND s.empresa_id = src.empresa_id
        AND s.deleted_at IS NULL
       INNER JOIN funcionarios f
         ON f.id = src.funcionario_id
        AND f.empresa_id = src.empresa_id
        AND f.deleted_at IS NULL
       WHERE src.empresa_id = ?
         AND src.ativo = 1
         AND src.deleted_at IS NULL
       ORDER BY s.nome COLLATE NOCASE, f.nome COLLATE NOCASE`,
    )
    .bind(empresaId)
    .all<Omit<SetorResponsavelComplianceDetail, 'ativo'> & { ativo: number }>();

  return (results || []).map((row) => ({ ...row, ativo: Boolean(row.ativo) }));
}

export async function getSetorResponsaveisComplianceBySetor(
  db: D1Database,
  empresaId: number,
  setorId: number,
): Promise<SetorResponsavelComplianceDetail[]> {
  if (!(await tableExists(db))) return [];

  const { results } = await db
    .prepare(
      `SELECT src.id, src.empresa_id, src.setor_id, s.nome AS setor_nome,
              src.funcionario_id, f.nome AS funcionario_nome,
              f.email AS funcionario_email, f.cargo AS funcionario_cargo,
              src.ativo, src.created_at, src.updated_at
       FROM setores_responsaveis_compliance src
       INNER JOIN setores s
         ON s.id = src.setor_id
        AND s.empresa_id = src.empresa_id
        AND s.deleted_at IS NULL
       INNER JOIN funcionarios f
         ON f.id = src.funcionario_id
        AND f.empresa_id = src.empresa_id
        AND f.deleted_at IS NULL
       WHERE src.empresa_id = ?
         AND src.setor_id = ?
         AND src.ativo = 1
         AND src.deleted_at IS NULL
       ORDER BY f.nome COLLATE NOCASE`,
    )
    .bind(empresaId, setorId)
    .all<Omit<SetorResponsavelComplianceDetail, 'ativo'> & { ativo: number }>();
  return (results || []).map((row) => ({ ...row, ativo: Boolean(row.ativo) }));
}

export async function replaceSetorResponsaveisCompliance(
  db: D1Database,
  empresaId: number,
  setorId: number,
  funcionarioIds: number[],
): Promise<SetorResponsavelComplianceDetail[]> {
  if (!(await tableExists(db))) {
    throw new SetorResponsavelComplianceValidationError(
      'Configuração de responsáveis por setor ainda não está disponível no banco',
    );
  }
  await assertSetorAtivoNoTenant(db, empresaId, setorId);
  const ids = await assertFuncionariosElegiveis(db, empresaId, funcionarioIds);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE setores_responsaveis_compliance
         SET ativo = 0,
             deleted_at = COALESCE(deleted_at, datetime('now')),
             updated_at = datetime('now')
         WHERE empresa_id = ? AND setor_id = ? AND deleted_at IS NULL`,
      )
      .bind(empresaId, setorId),
  ];

  for (const funcionarioId of ids) {
    statements.push(
      db
        .prepare(
          `INSERT INTO setores_responsaveis_compliance
             (empresa_id, setor_id, funcionario_id, ativo, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, 1, datetime('now'), datetime('now'), NULL)
           ON CONFLICT(empresa_id, setor_id, funcionario_id)
           DO UPDATE SET ativo = 1, deleted_at = NULL, updated_at = datetime('now')`,
        )
        .bind(empresaId, setorId, funcionarioId),
    );
  }

  await db.batch(statements);
  return getSetorResponsaveisComplianceBySetor(db, empresaId, setorId);
}

/**
 * Destinatários de escalonamento do Compliance. Responsáveis explícitos têm
 * precedência. Enquanto um setor ainda não foi configurado no novo modelo,
 * preservamos o comportamento legado usando os gestores operacionais ativos.
 */
export async function resolveSetorComplianceAlertEmails(
  db: D1Database,
  empresaId: number,
  setorId: number,
): Promise<string[]> {
  const explicit = await getSetorResponsaveisComplianceBySetor(db, empresaId, setorId);
  if (explicit.length > 0) {
    return [
      ...new Set(explicit.map((row) => String(row.funcionario_email || '').trim()).filter(Boolean)),
    ];
  }

  const legacy = await getSetorGestoresBySetor(db, empresaId, setorId, true);
  return [...new Set(legacy.map((row) => String(row.gestor_email || '').trim()).filter(Boolean))];
}
