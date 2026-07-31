/**
 * lms-completion.ts — serviço canônico de conclusão de matrícula LMS.
 *
 * Ponto único usado por SCORM commit, xAPI statements, POST /:id/finalizar e
 * PATCH /:id/status para persistir uma conclusão. Toda a escrita final
 * (Histórico, vínculo, vínculo reverso, ciclo, renovação, matrícula,
 * auditoria) é montada como um único array de statements e executada via
 * `db.batch()` — D1 executa um batch sequencialmente dentro de UMA transação
 * e reverte tudo se qualquer statement falhar (inclusive uma UNIQUE
 * constraint), então não existe estado parcial: ou a conclusão inteira
 * aconteceu, ou nenhuma parte dela aconteceu.
 *
 * Por que não `last_insert_rowid()` entre statements separados: dentro de um
 * único batch, os statements já vêm bound com valores concretos antes da
 * execução — não há como usar o id retornado por um INSERT em um statement
 * posterior do MESMO batch. Em vez disso, o Histórico novo é localizado via
 * subquery determinística (funcionario_id + qualificacao_codigo +
 * data_conclusao, que é exatamente a UNIQUE constraint
 * idx_qualificacoes_historico_unique_active definida na migration 0336 como
 * UNIQUE(funcionario_id, qualificacao_codigo, data_conclusao)). A ausência de
 * empresa_id nessa constraint é segura porque funcionario_id é globalmente
 * único entre todos os tenants (PK da tabela funcionarios, sem reuso
 * cross-tenant).
 *
 * Corrida entre requisições concorrentes: a leitura de "Histórico já existe?"
 * acontece ANTES do batch. Duas requisições concorrentes podem ambas decidir
 * "preciso inserir" e uma delas colide na UNIQUE constraint — o batch INTEIRO
 * dessa requisição é revertido pelo D1 (nenhuma matrícula marcada CONCLUIDO,
 * nenhum vínculo, nenhuma auditoria de sucesso). completeLmsMatricula detecta
 * essa colisão esperada e tenta novamente UMA vez como reuso do Histórico que
 * a outra requisição acabou de criar.
 *
 * Matriz de configuração (issue #548):
 *   gerarQualificacaoAoConcluir=false → qualification_not_required (OK)
 *   gerarQualificacaoAoConcluir=true + qualificacaoTipoId válido → gera/reusa
 *   gerarQualificacaoAoConcluir=true + qualificacaoTipoId=null → REJEITA
 *     (LMS_QUALIFICATION_MAPPING_INVALID, 422) — nunca trata como not_required
 */
import type { VencimentoMode } from '../utils/qualificacoes-expiration';
import { calcularDataVencimento } from '../utils/qualificacoes-expiration';

export type LmsCompletionOutcome =
  | 'qualification_created'
  | 'qualification_reused'
  | 'qualification_not_required'
  | 'qualification_failed';

export interface LmsCompletionResult {
  outcome: LmsCompletionOutcome;
  qualificacaoHistoricoId: number | null;
  matriculaId: number;
}

export class LmsCompletionRejectedError extends Error {
  readonly code: string;
  constructor(
    message: string,
    code = 'LMS_QUALIFICATION_COMPLETION_FAILED',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LmsCompletionRejectedError';
    this.code = code;
  }
}

export interface CompleteLmsMatriculaParams {
  db: D1Database;
  empresaId: number;
  matriculaId: number;
  funcionarioId: number;
  cursoId?: number | null;
  cursoTitulo: string;
  gerarQualificacaoAoConcluir: boolean;
  qualificacaoTipoId: number | null;
  qualificacaoCodigo: string | null;
  qualificacaoNome: string | null;
  qualificacaoCategoria: string | null;
  /** Canonical category row, resolved from the tenant-scoped qualification type. */
  qualificacaoCategoriaId?: number | null;
  validade: number | null;
  vencimentoFimMes?: VencimentoMode | null;
  dataConclusao: string;
  existingHistoricoId?: number | null;
  progressoPct?: number;
  scoreFinal?: number | null;
  action: string;
  actorUserId?: number;
  ipAddress?: string;
  userAgent?: string;
}

function isConcurrentQualificationUniqueConstraint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return (
    message.includes('UNIQUE constraint failed') &&
    message.includes('qualificacoes_historico.funcionario_id') &&
    message.includes('qualificacoes_historico.data_conclusao')
  );
}

