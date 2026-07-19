import { z } from 'zod';

const gestorRoleValues = ['GESTOR', 'MANAGER', 'COMPLIANCE'];

const managerPerfilValues = ['GESTOR', 'MANAGER', 'SUPERVISOR', 'COORDENADOR', 'COORDINATOR'];

export class SetorGestorValidationError extends Error {}
export class SetorGestorConflictError extends Error {}

export function isManagerPerfil(value: unknown): boolean {
  return managerPerfilValues.includes(String(value || '').trim().toUpperCase());
}

const setorGestorBaseSchema = z.object({
  setor_id: z.number().int().positive('Setor é obrigatório'),
  usuario_id: z.number().int().positive().optional(),
  gestor_id: z.number().int().positive().optional(),
  role: z.enum(['manager', 'backup', 'observer']).default('manager'),
  ativo: z.boolean().default(true),
});

export const setorGestorSchema = setorGestorBaseSchema
  .refine((data) => Number(data.usuario_id || 0) > 0 || Number(data.gestor_id || 0) > 0, {
    message: 'Usuário gestor é obrigatório',
    path: ['usuario_id'],
  });

export const setorGestorUpdateSchema = setorGestorBaseSchema.partial().extend({
  id: z.number().int().positive().optional(),
})
  .refine((data) => Number(data.usuario_id || 0) > 0 || Number(data.gestor_id || 0) > 0, {
    message: 'Usuário gestor é obrigatório',
    path: ['usuario_id'],
  });

export type SetorGestorInput = z.infer<typeof setorGestorSchema>;
export type SetorGestorUpdateInput = z.infer<typeof setorGestorUpdateSchema>;

