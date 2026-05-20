import { z } from 'zod';
import type { Env } from '../types';

// ===== ZSCHEMAS =====
export const setorGestorSchema = z.object({
  setor_id: z.number().int().positive('Setor é obrigatório'),
  gestor_id: z.number().int().positive('Gestor é obrigatório'),
  role: z.enum(['manager', 'backup', 'observer']).default('manager'),
  ativo: z.boolean().default(true),
});

export const setorGestorUpdateSchema = setorGestorSchema.partial().extend({
  id: z.number().int().positive(),
});

// ===== TYPES =====
export type SetorGestorInput = z.infer<typeof setorGestorSchema>;
export type SetorGestorUpdateInput = z.infer<typeof setorGestorUpdateSchema>;

export type SetorGestor = {
  id: number;
  setor_id: number;
  gestor_id: number;
  empresa_id: number;
  role: 'manager' | 'backup' | 'observer';
  ativo: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type SetorGestorDetail = SetorGestor & {
  setor_nome: string;
  setor_codigo?: string;
  gestor_nome: string;
  gestor_email: string;
  gestor_cargo?: string;
};

// ===== SERVICE FUNCTIONS =====

export async function createSetorGestor(
  db: any,
  empresaId: number,
  data: SetorGestorInput,
): Promise<number> {
  // Validate that setor belongs to empresa
  const setor = await db
    .prepare('SELECT id FROM setores WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(data.setor_id, empresaId)
    .first();

  if (!setor) {
    throw new Error('Setor não encontrado para esta empresa');
  }

  // Validate that gestor belongs to empresa
  const gestor = await db
    .prepare(
      'SELECT id FROM notificacoes_convocacao_cc_gestores WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(data.gestor_id, empresaId)
    .first();

  if (!gestor) {
    throw new Error('Gestor não encontrado para esta empresa');
  }

  const result = await db
    .prepare(
      `
      INSERT INTO setores_gestores 
        (setor_id, gestor_id, empresa_id, role, ativo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
    )
    .bind(data.setor_id, data.gestor_id, empresaId, data.role, data.ativo ? 1 : 0)
    .run();

  return result.meta.last_row_id;
}

export async function getSetorGestorById(
  db: any,
  empresaId: number,
  id: number,
): Promise<SetorGestorDetail | null> {
  return db
    .prepare(
      `
      SELECT 
        sg.id,
        sg.setor_id,
        sg.gestor_id,
        sg.empresa_id,
        sg.role,
        sg.ativo,
        sg.created_at,
        sg.updated_at,
        s.nome as setor_nome,
        s.codigo as setor_codigo,
        g.nome as gestor_nome,
        g.email as gestor_email,
        g.cargo as gestor_cargo
      FROM setores_gestores sg
      INNER JOIN setores s ON s.id = sg.setor_id
      INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
      WHERE sg.id = ? 
        AND sg.empresa_id = ?
        AND sg.deleted_at IS NULL
        AND s.deleted_at IS NULL
        AND g.deleted_at IS NULL
      `,
    )
    .bind(id, empresaId)
    .first();
}

export async function getSetorGestoresBySetor(
  db: any,
  empresaId: number,
  setorId: number,
  onlyActive = true,
): Promise<SetorGestorDetail[]> {
  let query = `
    SELECT 
      sg.id,
      sg.setor_id,
      sg.gestor_id,
      sg.empresa_id,
      sg.role,
      sg.ativo,
      sg.created_at,
      sg.updated_at,
      s.nome as setor_nome,
      s.codigo as setor_codigo,
      g.nome as gestor_nome,
      g.email as gestor_email,
      g.cargo as gestor_cargo
    FROM setores_gestores sg
    INNER JOIN setores s ON s.id = sg.setor_id
    INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
    WHERE sg.empresa_id = ?
      AND sg.setor_id = ?
      AND sg.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND g.deleted_at IS NULL
  `;

  if (onlyActive) {
    query += ` AND sg.ativo = 1 AND g.ativo = 1`;
  }

  query += ` ORDER BY g.nome ASC`;

  const rows = await db.prepare(query).bind(empresaId, setorId).all();
  return (rows?.results || []) as SetorGestorDetail[];
}

export async function getSetorGestoresByGestor(
  db: any,
  empresaId: number,
  gestorId: number,
  onlyActive = true,
): Promise<SetorGestorDetail[]> {
  let query = `
    SELECT 
      sg.id,
      sg.setor_id,
      sg.gestor_id,
      sg.empresa_id,
      sg.role,
      sg.ativo,
      sg.created_at,
      sg.updated_at,
      s.nome as setor_nome,
      s.codigo as setor_codigo,
      g.nome as gestor_nome,
      g.email as gestor_email,
      g.cargo as gestor_cargo
    FROM setores_gestores sg
    INNER JOIN setores s ON s.id = sg.setor_id
    INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
    WHERE sg.empresa_id = ?
      AND sg.gestor_id = ?
      AND sg.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND g.deleted_at IS NULL
  `;

  if (onlyActive) {
    query += ` AND sg.ativo = 1 AND s.ativo = 1`;
  }

  query += ` ORDER BY s.nome ASC`;

  const rows = await db.prepare(query).bind(empresaId, gestorId).all();
  return (rows?.results || []) as SetorGestorDetail[];
}

export async function getAllSetorGestores(
  db: any,
  empresaId: number,
  onlyActive = true,
): Promise<SetorGestorDetail[]> {
  let query = `
    SELECT 
      sg.id,
      sg.setor_id,
      sg.gestor_id,
      sg.empresa_id,
      sg.role,
      sg.ativo,
      sg.created_at,
      sg.updated_at,
      s.nome as setor_nome,
      s.codigo as setor_codigo,
      g.nome as gestor_nome,
      g.email as gestor_email,
      g.cargo as gestor_cargo
    FROM setores_gestores sg
    INNER JOIN setores s ON s.id = sg.setor_id
    INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
    WHERE sg.empresa_id = ?
      AND sg.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND g.deleted_at IS NULL
  `;

  if (onlyActive) {
    query += ` AND sg.ativo = 1 AND g.ativo = 1 AND s.ativo = 1`;
  }

  query += ` ORDER BY s.nome ASC, g.nome ASC`;

  const rows = await db.prepare(query).bind(empresaId).all();
  return (rows?.results || []) as SetorGestorDetail[];
}

export async function updateSetorGestor(
  db: any,
  empresaId: number,
  id: number,
  data: Partial<SetorGestorInput>,
): Promise<boolean> {
  // Validate exists
  const current = await getSetorGestorById(db, empresaId, id);
  if (!current) {
    throw new Error('Relação setor-gestor não encontrada');
  }

  const updates: string[] = [];
  const binds: any[] = [];

  if (data.role !== undefined) {
    updates.push('role = ?');
    binds.push(data.role);
  }

  if (data.ativo !== undefined) {
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
      WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
      `,
    )
    .bind(...binds)
    .run();

  return true;
}

export async function deleteSetorGestor(db: any, empresaId: number, id: number): Promise<boolean> {
  // Validate exists
  const current = await getSetorGestorById(db, empresaId, id);
  if (!current) {
    throw new Error('Relação setor-gestor não encontrada');
  }

  await db
    .prepare(
      `
      UPDATE setores_gestores 
      SET deleted_at = datetime('now')
      WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
      `,
    )
    .bind(id, empresaId)
    .run();

  return true;
}

export async function getGestoresByFuncionarioSetor(
  db: any,
  empresaId: number,
  funcionarioId: number,
): Promise<Array<{ id: number; nome: string; email: string; cargo?: string; role: string }>> {
  // Get employee's sector
  const funcionario = await db
    .prepare(
      'SELECT setor_id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(funcionarioId, empresaId)
    .first();

  if (!funcionario || !funcionario.setor_id) {
    return [];
  }

  // Get gestores for that sector
  const rows = await db
    .prepare(
      `
      SELECT 
        g.id,
        g.nome,
        g.email,
        g.cargo,
        sg.role
      FROM setores_gestores sg
      INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
      WHERE sg.empresa_id = ?
        AND sg.setor_id = ?
        AND sg.deleted_at IS NULL
        AND sg.ativo = 1
        AND g.deleted_at IS NULL
        AND g.ativo = 1
      ORDER BY sg.role DESC, g.nome ASC
      `,
    )
    .bind(empresaId, funcionario.setor_id)
    .all();
  return (rows?.results || []) as Array<{
    id: number;
    nome: string;
    email: string;
    cargo?: string;
    role: string;
  }>;
}