interface PreBatchState {
  existingHistoricoId: number | null;
  anteriorAtivaId: number | null;
  anteriorAtivaObservacoes: string | null;
  currentCycleId: number | null;
  nextNumeroCiclo: number;
}

function isEadCategory(value: string | null | undefined): boolean {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  return normalized === 'EAD' || normalized === 'TREINAMENTO EAD';
}

/**
 * Resolves the category from the persisted qualification type, never from a
 * course payload. EAD is intentionally fail-closed: a completion cannot
 * create or reuse a history until it is tied to active category 13 in tenant 6.
 */
async function resolveCompletionCategory(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number,
): Promise<{ id: number | null; nome: string | null }> {
  const row = await db
    .prepare(
      `SELECT qt.categoria AS tipo_categoria,
              qc.id AS categoria_id,
              qc.nome AS categoria_nome,
              qc.empresa_id AS categoria_empresa_id,
              qc.ativo AS categoria_ativo,
              qc.deleted_at AS categoria_deleted_at
         FROM qualificacoes_tipos qt
         LEFT JOIN qualificacoes_categorias qc
           ON qc.id = qt.categoria_id
          AND qc.empresa_id = qt.empresa_id
          AND qc.deleted_at IS NULL
         WHERE qt.id = ?
           AND qt.empresa_id = ?
           AND qt.deleted_at IS NULL
         LIMIT 1`,
    )
    .bind(qualificacaoTipoId, empresaId)
    .first<{
      tipo_categoria: string | null;
      categoria_id: number | null;
      categoria_nome: string | null;
      categoria_empresa_id: number | null;
      categoria_ativo: number | null;
      categoria_deleted_at: string | null;
    }>();

  if (!row) {
    throw new LmsCompletionRejectedError(
      'Tipo de qualificação não pertence à empresa da matrícula',
      'LMS_QUALIFICATION_MAPPING_INVALID',
    );
  }

  if (!isEadCategory(row.tipo_categoria)) {
    return { id: row.categoria_id ?? null, nome: row.categoria_nome ?? row.tipo_categoria ?? null };
  }

  const isCanonicalEad =
    empresaId === 6 &&
    row.categoria_id === 13 &&
    row.categoria_empresa_id === 6 &&
    row.categoria_deleted_at === null &&
    row.categoria_ativo === 1 &&
    String(row.categoria_nome ?? '')
      .trim()
      .toUpperCase() === 'EAD';
  if (!isCanonicalEad) {
    throw new LmsCompletionRejectedError(
      'Tipo EAD sem vínculo à categoria EAD canônica ativa da empresa',
      'LMS_EAD_CATEGORY_MAPPING_INVALID',
    );
  }

  return { id: 13, nome: 'EAD' };
}

/**
 * Valida um existingHistoricoId recebido do chamador. Se o ID fornecida
 * existir, pertencer ao mesmo tenant/funcionario/codigo/data e não estiver
 * soft-deleted, retorna o ID confirmado. Caso contrário, retorna null (o
 * chamador deve então procurar deterministicamente ou inserir novo).
 */
async function validateExistingHistoricoId(
  db: D1Database,
  id: number,
  empresaId: number,
  funcionarioId: number,
  qualificacaoCodigo: string,
  dataConclusao: string,
): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT id FROM qualificacoes_historico
        WHERE id = ?
          AND empresa_id = ?
          AND funcionario_id = ?
          AND qualificacao_codigo = ?
          AND data_conclusao = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(id, empresaId, funcionarioId, qualificacaoCodigo, dataConclusao)
    .first<{ id: number }>();
  return row?.id ?? null;
}

