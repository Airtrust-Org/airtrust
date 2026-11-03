import { collectByBindChunks } from '../utils/d1-bind-chunks';
import { getUsuariosSchema, hasUsuariosEmpresasTable } from '../utils/db-schema';

/**
 * Diagnóstico somente-leitura: quais funcionários possuem uma conta que o
 * aluno realmente consegue usar para ver suas matrículas.
 *
 * Espelha o gate de `resolveLmsFuncionarioId` (usuário não removido apontando
 * para funcionário ativo da empresa) somado às exigências de `auth()` (conta
 * ativa e vínculo com a empresa via `usuarios_empresas.role`). Sem esse par, o
 * aluno recebe 409 em /matriculas/minhas e /minhas-ead e nada avisa quem
 * matriculou. Nenhuma permissão é alterada e nenhum vínculo é criado aqui.
 */
export async function listFuncionariosComContaVinculada(
  db: D1Database,
  empresaIdInput: unknown,
  funcionarioIds: readonly number[],
): Promise<Set<number>> {
  const empresaId = Number(empresaIdInput);
  const ids = [...new Set(funcionarioIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const linked = new Set<number>();
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || ids.length === 0) return linked;

  const schema = await getUsuariosSchema(db);
  const withMembership = await hasUsuariosEmpresasTable(db);
  const userActiveSql = schema.hasActive ? 'AND u.active = 1' : schema.hasAtivo ? 'AND u.ativo = 1' : '';
  const membershipJoinSql = withMembership
    ? `JOIN usuarios_empresas ue
         ON ue.usuario_id = u.id
        AND ue.empresa_id = ?
        AND NULLIF(TRIM(ue.role), '') IS NOT NULL`
    : '';
  const fixedBinds = withMembership ? 2 : 1;

  const rows = await collectByBindChunks(ids, fixedBinds, async (chunk) => {
    const placeholders = chunk.map(() => '?').join(',');
    const result = await db
      .prepare(
        `SELECT DISTINCT f.id AS funcionario_id
           FROM usuarios u
           JOIN funcionarios f
             ON f.id = u.funcionario_id
            AND f.empresa_id = ?
            AND f.deleted_at IS NULL
            AND COALESCE(f.ativo, 1) = 1
            AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           ${membershipJoinSql}
          WHERE u.deleted_at IS NULL
            ${userActiveSql}
            AND f.id IN (${placeholders})`,
      )
      .bind(empresaId, ...(withMembership ? [empresaId] : []), ...chunk)
      .all<{ funcionario_id: number }>();
    return result.results ?? [];
  });

  for (const row of rows) linked.add(Number(row.funcionario_id));
  return linked;
}

/** Acrescenta `aluno_vinculado` (1/0) a linhas de matrícula, sem alterar o resto. */
export async function withAlunoVinculado<T extends { funcionario_id?: unknown }>(
  db: D1Database,
  empresaId: unknown,
  rows: readonly T[],
): Promise<Array<T & { aluno_vinculado: 0 | 1 }>> {
  const linked = await listFuncionariosComContaVinculada(
    db,
    empresaId,
    rows.map((row) => Number(row.funcionario_id)),
  );
  return rows.map((row) => ({
    ...row,
    aluno_vinculado: linked.has(Number(row.funcionario_id)) ? 1 : 0,
  }));
}