export type SetorGestor = {
  id: number;
  setor_id: number;
  usuario_id: number | null;
  gestor_id: number | null;
  empresa_id: number;
  role: 'manager' | 'backup' | 'observer';
  ativo: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type SetorGestorDetail = SetorGestor & {
  setor_nome: string;
  setor_codigo?: string | null;
  gestor_nome: string;
  gestor_email: string;
  gestor_cargo?: string | null;
  gestor_perfil?: string | null;
  funcionario_nome?: string | null;
};

export type GestorElegivel = {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  funcionario_id: number | null;
  funcionario_nome: string | null;
  cargo: string | null;
};

async function tableHasColumn(
  db: D1Database,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const columns = await db
    .prepare(`SELECT name FROM pragma_table_info('${tableName}')`)
    .all<{ name: string }>();
  return (columns.results || []).some((column) => column.name === columnName);
}

function gestorProjectionSql() {
  return `
    COALESCE(f.nome, u.nome, u.email) as gestor_nome,
    COALESCE(u.email, '') as gestor_email,
    COALESCE(f.cargo, '') as gestor_cargo,
    COALESCE(ue.role, u.perfil) as gestor_perfil,
    f.nome as funcionario_nome
  `;
}

async function resolveLegacyGestorUsuarioId(
  db: D1Database,
  empresaId: number,
  gestorId?: number | null,
): Promise<number | null> {
  if (!gestorId || !(await tableHasColumn(db, 'setores_gestores', 'gestor_id'))) {
    return null;
  }

  const legacyMatch = await db
    .prepare(
      `SELECT u.id as usuario_id
         FROM notificacoes_convocacao_cc_gestores g
         INNER JOIN usuarios u
           ON LOWER(TRIM(u.email)) = LOWER(TRIM(g.email))
          AND u.deleted_at IS NULL
         LEFT JOIN usuarios_empresas ue
           ON ue.usuario_id = u.id
          AND ue.empresa_id = ?
        WHERE g.id = ?
          AND g.deleted_at IS NULL
          AND COALESCE(ue.role, u.perfil) IS NOT NULL
        LIMIT 1`,
    )
    .bind(empresaId, gestorId)
    .first<{ usuario_id: number | null }>();

  return legacyMatch?.usuario_id ? Number(legacyMatch.usuario_id) : null;
}

async function ensureSetorBelongsToEmpresa(
  db: D1Database,
  empresaId: number,
  setorId: number,
): Promise<void> {
  const setor = await db
    .prepare(
      'SELECT id FROM setores WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND ativo = 1',
    )
    .bind(setorId, empresaId)
    .first();

  if (!setor) {
    throw new SetorGestorValidationError(
      'Setor não encontrado, inativo ou pertencente a outra empresa',
    );
  }
}

/**
 * Valida uma lista de setor_ids para atribuição de gestor: exige ao menos um
 * id, e cada um deve pertencer à empresa informada e estar ativo. Usado no
 * fluxo de criação/ativação de gestor (usuarios), não substitui a validação
 * de setor único usada pelo CRUD de setores_gestores.
 */
export async function assertSetoresValidosParaEmpresa(
  db: D1Database,
  empresaId: number,
  setorIds: number[] | undefined | null,
): Promise<number[]> {
  const uniqueIds = [...new Set((setorIds || []).map(Number))].filter(
    (n) => Number.isInteger(n) && n > 0,
  );

  if (uniqueIds.length === 0) {
    throw new SetorGestorValidationError(
      'Gestor requer ao menos um setor válido (setor_ids)',
    );
  }

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT id FROM setores WHERE id IN (${placeholders}) AND empresa_id = ? AND deleted_at IS NULL AND ativo = 1`,
    )
    .bind(...uniqueIds, empresaId)
    .all<{ id: number }>();

  const found = new Set((rows.results || []).map((r) => Number(r.id)));
  const invalid = uniqueIds.filter((setorId) => !found.has(setorId));

  if (invalid.length > 0) {
    throw new SetorGestorValidationError(
      `Setor inválido, inativo ou de outra empresa: ${invalid.join(', ')}`,
    );
  }

  return uniqueIds;
}

async function countActiveSetoresGestor(
  db: D1Database,
  empresaId: number,
  usuarioId: number,
  excludeId?: number,
): Promise<number> {
  const row = excludeId
    ? await db
        .prepare(
          `SELECT COUNT(*) as n FROM setores_gestores
             WHERE usuario_id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL AND id != ?`,
        )
        .bind(usuarioId, empresaId, excludeId)
        .first<{ n: number }>()
    : await db
        .prepare(
          `SELECT COUNT(*) as n FROM setores_gestores
             WHERE usuario_id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL`,
        )
        .bind(usuarioId, empresaId)
        .first<{ n: number }>();

  return Number(row?.n || 0);
}

async function assertNaoRemoveUltimoSetorDeGestorAtivo(
  db: D1Database,
  empresaId: number,
  usuarioId: number | null,
  excludeId: number,
): Promise<void> {
  if (!usuarioId) return;

  const usuario = await db
    .prepare('SELECT active, perfil FROM usuarios WHERE id = ? AND deleted_at IS NULL')
    .bind(usuarioId)
    .first<{ active: number; perfil: string }>();

  const permaneceGestorAtivo = Boolean(usuario?.active) && isManagerPerfil(usuario?.perfil);
  if (!permaneceGestorAtivo) return;

  const restantes = await countActiveSetoresGestor(db, empresaId, usuarioId, excludeId);
  if (restantes === 0) {
    throw new SetorGestorConflictError(
      'Não é possível remover o último setor de um gestor ativo. Altere o papel ou desative o usuário antes.',
    );
  }
}

/**
 * Monta (sem executar) os INSERTs de setores_gestores necessários para que
 * `usuarioId` passe a gerenciar todos os setores em `setorIds`, pulando os
 * que já estão ativos. Retorna prepared statements para o chamador incluir
 * no mesmo `db.batch()` que grava o papel do usuário — grava role+setores
 * atomicamente.
 */
export async function buildManagerSetorInsertStatements(
  db: D1Database,
  empresaId: number,
  usuarioId: number,
  setorIds: number[] | undefined | null,
): Promise<D1PreparedStatement[]> {
  const validIds = await assertSetoresValidosParaEmpresa(db, empresaId, setorIds);

  const existing = await db
    .prepare(
      `SELECT setor_id FROM setores_gestores
         WHERE usuario_id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL`,
    )
    .bind(usuarioId, empresaId)
    .all<{ setor_id: number }>();

  const existingSet = new Set((existing.results || []).map((r) => Number(r.setor_id)));
  const toInsert = validIds.filter((setorId) => !existingSet.has(setorId));

  return toInsert.map((setorId) =>
    db
      .prepare(
        `INSERT INTO setores_gestores
           (setor_id, usuario_id, gestor_id, empresa_id, role, ativo, created_at, updated_at)
         VALUES (?, ?, NULL, ?, 'manager', 1, datetime('now'), datetime('now'))`,
      )
      .bind(setorId, usuarioId, empresaId),
  );
}

async function ensureUsuarioGestorValido(
  db: D1Database,
  empresaId: number,
  usuarioId: number,
): Promise<GestorElegivel> {
  const gestor = await db
    .prepare(
      `SELECT
         u.id,
         COALESCE(f.nome, u.nome, u.email) as nome,
         u.email,
         COALESCE(ue.role, u.perfil) as perfil,
         u.funcionario_id,
         f.nome as funcionario_nome,
         f.cargo as cargo
       FROM usuarios u
       LEFT JOIN usuarios_empresas ue
         ON ue.usuario_id = u.id
        AND ue.empresa_id = ?
       LEFT JOIN funcionarios f
         ON f.id = u.funcionario_id
        AND f.empresa_id = ?
        AND f.deleted_at IS NULL
       WHERE u.id = ?
         AND u.deleted_at IS NULL
         AND u.active = 1
       LIMIT 1`,
    )
    .bind(empresaId, empresaId, usuarioId)
    .first<GestorElegivel>();

  const perfil = String(gestor?.perfil || '')
    .trim()
    .toUpperCase();

  if (!gestor?.id || !gestor.email || !gestorRoleValues.includes(perfil)) {
    throw new Error('Usuário selecionado não possui perfil de gestor');
  }

  return gestor;
}

async function resolveUsuarioId(
  db: D1Database,
  empresaId: number,
  data: Pick<SetorGestorInput, 'usuario_id' | 'gestor_id'>,
): Promise<number> {
  const explicitUsuarioId = Number(data.usuario_id || 0);
  if (explicitUsuarioId > 0) {
    return explicitUsuarioId;
  }

  const legacyUsuarioId = await resolveLegacyGestorUsuarioId(db, empresaId, data.gestor_id);
  if (legacyUsuarioId) {
    return legacyUsuarioId;
  }

  throw new Error('Vínculo gestor-setor exige usuario_id válido');
}

export async function listEligibleGestorUsers(
  db: D1Database,
  empresaId: number,
): Promise<GestorElegivel[]> {
  const rows = await db
    .prepare(
      `SELECT
         u.id,
         COALESCE(f.nome, u.nome, u.email) as nome,
         u.email,
         COALESCE(ue.role, u.perfil) as perfil,
         u.funcionario_id,
         f.nome as funcionario_nome,
         f.cargo as cargo
       FROM usuarios u
       LEFT JOIN usuarios_empresas ue
         ON ue.usuario_id = u.id
        AND ue.empresa_id = ?
       LEFT JOIN funcionarios f
         ON f.id = u.funcionario_id
        AND f.empresa_id = ?
        AND f.deleted_at IS NULL
       WHERE u.deleted_at IS NULL
         AND u.active = 1
         AND UPPER(COALESCE(ue.role, u.perfil)) IN (${gestorRoleValues.map(() => '?').join(', ')})
       ORDER BY nome ASC`,
    )
    .bind(empresaId, empresaId, ...gestorRoleValues)
    .all<GestorElegivel>();

  return rows.results || [];
}

export async function createSetorGestor(
  db: D1Database,
  empresaId: number,
  data: SetorGestorInput,
): Promise<number> {
  await ensureSetorBelongsToEmpresa(db, empresaId, data.setor_id);

  const usuarioId = await resolveUsuarioId(db, empresaId, data);
  await ensureUsuarioGestorValido(db, empresaId, usuarioId);

  const legacyGestorId =
    Number(data.gestor_id || 0) > 0 && (await tableHasColumn(db, 'setores_gestores', 'gestor_id'))
      ? Number(data.gestor_id)
      : null;

  const result = await db
    .prepare(
      `
      INSERT INTO setores_gestores
        (setor_id, usuario_id, gestor_id, empresa_id, role, ativo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
    )
    .bind(data.setor_id, usuarioId, legacyGestorId, empresaId, data.role, data.ativo ? 1 : 0)
    .run();

  return Number(result.meta.last_row_id);
}

function setorGestorBaseQuery() {
  return `
    SELECT
      sg.id,
      sg.setor_id,
      sg.usuario_id,
      sg.gestor_id,
      sg.empresa_id,
      sg.role,
      sg.ativo,
      sg.created_at,
      sg.updated_at,
      s.nome as setor_nome,
      s.codigo as setor_codigo,
      ${gestorProjectionSql()}
    FROM setores_gestores sg
    INNER JOIN setores s ON s.id = sg.setor_id
    INNER JOIN usuarios u ON u.id = sg.usuario_id AND u.deleted_at IS NULL
    LEFT JOIN usuarios_empresas ue
      ON ue.usuario_id = u.id
     AND ue.empresa_id = sg.empresa_id
    LEFT JOIN funcionarios f
      ON f.id = u.funcionario_id
     AND f.empresa_id = sg.empresa_id
     AND f.deleted_at IS NULL
    WHERE sg.empresa_id = ?
      AND sg.deleted_at IS NULL
      AND s.deleted_at IS NULL
  `;
}

export async function getSetorGestorById(
  db: D1Database,
  empresaId: number,
  id: number,
): Promise<SetorGestorDetail | null> {
  return db
    .prepare(
      `${setorGestorBaseQuery()}
         AND sg.id = ?
       LIMIT 1`,
    )
    .bind(empresaId, id)
    .first<SetorGestorDetail>();
}

export async function getSetorGestoresBySetor(
  db: D1Database,
  empresaId: number,
  setorId: number,
  onlyActive = true,
): Promise<SetorGestorDetail[]> {
  const activeClause = onlyActive ? ' AND sg.ativo = 1 AND s.ativo = 1' : '';
  const rows = await db
    .prepare(
      `${setorGestorBaseQuery()}
         AND sg.setor_id = ?
         ${activeClause}
       ORDER BY gestor_nome ASC`,
    )
    .bind(empresaId, setorId)
    .all<SetorGestorDetail>();

  return rows.results || [];
}

export async function getSetorGestoresByGestor(
  db: D1Database,
  empresaId: number,
  usuarioId: number,
  onlyActive = true,
): Promise<SetorGestorDetail[]> {
  const activeClause = onlyActive ? ' AND sg.ativo = 1 AND s.ativo = 1' : '';
  const rows = await db
    .prepare(
      `${setorGestorBaseQuery()}
         AND sg.usuario_id = ?
         ${activeClause}
       ORDER BY setor_nome ASC`,
    )
    .bind(empresaId, usuarioId)
    .all<SetorGestorDetail>();

  return rows.results || [];
}

export async function getAllSetorGestores(
  db: D1Database,
  empresaId: number,
  onlyActive = true,
): Promise<SetorGestorDetail[]> {
  const activeClause = onlyActive ? ' AND sg.ativo = 1 AND s.ativo = 1' : '';
  const rows = await db
    .prepare(
      `${setorGestorBaseQuery()}
         ${activeClause}
       ORDER BY setor_nome ASC, gestor_nome ASC`,
    )
    .bind(empresaId)
    .all<SetorGestorDetail>();

  return rows.results || [];
}

export async function updateSetorGestor(
  db: D1Database,
  empresaId: number,
  id: number,
  data: Partial<SetorGestorInput>,
): Promise<boolean> {
  const current = await getSetorGestorById(db, empresaId, id);
  if (!current) {
    throw new Error('Relação setor-gestor não encontrada');
  }

  const updates: string[] = [];
  const binds: unknown[] = [];

  if (data.setor_id !== undefined) {
    await ensureSetorBelongsToEmpresa(db, empresaId, data.setor_id);
    updates.push('setor_id = ?');
    binds.push(data.setor_id);
  }

  if (data.usuario_id !== undefined || data.gestor_id !== undefined) {
    const usuarioId = await resolveUsuarioId(db, empresaId, {
      usuario_id: data.usuario_id,
      gestor_id: data.gestor_id,
    });
    await ensureUsuarioGestorValido(db, empresaId, usuarioId);
    updates.push('usuario_id = ?');
    binds.push(usuarioId);

    if (await tableHasColumn(db, 'setores_gestores', 'gestor_id')) {
      updates.push('gestor_id = ?');
      binds.push(Number(data.gestor_id || 0) > 0 ? Number(data.gestor_id) : null);
    }
  }

  if (data.role !== undefined) {
    updates.push('role = ?');
    binds.push(data.role);
  }

  if (data.ativo !== undefined) {
    if (data.ativo === false) {
      await assertNaoRemoveUltimoSetorDeGestorAtivo(db, empresaId, current.usuario_id, id);
    }
    updates.push('ativo = ?');
    binds.push(data.ativo ? 1 : 0);
  }

  if (updates.length === 0) {
    return true;
  }

  updates.push('updated_at = datetime("now")');
  binds.push(id, empresaId);

  await db
    .prepare(
      `
      UPDATE setores_gestores
         SET ${updates.join(', ')}
       WHERE id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL
      `,
    )
    .bind(...binds)
    .run();

  return true;
}

export async function deleteSetorGestor(db: D1Database, empresaId: number, id: number): Promise<boolean> {
  const current = await getSetorGestorById(db, empresaId, id);
  if (!current) {
    throw new Error('Relação setor-gestor não encontrada');
  }

  await assertNaoRemoveUltimoSetorDeGestorAtivo(db, empresaId, current.usuario_id, id);

  await db
    .prepare(
      `
      UPDATE setores_gestores
         SET deleted_at = datetime('now'),
             updated_at = datetime('now')
       WHERE id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL
      `,
    )
    .bind(id, empresaId)
    .run();

  return true;
}

export async function getGestoresByFuncionarioSetor(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
): Promise<Array<{ id: number; nome: string; email: string; cargo?: string; role: string }>> {
  const funcionario = await db
    .prepare(
      'SELECT setor_id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(funcionarioId, empresaId)
    .first<{ setor_id: number | null }>();

  if (!funcionario?.setor_id) {
    return [];
  }

  const rows = await db
    .prepare(
      `
      SELECT
        u.id,
        COALESCE(f.nome, u.nome, u.email) as nome,
        u.email,
        f.cargo,
        sg.role
      FROM setores_gestores sg
      INNER JOIN usuarios u ON u.id = sg.usuario_id AND u.deleted_at IS NULL
      LEFT JOIN funcionarios f
        ON f.id = u.funcionario_id
       AND f.empresa_id = sg.empresa_id
       AND f.deleted_at IS NULL
      WHERE sg.empresa_id = ?
        AND sg.setor_id = ?
        AND sg.deleted_at IS NULL
        AND sg.ativo = 1
      ORDER BY sg.role DESC, nome ASC
      `,
    )
    .bind(empresaId, funcionario.setor_id)
    .all<{ id: number; nome: string; email: string; cargo?: string; role: string }>();

  return rows.results || [];
}