async function readPreBatchState(
  db: D1Database,
  params: CompleteLmsMatriculaParams,
  qualificacaoCodigo: string,
): Promise<PreBatchState> {
  // existingHistoricoId é apenas uma pista — validar antes de confiar.
  let validatedHistoricoId: number | null = null;
  if (params.existingHistoricoId) {
    validatedHistoricoId = await validateExistingHistoricoId(
      db,
      params.existingHistoricoId,
      params.empresaId,
      params.funcionarioId,
      qualificacaoCodigo,
      params.dataConclusao,
    );
  }

  // Se o ID fornecido não for válido (ou não foi fornecido), busca
  // determinística pela chave da UNIQUE constraint.
  const existingHistorico =
    validatedHistoricoId ??
    (
      await db
        .prepare(
          `SELECT id
             FROM qualificacoes_historico
            WHERE empresa_id = ?
              AND funcionario_id = ?
              AND qualificacao_codigo = ?
              AND data_conclusao = ?
              AND deleted_at IS NULL
            ORDER BY id DESC
            LIMIT 1`,
        )
        .bind(params.empresaId, params.funcionarioId, qualificacaoCodigo, params.dataConclusao)
        .first<{ id: number }>()
    )?.id ??
    null;

  const anteriorAtiva = existingHistorico
    ? null
    : await db
        .prepare(
          `SELECT id, observacoes
             FROM qualificacoes_historico
            WHERE empresa_id = ?
              AND funcionario_id = ?
              AND qualificacao_codigo = ?
              AND COALESCE(renovada, 0) = 0
              AND COALESCE(data_conclusao, '') <> ?
              AND deleted_at IS NULL
            ORDER BY data_vencimento DESC, id DESC
            LIMIT 1`,
        )
        .bind(params.empresaId, params.funcionarioId, qualificacaoCodigo, params.dataConclusao)
        .first<{ id: number; observacoes: string | null }>();

  const currentCycle = await db
    .prepare(
      `SELECT id
         FROM lms_matricula_ciclos
        WHERE matricula_id = ?
          AND empresa_id = ?
          AND ciclo_atual = 1
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(params.matriculaId, params.empresaId)
    .first<{ id: number }>();

  const maxCiclo = await db
    .prepare(
      `SELECT COALESCE(MAX(numero_ciclo), 0) AS max_numero
         FROM lms_matricula_ciclos
        WHERE matricula_id = ?
          AND empresa_id = ?`,
    )
    .bind(params.matriculaId, params.empresaId)
    .first<{ max_numero: number | null }>();

  return {
    existingHistoricoId: existingHistorico,
    anteriorAtivaId: anteriorAtiva?.id ?? null,
    anteriorAtivaObservacoes: anteriorAtiva?.observacoes ?? null,
    currentCycleId: currentCycle?.id ?? null,
    nextNumeroCiclo: Number(maxCiclo?.max_numero ?? 0) + 1,
  };
}

function appendObservacaoIfMissing(observacoes: string | null | undefined, marker: string): string {
  const base = (observacoes ?? '').trim();
  if (!base) return marker;
  if (base.includes(marker)) return base;
  return `${base}\n${marker}`;
}

/**
 * Monta o array de statements do batch. Função pura sobre o estado
 * pré-lido — não faz I/O. Reaproveitada 1:1 pelos testes de rollback (SQL
 * literal executado contra SQLite real) e pela execução real via D1.
 */
export function buildCompletionBatchStatements(
  params: CompleteLmsMatriculaParams,
  pre: PreBatchState,
): { sql: string; args: unknown[] }[] {
  const qualificacaoCodigo = params.qualificacaoCodigo ?? params.qualificacaoNome ?? '';
  const qualificacaoCategoriaId = params.qualificacaoCategoriaId ?? null;
  const statements: { sql: string; args: unknown[] }[] = [];
  const needsInsert = !pre.existingHistoricoId;

  if (needsInsert) {
    const validadeMeses =
      typeof params.validade === 'number' && params.validade > 0 ? params.validade : null;
    const vencimentoFimMes = (params.vencimentoFimMes ?? 0) === 1 ? 1 : 0;
    const dataVencimento =
      validadeMeses != null
        ? calcularDataVencimento(params.dataConclusao, validadeMeses, vencimentoFimMes)
        : null;
    const observacoes = `Origem: LMS | Gerado automaticamente ao concluir: ${params.cursoTitulo}`;

    statements.push({
      sql: `INSERT INTO qualificacoes_historico (
              funcionario_id, qualificacao_id, qualificacao_codigo, tipo_codigo, codigo,
              categoria_id, categoria, data_conclusao, data_vencimento, validade_meses, observacoes,
              empresa_id, tipo, status, renovacao_de, lms_matricula_id, origem_tipo,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LMS', datetime('now'), datetime('now'))`,
      args: [
        params.funcionarioId,
        params.qualificacaoTipoId,
        qualificacaoCodigo,
        'TREINAMENTO',
        qualificacaoCodigo,
        qualificacaoCategoriaId,
        params.qualificacaoCategoria ?? 'TREINAMENTO',
        params.dataConclusao,
        dataVencimento,
        validadeMeses,
        observacoes,
        params.empresaId,
        'LMS',
        'CONCLUIDA',
        pre.anteriorAtivaId,
        params.matriculaId,
      ],
    });
  }

  // Subquery determinística — nunca last_insert_rowid(). Identifica o
  // Histórico (existente OU recém-inserido no MESMO batch) pela mesma chave
  // da UNIQUE constraint: funcionario_id + qualificacao_codigo +
  // data_conclusao (migration 0336). empresa_id é incluído como cláusula
  // adicional de segurança de tenant (funcionario_id é globalmente único,
  // mas manter empresa_id na subquery não custa e reforça o isolamento).
  const historicoIdSubquery = `(
    SELECT id FROM qualificacoes_historico
     WHERE empresa_id = ? AND funcionario_id = ? AND qualificacao_codigo = ? AND data_conclusao = ?
       AND deleted_at IS NULL
     ORDER BY id DESC LIMIT 1
  )`;
  const historicoIdArgs = [
    params.empresaId,
    params.funcionarioId,
    qualificacaoCodigo,
    params.dataConclusao,
  ];

  // Renovação do Histórico anterior — só quando esta requisição de fato
  // inseriu o novo Histórico (needsInsert); se estamos reusando um Histórico
  // já existente (idempotência/retry), a renovação já ocorreu na primeira
  // execução e não deve repetir.
  if (needsInsert && pre.anteriorAtivaId) {
    statements.push({
      sql: `UPDATE qualificacoes_historico
               SET renovada = 1, status = 'RENOVADA', updated_at = datetime('now'), observacoes = ?
             WHERE id = ? AND empresa_id = ? AND funcionario_id = ?`,
      args: [
        appendObservacaoIfMissing(
          pre.anteriorAtivaObservacoes,
          `Renovada via LMS matrícula #${params.matriculaId}`,
        ),
        pre.anteriorAtivaId,
        params.empresaId,
        params.funcionarioId,
      ],
    });
  }

  // This also repairs the target when a completion retries against a history
  // created by an older bundle. The type/category lookup above makes EAD's
  // category 13 a transaction precondition, rather than a display fallback.
  if (qualificacaoCategoriaId !== null) {
    statements.push({
      sql: `UPDATE qualificacoes_historico
               SET categoria_id = ?, categoria = ?, updated_at = datetime('now')
             WHERE id = ${historicoIdSubquery} AND empresa_id = ? AND deleted_at IS NULL`,
      args: [
        qualificacaoCategoriaId,
        params.qualificacaoCategoria ?? 'TREINAMENTO',
        ...historicoIdArgs,
        params.empresaId,
      ],
    });
  }

  const progressoPct = params.progressoPct ?? 100;

  statements.push({
    sql: `UPDATE lms_matriculas
             SET status = 'CONCLUIDO',
                 progresso_pct = MAX(COALESCE(progresso_pct, 0), ?),
                 data_inicio = COALESCE(data_inicio, datetime('now')),
                 data_conclusao = COALESCE(data_conclusao, ?),
                 qualificacao_historico_id = ${historicoIdSubquery},
                 score_final = CASE WHEN ? IS NULL THEN score_final ELSE ? END,
                 updated_at = datetime('now')
           WHERE id = ? AND empresa_id = ? AND funcionario_id = ?`,
    args: [
      progressoPct,
      params.dataConclusao,
      ...historicoIdArgs,
      params.scoreFinal ?? null,
      params.scoreFinal ?? null,
      params.matriculaId,
      params.empresaId,
      params.funcionarioId,
    ],
  });

  const cycleIdSubquery = `(
    SELECT id FROM lms_matricula_ciclos
     WHERE matricula_id = ? AND empresa_id = ? AND ciclo_atual = 1 AND deleted_at IS NULL
     ORDER BY id DESC LIMIT 1
  )`;
  const cycleIdArgs = [params.matriculaId, params.empresaId];
  const cursoIdForCycle = params.cursoId ?? null;

  if (pre.currentCycleId) {
    statements.push({
      sql: `UPDATE lms_matricula_ciclos
               SET status = 'CONCLUIDO',
                   data_conclusao = ?,
                   progresso_pct = MAX(COALESCE(progresso_pct, 0), ?),
                   qualificacao_historico_id = ${historicoIdSubquery},
                   updated_at = datetime('now')
             WHERE id = ? AND empresa_id = ? AND matricula_id = ?`,
      args: [
        params.dataConclusao,
        progressoPct,
        ...historicoIdArgs,
        pre.currentCycleId,
        params.empresaId,
        params.matriculaId,
      ],
    });
  } else {
    statements.push({
      sql: `INSERT INTO lms_matricula_ciclos (
              empresa_id, matricula_id, curso_id, funcionario_id, numero_ciclo, origem,
              status, ciclo_atual, data_conclusao, progresso_pct, qualificacao_historico_id,
              created_at, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, 'LMS', 'CONCLUIDO', 1, ?, ?, ${historicoIdSubquery}, datetime('now'), datetime('now'), NULL)`,
      args: [
        params.empresaId,
        params.matriculaId,
        cursoIdForCycle,
        params.funcionarioId,
        pre.nextNumeroCiclo,
        params.dataConclusao,
        progressoPct,
        ...historicoIdArgs,
      ],
    });
  }

  statements.push({
    sql: `UPDATE qualificacoes_historico
             SET lms_matricula_ciclo_id = ${cycleIdSubquery}, updated_at = datetime('now')
           WHERE id = ${historicoIdSubquery} AND empresa_id = ? AND deleted_at IS NULL`,
    args: [...cycleIdArgs, ...historicoIdArgs, params.empresaId],
  });

  // Auditoria durável NO MESMO BATCH — nunca um logAudit() best-effort
  // separado. Se este INSERT falhar, o batch inteiro reverte junto com o
  // resto: nunca existe conclusão confirmada sem trilha de auditoria.
  // Inclui empresa_id conforme schema de audit_logs.
  statements.push({
    sql: `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, empresa_id, created_at)
          VALUES (?, ?, 'lms_matriculas', ?, NULL, ?, ?, ?, ?, datetime('now'))`,
    args: [
      params.actorUserId ?? null,
      params.action,
      params.matriculaId,
      JSON.stringify({
        status: 'CONCLUIDO',
        progresso_pct: progressoPct,
        data_conclusao: params.dataConclusao,
        qualificacao_codigo: qualificacaoCodigo || null,
        outcome: needsInsert ? 'qualification_created' : 'qualification_reused',
        qualificacao_historico_id: pre.existingHistoricoId,
      }),
      params.ipAddress ?? null,
      params.userAgent ?? null,
      params.empresaId,
    ],
  });

  return statements;
}

