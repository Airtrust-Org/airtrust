import type { D1Database } from '@cloudflare/workers-types';

/**
 * Serviço de manutenção: sincroniza os checks de modelos e fichas de sessão.
 *
 * Resolve dois problemas:
 * 1. modelos_sessao_checks vazio — popula a partir dos sessoes_checks existentes
 * 2. sessoes_checks sem resultados em fichas APROVADAS — cria resultados aprovados
 * 3. simulador_agendamentos sem template_id — liga ao modelo pelo tipo_sessao quando possível
 */

export interface BackfillResult {
  modelos_checks_inseridos: number;
  resultados_criados: number;
  agendamentos_linkados: number;
  checks_criados: number;
  erros: string[];
}

/**
 * Passo 1: Detecta quais qualificacao_tipo_id cada modelo usa nas suas sessões.
 * Insere em modelos_sessao_checks os que ainda não estão lá.
 */
async function sincronizarModelosSessaoChecks(
  db: D1Database,
  empresaId: number,
): Promise<{ inseridos: number; erros: string[] }> {
  const erros: string[] = [];

  // Agrupa os sessoes_checks por template_id do agendamento
  const checksExistentes = await db
    .prepare(
      `SELECT DISTINCT sa.template_id AS modelo_id, sc.qualificacao_tipo_id
       FROM sessoes_checks sc
       JOIN simulador_agendamentos sa ON sa.id = sc.sessao_id AND sa.deleted_at IS NULL
       JOIN modelos_sessao ms ON ms.id = sa.template_id AND ms.deleted_at IS NULL
       WHERE sc.deleted_at IS NULL
         AND sc.qualificacao_tipo_id IS NOT NULL
         AND sa.template_id IS NOT NULL
         AND sa.empresa_id = ?
         AND ms.empresa_id = ?`,
    )
    .bind(empresaId, empresaId)
    .all<{ modelo_id: number; qualificacao_tipo_id: number }>();

  let inseridos = 0;
  const stmts = [];

  for (const row of checksExistentes.results || []) {
    // Verifica se já existe
    const existe = await db
      .prepare(
        `SELECT msc.id
         FROM modelos_sessao_checks msc
         JOIN modelos_sessao ms ON ms.id = msc.modelo_id AND ms.deleted_at IS NULL
         WHERE msc.modelo_id = ?
           AND msc.qualificacao_tipo_id = ?
           AND msc.deleted_at IS NULL
           AND ms.empresa_id = ?`,
      )
      .bind(row.modelo_id, row.qualificacao_tipo_id, empresaId)
      .first<{ id: number }>();

    if (!existe) {
      stmts.push(
        db.prepare(
          `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id, created_at, updated_at)
           VALUES (?, ?, datetime('now'), datetime('now'))`,
        ).bind(row.modelo_id, row.qualificacao_tipo_id),
      );
      inseridos++;
    }
  }

  if (stmts.length > 0) {
    try {
      // Processa em lotes de 50
      for (let i = 0; i < stmts.length; i += 50) {
        await db.batch(stmts.slice(i, i + 50));
      }
    } catch (e) {
      erros.push(`Erro ao inserir modelos_sessao_checks: ${(e as Error).message}`);
    }
  }

  return { inseridos, erros };
}

/**
 * Passo 2: Para agendamentos sem template_id, tenta linkar ao modelo pelo tipo_sessao
 * (apenas quando há correspondência única e inequívoca).
 */
