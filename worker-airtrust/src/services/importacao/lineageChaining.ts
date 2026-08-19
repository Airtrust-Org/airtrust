/**
 * Encadeamento de lineage (renovacao_de) para os importadores de
 * qualificacoes_historico.
 *
 * Os importadores (QualificacaoHistoricoImportacaoService, o path inline de
 * routes/importacao.ts, e importacao-xlsx.ts) identificam registros por
 * (empresa_id, funcionario_cpf, qualificacao_codigo) — não por
 * funcionario_id — e nunca setam `status` (fica NULL, tratado como
 * conclusão real: estes importadores só carregam histórico já concluído,
 * nunca PLANEJADA). Isso os torna incompatíveis com os primitivos canônicos
 * baseados em funcionario_id (createQualificationHistoryAtomic etc.), então
 * este módulo implementa o mesmo invariante (successor.renovacao_de =
 * predecessor.id) para essa identidade alternativa.
 *
 * Contrato DETECT → CLASSIFY → PLAN → APPLY:
 * - DETECT: lê todas as linhas ativas do grupo (empresa+cpf+código).
 * - CLASSIFY: se duas ou mais linhas compartilham a mesma data_conclusao,
 *   a ordem é ambígua — não há como decidir qual é "antes" da outra sem
 *   inventar um critério arbitrário.
 * - PLAN/APPLY: se determinístico (nenhum empate), encadeia renovacao_de
 *   em ordem cronológica e materializa cada predecessor como RENOVADA.
 *   Se ambíguo, FAIL CLOSED — não aplica nenhum encadeamento para aquele
 *   grupo e reporta o motivo, em vez de escolher arbitrariamente por id.
 *
 * Idempotente: só faz UPDATE quando o valor já não é o esperado, então
 * rodar novamente sobre o mesmo grupo (ex.: reimportação) converge sem
 * duplicar nem regredir.
 */

export interface LineageChainGroupResult {
  cpf: string;
  codigo: string;
  chained: boolean;
  reason?: 'AMBIGUOUS_DATES' | 'SINGLE_OR_NO_ROW';
  rowsLinked: number;
}

interface HistoricoRow {
  id: number;
  data_conclusao: string;
  renovacao_de: number | null;
  renovada: number | null;
  status: string | null;
}

/**
 * Encadeia renovacao_de para um único grupo (empresa+cpf+código). Fail-closed
 * (não aplica nada) se houver empate de data_conclusao dentro do grupo.
 */
export async function chainQualificationLineageForGroup(
  db: D1Database,
  params: { empresaId: number; funcionarioCpf: string; qualificacaoCodigo: string },
): Promise<LineageChainGroupResult> {
  const { empresaId, funcionarioCpf, qualificacaoCodigo } = params;

  const { results } = await db
    .prepare(
      `SELECT id, data_conclusao, renovacao_de, renovada, status
         FROM qualificacoes_historico
        WHERE empresa_id = ?
          AND funcionario_cpf = ?
          AND UPPER(COALESCE(qualificacao_codigo, '')) = UPPER(?)
          AND deleted_at IS NULL
          AND UPPER(COALESCE(status, '')) NOT IN ('PLANEJADA', 'PLANEJADO', 'CANCELADA', 'CANCELADO')
        ORDER BY date(data_conclusao) ASC, id ASC`,
    )
    .bind(empresaId, funcionarioCpf, qualificacaoCodigo)
    .all<HistoricoRow>();

  const rows = results || [];
  if (rows.length < 2) {
    return { cpf: funcionarioCpf, codigo: qualificacaoCodigo, chained: false, reason: 'SINGLE_OR_NO_ROW', rowsLinked: 0 };
  }

  // CLASSIFY: qualquer empate de data_conclusao no grupo torna a ordem
  // cronológica indeterminável — fail closed para o grupo inteiro.
  const dates = rows.map((r) => r.data_conclusao);
  const uniqueDates = new Set(dates);
  if (uniqueDates.size !== dates.length) {
    return { cpf: funcionarioCpf, codigo: qualificacaoCodigo, chained: false, reason: 'AMBIGUOUS_DATES', rowsLinked: 0 };
  }

  // PLAN/APPLY: já ordenado por data_conclusao ASC — encadeia cada linha ao
  // seu predecessor imediato (o anterior na lista) e materializa esse
  // predecessor como RENOVADA. Statements independentes (não db.batch()):
  // cada UPDATE é idempotente e auto-contido, então uma falha parcial deixa
  // o estado sempre consistente com o invariante, nunca com um sucessor
  // órfão apontando para um predecessor não-RENOVADA.
  let rowsLinked = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const predecessor = rows[i - 1];
    const successor = rows[i];

    if (successor.renovacao_de !== predecessor.id) {
      await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET renovacao_de = ?, updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(predecessor.id, successor.id, empresaId)
        .run();
      rowsLinked += 1;
    }

    if (!(predecessor.renovada === 1 && String(predecessor.status || '').toUpperCase() === 'RENOVADA')) {
      await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET renovada = 1, status = 'RENOVADA', updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(predecessor.id, empresaId)
        .run();
    }
  }

  return { cpf: funcionarioCpf, codigo: qualificacaoCodigo, chained: true, rowsLinked };
}

