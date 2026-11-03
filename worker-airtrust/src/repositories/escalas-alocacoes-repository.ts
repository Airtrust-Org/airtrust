/**
 * ESCALAS — acesso a dados de alocações individuais (PUT/DELETE /:id/alocacoes/:aid).
 *
 * Só SQL. As mutações levam o EXISTS de tenant (escalas_mensais.empresa_id); a escala já foi
 * verificada pelo chamador, então o filtro não altera o resultado — apenas amarra o tenant na query.
 */

import type { FuncaoAlocacao } from '../services/escalas/alocacao-schemas';

export interface AlocacaoAtualRow {
  id: string;
  funcionario_id: string;
  aeronave_id: number | null;
  funcao: FuncaoAlocacao;
  quinzena_id: number | null;
  data_inicio: string;
  data_fim: string;
  status: string;
}

export interface AlocacaoParaRemocaoRow {
  id: string;
  aeronave_id: number | null;
  funcionario_id: string;
  funcao: string;
  quinzena_id: number | null;
  auto_gerado: number | null;
}

export interface AlocacaoConflitanteRow {
  id: string;
  escala_id: string;
  aeronave_id: number | null;
  funcionario_id: string;
  quinzena_id: number | null;
  mes: number;
  ano: number;
  situacao_tipo: string | null;
}

const EXISTS_ESCALA_DO_TENANT = `EXISTS (
            SELECT 1
              FROM escalas_mensais em
             WHERE em.empresa_id = ?
               AND em.id = escala_alocacoes.escala_id
               AND em.deleted_at IS NULL
          )`;

export async function findAlocacaoDaEscala(
  db: D1Database,
  alocacaoId: string,
  escalaId: string,
): Promise<AlocacaoAtualRow | null> {
  return db
    .prepare(
      `SELECT * FROM escala_alocacoes WHERE id = ? AND escala_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(alocacaoId, escalaId)
    .first<AlocacaoAtualRow>();
}

export async function findAlocacaoParaRemocao(
  db: D1Database,
  alocacaoId: string,
  escalaId: string,
): Promise<AlocacaoParaRemocaoRow | null> {
  return db
    .prepare(
      `SELECT id, aeronave_id, funcionario_id, funcao, quinzena_id, auto_gerado FROM escala_alocacoes
          WHERE id = ? AND escala_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(alocacaoId, escalaId)
    .first<AlocacaoParaRemocaoRow>();
}

export async function existeFuncionarioAtivo(
  db: D1Database,
  funcionarioId: string,
  empresaId: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT id FROM funcionarios
            WHERE id = ?
              AND deleted_at IS NULL
              AND COALESCE(ativo, 1) = 1
              AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
              AND empresa_id = ?
            LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<{ id: string }>();
  return Boolean(row);
}

/** Funcionário que ocupa a função oposta (PIC↔SIC) da mesma aeronave com período sobreposto. */
export async function findParceiroDoSlot(
  db: D1Database,
  input: {
    escalaId: string;
    aeronaveId: number;
    funcaoOposta: string;
    alocacaoId: string;
    dataInicio: string;
    dataFim: string;
  },
): Promise<{ funcionario_id: string } | null> {
  return db
    .prepare(
      `SELECT ea.funcionario_id FROM escala_alocacoes ea
                WHERE ea.escala_id = ? AND ea.aeronave_id = ? AND ea.funcao = ?
                  AND ea.deleted_at IS NULL AND ea.status != 'cancelado'
                  AND ea.id != ?
                  AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
                LIMIT 1`,
    )
    .bind(
      input.escalaId,
      input.aeronaveId,
      input.funcaoOposta,
      input.alocacaoId,
      input.dataInicio,
      input.dataFim,
    )
    .first<{ funcionario_id: string }>();
}

export async function existeRestricaoNaoPodeVoarJunto(
  db: D1Database,
  funcionarioA: string,
  funcionarioB: string,
  dataInicio: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT id FROM restricoes_tripulacao
                  WHERE ((funcionario_a_id = ? AND funcionario_b_id = ?)
                      OR (funcionario_a_id = ? AND funcionario_b_id = ?))
                    AND tipo_restricao = 'nao_pode_voar_junto'
                    AND ativo = 1 AND deleted_at IS NULL
                    AND (data_fim IS NULL OR data_fim >= ?)
                  LIMIT 1`,
    )
    .bind(funcionarioA, funcionarioB, funcionarioB, funcionarioA, dataInicio)
    .first();
  return Boolean(row);
}

/** `campos` são fragmentos fixos do código (`coluna = ?`), nunca entrada do usuário. */
export async function updateAlocacaoCampos(
  db: D1Database,
  input: {
    escalaId: string;
    alocacaoId: string;
    empresaId: number;
    campos: string[];
    valores: unknown[];
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE escala_alocacoes SET ${input.campos.join(', ')} WHERE id = ? AND escala_id = ? AND ${EXISTS_ESCALA_DO_TENANT}`,
    )
    .bind(...input.valores, input.alocacaoId, input.escalaId, input.empresaId)
    .run();
}