async function linkarAgendamentosSemModelo(
  db: D1Database,
  empresaId: number,
): Promise<{ linkados: number; checksCriados: number; erros: string[] }> {
  const erros: string[] = [];
  let linkados = 0;
  let checksCriados = 0;

  // Agendamentos com fichas APROVADAS mas sem template_id
  const agendamentos = await db
    .prepare(
      `SELECT DISTINCT sa.id, f.tipo_sessao
       FROM simulador_agendamentos sa
       JOIN fichas_sessao f ON f.agendamento_slot_id = sa.id AND f.deleted_at IS NULL
       WHERE sa.template_id IS NULL
         AND sa.deleted_at IS NULL
         AND sa.empresa_id = ?
         AND f.empresa_id = ?
         AND f.status IN ('APROVADO', 'CONCLUIDA')
         AND f.aprovado = 1
       LIMIT 200`,
    )
    .bind(empresaId, empresaId)
    .all<{ id: number; tipo_sessao: string }>();

  for (const agend of agendamentos.results || []) {
    try {
      // Busca modelo correspondente pelo codigo == tipo_sessao (match exato e único)
      const modelo = await db
        .prepare(
          `SELECT id FROM modelos_sessao
           WHERE codigo = ? AND empresa_id = ? AND deleted_at IS NULL
           LIMIT 2`,
        )
        .bind(agend.tipo_sessao, empresaId)
        .all<{ id: number }>();

      if ((modelo.results || []).length !== 1) {
        // Ambíguo ou inexistente — pula, requer intervenção manual
        continue;
      }

      const modeloId = modelo.results[0].id;

      // Linka o agendamento ao modelo
      await db
        .prepare(
          `UPDATE simulador_agendamentos
           SET template_id = ?, updated_at = datetime('now')
           WHERE id = ? AND empresa_id = ?`,
        )
        .bind(modeloId, agend.id, empresaId)
        .run();
      linkados++;

      // Cria sessoes_checks a partir do modelos_sessao_checks
      const modeloChecks = await db
        .prepare(
          `SELECT msc.qualificacao_tipo_id
           FROM modelos_sessao_checks msc
           JOIN modelos_sessao ms ON ms.id = msc.modelo_id AND ms.deleted_at IS NULL
           WHERE msc.modelo_id = ?
             AND msc.deleted_at IS NULL
             AND ms.empresa_id = ?`,
        )
        .bind(modeloId, empresaId)
        .all<{ qualificacao_tipo_id: number }>();

      for (const mc of modeloChecks.results || []) {
        const jaExiste = await db
          .prepare(
            `SELECT sc.id
             FROM sessoes_checks sc
             JOIN simulador_agendamentos sa ON sa.id = sc.sessao_id AND sa.deleted_at IS NULL
             WHERE sc.sessao_id = ?
               AND sc.qualificacao_tipo_id = ?
               AND sc.deleted_at IS NULL
               AND sa.empresa_id = ?`,
          )
          .bind(agend.id, mc.qualificacao_tipo_id, empresaId)
          .first<{ id: number }>();

        if (!jaExiste) {
          await db
            .prepare(
              `INSERT INTO sessoes_checks (sessao_id, qualificacao_tipo_id, created_at, updated_at)
               VALUES (?, ?, datetime('now'), datetime('now'))`,
            )
            .bind(agend.id, mc.qualificacao_tipo_id)
            .run();
          checksCriados++;
        }
      }
    } catch (e) {
      erros.push(`Agendamento ${agend.id}: ${(e as Error).message}`);
    }
  }

  return { linkados, checksCriados: checksCriados, erros };
}

/**
 * Passo 3: Para fichas APROVADAS cujos sessoes_checks existem mas não têm resultados,
 * cria sessoes_checks_resultados com aprovado=1.
 * NÃO sobrescreve resultados existentes (aprovados ou reprovados).
 */
async function criarResultadosParaFichasAprovadas(
  db: D1Database,
  empresaId: number,
): Promise<{ criados: number; erros: string[] }> {
  const erros: string[] = [];
  let criados = 0;

  // Checks sem nenhum resultado em sessões de fichas aprovadas
  const checksSemResultado = await db
    .prepare(
      `SELECT DISTINCT sc.id as check_id
       FROM sessoes_checks sc
       JOIN simulador_agendamentos sa ON sa.id = sc.sessao_id AND sa.deleted_at IS NULL
       JOIN fichas_sessao f ON f.agendamento_slot_id = sa.id
         AND f.deleted_at IS NULL
         AND f.status IN ('APROVADO', 'CONCLUIDA')
         AND f.aprovado = 1
       WHERE sc.deleted_at IS NULL
         AND sc.qualificacao_tipo_id IS NOT NULL
         AND sa.empresa_id = ?
         AND f.empresa_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM sessoes_checks_resultados scr
           WHERE scr.sessao_check_id = sc.id AND scr.deleted_at IS NULL
         )
       LIMIT 500`,
    )
    .bind(empresaId, empresaId)
    .all<{ check_id: number }>();

  const insertStmts = (checksSemResultado.results || []).map((row) =>
    db
      .prepare(
        `INSERT INTO sessoes_checks_resultados
         (sessao_check_id, aprovado, observacoes, created_at, updated_at)
         VALUES (?, 1, 'Resultado backfill — ficha aprovada sem resultado individual registrado', datetime('now'), datetime('now'))`,
      )
      .bind(row.check_id),
  );

  if (insertStmts.length > 0) {
    try {
      for (let i = 0; i < insertStmts.length; i += 50) {
        await db.batch(insertStmts.slice(i, i + 50));
      }
      criados = insertStmts.length;
    } catch (e) {
      erros.push(`Erro ao criar resultados: ${(e as Error).message}`);
    }
  }

  return { criados, erros };
}

/**
 * Executa o backfill completo.
 * Ordem: 1→ sincroniza modelos_sessao_checks, 2→ linka agendamentos, 3→ cria resultados.
 */
export async function backfillSessionChecks(db: D1Database, empresaId: number): Promise<BackfillResult> {
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    throw new Error('tenant_scope_required');
  }

  const erros: string[] = [];

  const passo1 = await sincronizarModelosSessaoChecks(db, empresaId);
  erros.push(...passo1.erros);

  const passo2 = await linkarAgendamentosSemModelo(db, empresaId);
  erros.push(...passo2.erros);

  const passo3 = await criarResultadosParaFichasAprovadas(db, empresaId);
  erros.push(...passo3.erros);

  return {
    modelos_checks_inseridos: passo1.inseridos,
    agendamentos_linkados: passo2.linkados,
    checks_criados: passo2.checksCriados,
    resultados_criados: passo3.criados,
    erros,
  };
}