async function logRejectionAudit(
  db: D1Database,
  params: CompleteLmsMatriculaParams,
  reason: string,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, empresa_id, created_at)
         VALUES (?, 'LMS_QUALIFICATION_COMPLETION_FAILED', 'lms_matriculas', ?, NULL, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        params.actorUserId ?? null,
        params.matriculaId,
        JSON.stringify({ reason, origin: params.action }),
        params.ipAddress ?? null,
        params.userAgent ?? null,
        params.empresaId,
      )
      .run();
  } catch (auditErr) {
    // A falha ao auditar a REJEIÇÃO não deve mascarar a rejeição em si.
    // Emitir log estruturado sanitizado para preservar a trilha.
    console.error(
      JSON.stringify({
        event: 'LMS_REJECTION_AUDIT_FAILED',
        matricula_id: params.matriculaId,
        empresa_id: params.empresaId,
        reason: reason,
        action: params.action,
        audit_error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      }),
    );
  }
}

export async function completeLmsMatricula(
  params: CompleteLmsMatriculaParams,
): Promise<LmsCompletionResult> {
  const { db } = params;

  // ── Matriz de configuração (issue #548) ─────────────────────────────────
  // Caso A: curso não exige qualificação.
  if (!params.gerarQualificacaoAoConcluir) {
    const pre: PreBatchState = {
      existingHistoricoId: null,
      anteriorAtivaId: null,
      anteriorAtivaObservacoes: null,
      currentCycleId:
        (
          await db
            .prepare(
              `SELECT id FROM lms_matricula_ciclos
              WHERE matricula_id = ? AND empresa_id = ? AND ciclo_atual = 1 AND deleted_at IS NULL
              ORDER BY id DESC LIMIT 1`,
            )
            .bind(params.matriculaId, params.empresaId)
            .first<{ id: number }>()
        )?.id ?? null,
      nextNumeroCiclo:
        Number(
          (
            await db
              .prepare(
                `SELECT COALESCE(MAX(numero_ciclo), 0) AS max_numero
                   FROM lms_matricula_ciclos
                  WHERE matricula_id = ? AND empresa_id = ?`,
              )
              .bind(params.matriculaId, params.empresaId)
              .first<{ max_numero: number | null }>()
          )?.max_numero ?? 0,
        ) + 1,
    };

    const statements = buildNotRequiredBatchStatements(params, pre);
    await db.batch(statements.map((s) => db.prepare(s.sql).bind(...s.args)));
    return {
      outcome: 'qualification_not_required',
      qualificacaoHistoricoId: null,
      matriculaId: params.matriculaId,
    };
  }

  // Caso B: curso exige qualificação — campos obrigatórios devem existir.
  if (!params.qualificacaoTipoId) {
    await logRejectionAudit(
      db,
      params,
      'gerarQualificacaoAoConcluir=true mas qualificacaoTipoId está ausente',
    );
    throw new LmsCompletionRejectedError(
      'Curso configurado para gerar qualificação, mas sem tipo de qualificação vinculado',
      'LMS_QUALIFICATION_MAPPING_INVALID',
    );
  }

  const qualificacaoCodigo = params.qualificacaoCodigo ?? params.qualificacaoNome ?? '';
  if (!qualificacaoCodigo) {
    await logRejectionAudit(
      db,
      params,
      'gerarQualificacaoAoConcluir=true mas qualificacaoCodigo está vazio',
    );
    throw new LmsCompletionRejectedError(
      'Curso configurado para gerar qualificação, mas sem código de qualificação definido',
      'LMS_QUALIFICATION_MAPPING_INVALID',
    );
  }

  // ────────────────────────────────────────────────────────────────────────

  let category: { id: number | null; nome: string | null };
  try {
    category = await resolveCompletionCategory(db, params.empresaId, params.qualificacaoTipoId);
  } catch (error) {
    const rejected =
      error instanceof LmsCompletionRejectedError
        ? error
        : new LmsCompletionRejectedError(
            'Falha ao resolver a categoria canônica da qualificação',
            'LMS_QUALIFICATION_MAPPING_INVALID',
            error,
          );
    await logRejectionAudit(db, params, rejected.message);
    throw rejected;
  }
  const paramsWithCanonicalCategory: CompleteLmsMatriculaParams = {
    ...params,
    qualificacaoCategoriaId: category.id,
    qualificacaoCategoria: category.nome ?? params.qualificacaoCategoria,
  };

  const pre = await readPreBatchState(db, paramsWithCanonicalCategory, qualificacaoCodigo);
  const wasReuse = pre.existingHistoricoId != null;
  const statements = buildCompletionBatchStatements(paramsWithCanonicalCategory, pre);

  try {
    await db.batch(statements.map((s) => db.prepare(s.sql).bind(...s.args)));
  } catch (error) {
    if (isConcurrentQualificationUniqueConstraint(error)) {
      // Corrida perdida: outra requisição inseriu primeiro. O batch inteiro
      // desta requisição foi revertido pelo D1 — retry único como reuso.
      const retryPre = await readPreBatchState(db, paramsWithCanonicalCategory, qualificacaoCodigo);
      if (retryPre.existingHistoricoId) {
        const retryStatements = buildCompletionBatchStatements(
          paramsWithCanonicalCategory,
          retryPre,
        );
        try {
          await db.batch(retryStatements.map((s) => db.prepare(s.sql).bind(...s.args)));
          return {
            outcome: 'qualification_reused',
            qualificacaoHistoricoId: retryPre.existingHistoricoId,
            matriculaId: params.matriculaId,
          };
        } catch (retryError) {
          await logRejectionAudit(
            db,
            params,
            retryError instanceof Error ? retryError.message : String(retryError),
          );
          throw new LmsCompletionRejectedError(
            'Falha ao concluir matrícula após corrida concorrente',
            'LMS_QUALIFICATION_COMPLETION_FAILED',
            retryError,
          );
        }
      }
    }

    await logRejectionAudit(db, params, error instanceof Error ? error.message : String(error));
    throw new LmsCompletionRejectedError(
      'Falha ao concluir matrícula: qualificação não pôde ser garantida',
      'LMS_QUALIFICATION_COMPLETION_FAILED',
      error,
    );
  }

  // Validação pós-batch: o Histórico DEVE existir após batch bem-sucedido.
  const historicoRow = await db
    .prepare(
      `SELECT id FROM qualificacoes_historico
        WHERE empresa_id = ? AND funcionario_id = ? AND qualificacao_codigo = ? AND data_conclusao = ?
          AND deleted_at IS NULL
        ORDER BY id DESC LIMIT 1`,
    )
    .bind(params.empresaId, params.funcionarioId, qualificacaoCodigo, params.dataConclusao)
    .first<{ id: number }>();

  if (!historicoRow?.id) {
    // Batch confirmou mas o Histórico não foi encontrado — estado
    // impossível em operação normal, indica bug de integridade.
    console.error(
      JSON.stringify({
        event: 'LMS_POST_BATCH_HISTORICO_MISSING',
        matricula_id: params.matriculaId,
        empresa_id: params.empresaId,
        funcionario_id: params.funcionarioId,
        qualificacao_codigo: qualificacaoCodigo,
        data_conclusao: params.dataConclusao,
      }),
    );
    throw new LmsCompletionRejectedError(
      'Histórico de qualificação não localizado após conclusão — inconsistência interna',
      'LMS_QUALIFICATION_COMPLETION_FAILED',
    );
  }

  return {
    outcome: wasReuse ? 'qualification_reused' : 'qualification_created',
    qualificacaoHistoricoId: historicoRow.id,
    matriculaId: params.matriculaId,
  };
}