export async function softDeleteAlocacao(
  db: D1Database,
  input: { alocacaoId: string; escalaId: string; empresaId: number },
): Promise<void> {
  await db
    .prepare(
      `UPDATE escala_alocacoes
            SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
            AND escala_id = ?
            AND ${EXISTS_ESCALA_DO_TENANT}`,
    )
    .bind(input.alocacaoId, input.escalaId, input.empresaId)
    .run();
}

/** Apaga (soft) os eventos auto-gerados da alocação; devolve quantos foram. */
export async function softDeleteEventosAutomaticosDaAlocacao(
  db: D1Database,
  alocacaoId: string,
  empresaId: number,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE escala_eventos
            SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE alocacao_id = ?
            AND gerado_automaticamente = 1
            AND deleted_at IS NULL
            AND EXISTS (
              SELECT 1
                FROM escala_alocacoes ea
                JOIN escalas_mensais em ON em.id = ea.escala_id
               WHERE ea.id = escala_eventos.alocacao_id
                 AND em.empresa_id = ?
                 AND em.deleted_at IS NULL
            )`,
    )
    .bind(alocacaoId, empresaId)
    .run();
  return result.meta?.changes ?? 0;
}

// ── Substituição de alocação em conflito (conflito_override) ─────────────────

export async function findAlocacaoConflitanteDoTenant(
  db: D1Database,
  conflitoId: string,
  empresaId: number,
): Promise<AlocacaoConflitanteRow | null> {
  return db
    .prepare(
      `SELECT
         ea.id,
         CAST(ea.escala_id AS TEXT) AS escala_id,
         ea.aeronave_id,
         CAST(ea.funcionario_id AS TEXT) AS funcionario_id,
         ea.quinzena_id,
         ea.situacao_tipo,
         em.mes,
         em.ano
       FROM escala_alocacoes ea
       JOIN escalas_mensais em ON em.id = ea.escala_id AND em.deleted_at IS NULL
       WHERE ea.id = ?
         AND em.empresa_id = ?
         AND ea.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(conflitoId, empresaId)
    .first<AlocacaoConflitanteRow>();
}

export async function softDeleteAlocacaoConflitante(
  db: D1Database,
  input: { id: string; empresaId: number; now: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE escala_alocacoes
          SET deleted_at = ?, updated_at = ?
        WHERE id = ?
          AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1
              FROM escalas_mensais em
             WHERE em.id = escala_alocacoes.escala_id
               AND em.deleted_at IS NULL
               AND em.empresa_id = ?
          )`,
    )
    .bind(input.now, input.now, input.id, input.empresaId)
    .run();
}

/**
 * Atenção (comportamento herdado, fixado por teste): o EXISTS exige `ea.deleted_at IS NULL`, mas a
 * alocação já foi apagada pelo comando anterior — então esta query não casa nenhum evento.
 */
export async function softDeleteEventosAutomaticosDoConflito(
  db: D1Database,
  input: { alocacaoId: string; empresaId: number; now: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE escala_eventos
          SET deleted_at = ?, updated_at = ?
        WHERE alocacao_id = ?
          AND gerado_automaticamente = 1
          AND EXISTS (
            SELECT 1
              FROM escala_alocacoes ea
              JOIN escalas_mensais em ON em.id = ea.escala_id
             WHERE ea.id = escala_eventos.alocacao_id
               AND ea.deleted_at IS NULL
               AND em.deleted_at IS NULL
               AND em.empresa_id = ?
          )
          AND deleted_at IS NULL`,
    )
    .bind(input.now, input.now, input.alocacaoId, input.empresaId)
    .run();
}
