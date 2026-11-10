/**
 * Validade do CMA por idade: a regra pura vive em `src/shared/utils/cma-validity.ts`
 * (compartilhada com o frontend); aqui ficam apenas os acessos a D1.
 *
 * @module utils/cma-validity
 */

import { isCmaCode, resolveCmaValidity, type CmaValidity } from '../../../src/shared/utils/cma-validity';

export * from '../../../src/shared/utils/cma-validity';

interface NascimentoDb {
  prepare(query: string): {
    bind(...values: unknown[]): { first<T = unknown>(): Promise<T | null> };
  };
}

/** Lê funcionarios.nascimento escopado ao tenant (null se ausente). */
export async function loadFuncionarioNascimento(
  db: NascimentoDb,
  empresaId: number | string,
  funcionarioId: number | string,
): Promise<string | null> {
  const row = await db
    .prepare(
      'SELECT nascimento FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(funcionarioId, empresaId)
    .first<{ nascimento: string | null }>();
  return row?.nascimento ?? null;
}

/**
 * Se o código for CMA, devolve a validade por idade; caso contrário null
 * (o chamador usa a validade do modelo/tipo).
 */
export async function resolveCmaValidityForEmployee(
  db: NascimentoDb,
  params: {
    codigo: unknown;
    empresaId: number | string;
    funcionarioId: number | string;
    dataRealizacao: unknown;
  },
): Promise<CmaValidity | null> {
  if (!isCmaCode(params.codigo)) return null;
  const nascimento = await loadFuncionarioNascimento(db, params.empresaId, params.funcionarioId);
  return resolveCmaValidity({ dataRealizacao: params.dataRealizacao, dataNascimento: nascimento });
}