function buildNotRequiredBatchStatements(
  params: CompleteLmsMatriculaParams,
  pre: PreBatchState,
): { sql: string; args: unknown[] }[] {
  const progressoPct = params.progressoPct ?? 100;
  const statements: { sql: string; args: unknown[] }[] = [
    {
      sql: `UPDATE lms_matriculas
               SET status = 'CONCLUIDO',
                   progresso_pct = MAX(COALESCE(progresso_pct, 0), ?),
                   data_inicio = COALESCE(data_inicio, datetime('now')),
                   data_conclusao = COALESCE(data_conclusao, ?),
                   score_final = CASE WHEN ? IS NULL THEN score_final ELSE ? END,
                   updated_at = datetime('now')
             WHERE id = ? AND empresa_id = ? AND funcionario_id = ?`,
      args: [
        progressoPct,
        params.dataConclusao,
        params.scoreFinal ?? null,
        params.scoreFinal ?? null,
        params.matriculaId,
        params.empresaId,
        params.funcionarioId,
      ],
    },
  ];

  if (pre.currentCycleId) {
    statements.push({
      sql: `UPDATE lms_matricula_ciclos
               SET status = 'CONCLUIDO', data_conclusao = ?,
                   progresso_pct = MAX(COALESCE(progresso_pct, 0), ?), updated_at = datetime('now')
             WHERE id = ? AND empresa_id = ? AND matricula_id = ?`,
      args: [
        params.dataConclusao,
        progressoPct,
        pre.currentCycleId,
        params.empresaId,
        params.matriculaId,
      ],
    });
  } else {
    const cursoIdForCycle = params.cursoId ?? null;
    statements.push({
      sql: `INSERT INTO lms_matricula_ciclos (
              empresa_id, matricula_id, curso_id, funcionario_id, numero_ciclo, origem,
              status, ciclo_atual, data_conclusao, progresso_pct, created_at, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, 'LMS', 'CONCLUIDO', 1, ?, ?, datetime('now'), datetime('now'), NULL)`,
      args: [
        params.empresaId,
        params.matriculaId,
        cursoIdForCycle,
        params.funcionarioId,
        pre.nextNumeroCiclo,
        params.dataConclusao,
        progressoPct,
      ],
    });
  }

  statements.push({
    sql: `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, empresa_id, created_at)
          VALUES (?, ?, 'lms_matriculas', ?, NULL, ?, ?, ?, ?, datetime('now'))`,
    args: [
      params.actorUserId ?? null,
      params.action,
      params.matriculaId,
      JSON.stringify({
        status: 'CONCLUIDO',
        progresso_pct: progressoPct,
        qualification_not_required: true,
      }),
      params.ipAddress ?? null,
      params.userAgent ?? null,
      params.empresaId,
    ],
  });

  return statements;
}