/**
 * Encadeia lineage para múltiplos grupos (empresa+cpf+código) de uma vez —
 * usado após um batch de importação para cobrir todos os grupos tocados
 * pelo lote, sem duplicar trabalho para o mesmo par cpf+código.
 */
export async function chainQualificationLineageForGroups(
  db: D1Database,
  empresaId: number,
  groups: Array<{ funcionarioCpf: string; qualificacaoCodigo: string }>,
): Promise<LineageChainGroupResult[]> {
  const seen = new Set<string>();
  const uniqueGroups = groups.filter((g) => {
    const key = `${g.funcionarioCpf}|${g.qualificacaoCodigo.toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results: LineageChainGroupResult[] = [];
  for (const group of uniqueGroups) {
    results.push(
      await chainQualificationLineageForGroup(db, {
        empresaId,
        funcionarioCpf: group.funcionarioCpf,
        qualificacaoCodigo: group.qualificacaoCodigo,
      }),
    );
  }
  return results;
}

export interface LineageChainFuncionarioGroupResult {
  funcionarioId: number;
  qualificacaoId: number;
  chained: boolean;
  reason?: 'AMBIGUOUS_DATES' | 'SINGLE_OR_NO_ROW';
  rowsLinked: number;
}

/**
 * Mesmo contrato DETECT → CLASSIFY → PLAN → APPLY (fail-closed em empate de
 * data_conclusao), mas para importadores identificados por
 * (empresa_id, funcionario_id, qualificacao_id) — ex.: importacao-xlsx.ts,
 * que resolve funcionário/tipo por nome e sempre popula funcionario_id.
 */
export async function chainQualificationLineageForFuncionarioGroup(
  db: D1Database,
  params: { empresaId: number; funcionarioId: number; qualificacaoId: number },
): Promise<LineageChainFuncionarioGroupResult> {
  const { empresaId, funcionarioId, qualificacaoId } = params;

  const { results } = await db
    .prepare(
      `SELECT id, data_conclusao, renovacao_de, renovada, status
         FROM qualificacoes_historico
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND qualificacao_id = ?
          AND deleted_at IS NULL
          AND UPPER(COALESCE(status, '')) NOT IN ('PLANEJADA', 'PLANEJADO', 'CANCELADA', 'CANCELADO')
        ORDER BY date(data_conclusao) ASC, id ASC`,
    )
    .bind(empresaId, funcionarioId, qualificacaoId)
    .all<HistoricoRow>();

  const rows = results || [];
  if (rows.length < 2) {
    return { funcionarioId, qualificacaoId, chained: false, reason: 'SINGLE_OR_NO_ROW', rowsLinked: 0 };
  }

  const dates = rows.map((r) => r.data_conclusao);
  if (new Set(dates).size !== dates.length) {
    return { funcionarioId, qualificacaoId, chained: false, reason: 'AMBIGUOUS_DATES', rowsLinked: 0 };
  }

  let rowsLinked = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const predecessor = rows[i - 1];
    const successor = rows[i];

    if (successor.renovacao_de !== predecessor.id) {
      await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET renovacao_de = ?, updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(predecessor.id, successor.id, empresaId)
        .run();
      rowsLinked += 1;
    }

    if (!(predecessor.renovada === 1 && String(predecessor.status || '').toUpperCase() === 'RENOVADA')) {
      await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET renovada = 1, status = 'RENOVADA', updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(predecessor.id, empresaId)
        .run();
    }
  }

  return { funcionarioId, qualificacaoId, chained: true, rowsLinked };
}

export async function chainQualificationLineageForFuncionarioGroups(
  db: D1Database,
  empresaId: number,
  groups: Array<{ funcionarioId: number; qualificacaoId: number }>,
): Promise<LineageChainFuncionarioGroupResult[]> {
  const seen = new Set<string>();
  const uniqueGroups = groups.filter((g) => {
    const key = `${g.funcionarioId}|${g.qualificacaoId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results: LineageChainFuncionarioGroupResult[] = [];
  for (const group of uniqueGroups) {
    results.push(await chainQualificationLineageForFuncionarioGroup(db, { empresaId, ...group }));
  }
  return results;
}
