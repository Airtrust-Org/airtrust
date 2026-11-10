/**
 * Reflexo da validade do modelo (qualificacoes_tipos) nos historicos vinculados.
 *
 * O PATCH /qualificacoes/tipos/:id ja recalcula validade_meses/data_vencimento
 * dos historicos na mesma transacao. Os importadores de tipos (planilha XLSX e
 * servico de importacao) alteravam `validade` direto, sem reflexo: Matriz,
 * Ficha 360 e Planejados leem o `data_vencimento` gravado, enquanto o Compliance
 * recalcula a partir do modelo -- as telas passavam a divergir (#1492).
 *
 * Regras conservadoras:
 * - so reflete validade POSITIVA e diferente da anterior (nunca apaga
 *   vencimento por planilha com celula vazia);
 * - so toca validade_meses e data_vencimento de historicos nao deletados,
 *   do mesmo tenant, que nao estejam CANCELADA/PLANEJADA;
 * - nao cria, apaga nem reativa historico.
 */
import {
  buildHistoricoTipoSnapshot,
  type QualificacaoTipoSnapshot,
} from './qualificacoes-tipos-sync';

type TipoRow = {
  id: number;
  codigo: string | null;
  nome: string | null;
  categoria: string | null;
  validade: number | null;
  vencimento_fim_mes: number | null;
  carga_horaria: number | null;
  carga_horaria_inicial: number | null;
  carga_horaria_recorrente: number | null;
};

type HistoricoRow = {
  id: number;
  data_conclusao: string | null;
  data_vencimento: string | null;
  validade_meses: number | null;
  tipo_treinamento: string | null;
  nascimento_funcionario: string | null;
};

export function shouldResyncTipoValidity(
  previousValidade: unknown,
  nextValidade: unknown,
): boolean {
  const next = Number(nextValidade);
  if (!Number.isInteger(next) || next <= 0) return false;
  const previous = Number(previousValidade);
  return !(Number.isInteger(previous) && previous === next);
}

export async function resyncTipoHistoricoValidity(
  db: D1Database,
  empresaId: number,
  tipoId: number,
): Promise<{ updated: number; unchanged: number }> {
  const tipo = await db
    .prepare(
      `SELECT id, codigo, nome, categoria, validade, vencimento_fim_mes, carga_horaria,
              carga_horaria_inicial, carga_horaria_recorrente
         FROM qualificacoes_tipos
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(tipoId, empresaId)
    .first<TipoRow>();
  if (!tipo) return { updated: 0, unchanged: 0 };

  const snapshot: QualificacaoTipoSnapshot = {
    codigo: tipo.codigo,
    nome: tipo.nome,
    categoria: tipo.categoria,
    validade: tipo.validade,
    cargaHoraria: tipo.carga_horaria,
    cargaHorariaInicial: tipo.carga_horaria_inicial,
    cargaHorariaRecorrente: tipo.carga_horaria_recorrente,
  };

  const { results } = await db
    .prepare(
      `SELECT qh.id, qh.data_conclusao, qh.data_vencimento, qh.validade_meses,
              qh.tipo_treinamento, f.nascimento AS nascimento_funcionario
         FROM qualificacoes_historico qh
         LEFT JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
        WHERE qh.empresa_id = ?
          AND qh.qualificacao_id = ?
          AND qh.deleted_at IS NULL
          AND UPPER(COALESCE(qh.status, '')) NOT IN ('CANCELADA', 'CANCELADO', 'PLANEJADA', 'PLANEJADO')`,
    )
    .bind(empresaId, tipoId)
    .all<HistoricoRow>();

  const statements: D1PreparedStatement[] = [];
  let unchanged = 0;
  for (const row of results ?? []) {
    if (!row.data_conclusao) {
      unchanged += 1;
      continue;
    }
    const next = buildHistoricoTipoSnapshot(snapshot, {
      dataConclusao: row.data_conclusao,
      dataVencimentoAtual: row.data_vencimento,
      tipoTreinamento: row.tipo_treinamento,
      nascimentoFuncionario: row.nascimento_funcionario,
    });
    if (
      next.validadeMeses == null ||
      next.dataVencimento == null ||
      (Number(row.validade_meses || 0) === Number(next.validadeMeses) &&
        String(row.data_vencimento || '') === next.dataVencimento)
    ) {
      unchanged += 1;
      continue;
    }
    statements.push(
      db
        .prepare(
          `UPDATE qualificacoes_historico
              SET validade_meses = ?, data_vencimento = ?, updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(next.validadeMeses, next.dataVencimento, row.id, empresaId),
    );
  }

  if (statements.length > 0) await db.batch(statements);
  return { updated: statements.length, unchanged };
}
