import type { VencimentoMode } from '../utils/qualificacoes-expiration';
import { calcularDataVencimento } from '../utils/qualificacoes-expiration';
import { requireActiveQualificationCategoryById } from './qualification-category-contract';

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
  /** Display-only input. Canonical values are always resolved from the type FK. */
  qualificacaoCategoria: string | null;
  qualificacaoCategoriaId?: number | null;
  qualificacaoCategoriaCodigo?: string | null;
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

type PreBatchState = {
  existingHistoricoId: number | null;
  existingHistoricoStatus: string | null;
  anteriorAtivaId: number | null;
  anteriorAtivaObservacoes: string | null;
  currentCycleId: number | null;
  nextNumeroCiclo: number;
};

const LMS_REUSABLE_STATUSES = new Set(['CONCLUIDA', 'PLANEJADA', 'PLANEJADO']);

function isConcurrentQualificationUniqueConstraint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return (
    message.includes('UNIQUE constraint failed') &&
    message.includes('qualificacoes_historico.funcionario_id') &&
    message.includes('qualificacoes_historico.data_conclusao')
  );
}

async function resolveCompletionCategory(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number,
) {
  const type = await db
    .prepare(
      `SELECT id, categoria_id
         FROM qualificacoes_tipos
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(qualificacaoTipoId, empresaId)
    .first<{ id: number; categoria_id: number | null }>();

  if (!type?.categoria_id) {
    throw new LmsCompletionRejectedError(
      'Tipo de qualificação sem categoria_id canônico no tenant da matrícula',
      'LMS_QUALIFICATION_MAPPING_INVALID',
    );
  }

  let category;
  try {
    category = await requireActiveQualificationCategoryById(db, empresaId, type.categoria_id);
  } catch (error) {
    throw new LmsCompletionRejectedError(
      'Categoria do tipo de qualificação não está ativa no tenant da matrícula',
      'LMS_QUALIFICATION_MAPPING_INVALID',
      error,
    );
  }

  if (!category.lmsIntegrada) {
    throw new LmsCompletionRejectedError(
      'Categoria do tipo de qualificação não está integrada ao LMS',
      'LMS_QUALIFICATION_CATEGORY_NOT_INTEGRATED',
    );
  }

  return category;
}

async function validateExistingHistoricoId(
  db: D1Database,
  id: number,
  empresaId: number,
  funcionarioId: number,
  qualificacaoCodigo: string,
  dataConclusao: string,
): Promise<{ id: number; status: string | null } | null> {
  const row = await db
    .prepare(
      `SELECT id, status FROM qualificacoes_historico
        WHERE id = ?
          AND empresa_id = ?
          AND funcionario_id = ?
          AND qualificacao_codigo = ?
          AND data_conclusao = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(id, empresaId, funcionarioId, qualificacaoCodigo, dataConclusao)
    .first<{ id: number; status: string | null }>();
  return row ?? null;
}

async function readPreBatchState(
  db: D1Database,
  params: CompleteLmsMatriculaParams,
  qualificacaoCodigo: string,
): Promise<PreBatchState> {
  let validated: { id: number; status: string | null } | null = null;
  if (params.existingHistoricoId) {
    validated = await validateExistingHistoricoId(
      db,
      params.existingHistoricoId,
      params.empresaId,
      params.funcionarioId,
      qualificacaoCodigo,
      params.dataConclusao,
    );
  }

  const fallbackExisting =
    validated ??
    (await db
      .prepare(
        `SELECT id, status
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
      .first<{ id: number; status: string | null }>());

  const existingHistorico = fallbackExisting?.id ?? null;
  const existingHistoricoStatus = fallbackExisting?.status ?? null;
  // A predecessor still needs to be found/materialized both when creating a
  // fresh row AND when realizing a reused PLANEJADA row into CONCLUIDA now —
  // only a genuinely idempotent CONCLUIDA reuse has no predecessor work to do.
  const willRealizeOrCreate =
    !existingHistorico ||
    existingHistoricoStatus === 'PLANEJADA' ||
    existingHistoricoStatus === 'PLANEJADO';

  const anteriorAtiva = !willRealizeOrCreate
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
        WHERE matricula_id = ? AND empresa_id = ?`,
    )
    .bind(params.matriculaId, params.empresaId)
    .first<{ max_numero: number | null }>();

  return {
    existingHistoricoId: existingHistorico,
    existingHistoricoStatus,
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
              categoria_id, categoria, categoria_codigo, data_conclusao, data_vencimento,
              validade_meses, observacoes, empresa_id, tipo, status, renovacao_de,
              lms_matricula_id, origem_tipo, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LMS', datetime('now'), datetime('now'))`,
      args: [
        params.funcionarioId,
        params.qualificacaoTipoId,
        qualificacaoCodigo,
        'TREINAMENTO',
        qualificacaoCodigo,
        qualificacaoCategoriaId,
        params.qualificacaoCategoria,
        params.qualificacaoCategoriaCodigo,
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

  // LMS-P0-1: reusing an existing PLANEJADA row (same funcionario/code/date,
  // presumably created by a training/import flow ahead of the LMS course)
  // must realize it as CONCLUIDA now, not leave it stuck PLANEJADA while the
  // matricula itself gets marked CONCLUIDO below. completeLmsMatricula
  // already fail-closes before reaching this function for CANCELADA/RENOVADA/
  // unknown statuses — this only ever sees CONCLUIDA (idempotent, no-op here)
  // or PLANEJADA (realize) for the reuse path.
  const needsRealize =
    !needsInsert &&
    (pre.existingHistoricoStatus === 'PLANEJADA' || pre.existingHistoricoStatus === 'PLANEJADO');
  if (needsRealize) {
    statements.push({
      sql: `UPDATE qualificacoes_historico
               SET status = 'CONCLUIDA',
                   renovacao_de = ?,
                   observacoes = ?,
                   updated_at = datetime('now')
             WHERE id = ${historicoIdSubquery} AND empresa_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(status, '')) IN ('PLANEJADA', 'PLANEJADO')`,
      args: [
        pre.anteriorAtivaId,
        `Origem: LMS | Realizada ao concluir: ${params.cursoTitulo}`,
        ...historicoIdArgs,
        params.empresaId,
      ],
    });
  }

  if ((needsInsert || needsRealize) && pre.anteriorAtivaId) {
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

  if (qualificacaoCategoriaId !== null) {
    statements.push({
      sql: `UPDATE qualificacoes_historico
               SET categoria_id = ?, categoria = ?, categoria_codigo = ?, updated_at = datetime('now')
             WHERE id = ${historicoIdSubquery} AND empresa_id = ? AND deleted_at IS NULL`,
      args: [
        qualificacaoCategoriaId,
        params.qualificacaoCategoria,
        params.qualificacaoCategoriaCodigo,
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

  if (pre.currentCycleId) {
    statements.push({
      sql: `UPDATE lms_matricula_ciclos
               SET status = 'CONCLUIDO', data_conclusao = ?,
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
        params.cursoId ?? null,
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
        categoria_id: qualificacaoCategoriaId,
        categoria_codigo: params.qualificacaoCategoriaCodigo ?? null,
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
  } catch (auditError) {
    console.error(
      JSON.stringify({
        event: 'LMS_REJECTION_AUDIT_FAILED',
        matricula_id: params.matriculaId,
        empresa_id: params.empresaId,
        action: params.action,
        audit_error: auditError instanceof Error ? auditError.message : String(auditError),
      }),
    );
  }
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
    statements.push({
      sql: `INSERT INTO lms_matricula_ciclos (
              empresa_id, matricula_id, curso_id, funcionario_id, numero_ciclo, origem,
              status, ciclo_atual, data_conclusao, progresso_pct, created_at, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, 'LMS', 'CONCLUIDO', 1, ?, ?, datetime('now'), datetime('now'), NULL)`,
      args: [
        params.empresaId,
        params.matriculaId,
        params.cursoId ?? null,
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

export async function completeLmsMatricula(
  params: CompleteLmsMatriculaParams,
): Promise<LmsCompletionResult> {
  const { db } = params;

  if (!params.gerarQualificacaoAoConcluir) {
    const pre = await readPreBatchState(db, params, '');
    const statements = buildNotRequiredBatchStatements(params, pre);
    await db.batch(
      statements.map((statement) => db.prepare(statement.sql).bind(...statement.args)),
    );
    return {
      outcome: 'qualification_not_required',
      qualificacaoHistoricoId: null,
      matriculaId: params.matriculaId,
    };
  }

  if (!params.qualificacaoTipoId) {
    await logRejectionAudit(db, params, 'qualificacaoTipoId ausente');
    throw new LmsCompletionRejectedError(
      'Curso configurado para gerar qualificação, mas sem tipo vinculado',
      'LMS_QUALIFICATION_MAPPING_INVALID',
    );
  }

  const qualificacaoCodigo = params.qualificacaoCodigo ?? params.qualificacaoNome ?? '';
  if (!qualificacaoCodigo) {
    await logRejectionAudit(db, params, 'qualificacaoCodigo ausente');
    throw new LmsCompletionRejectedError(
      'Curso configurado para gerar qualificação, mas sem código definido',
      'LMS_QUALIFICATION_MAPPING_INVALID',
    );
  }

  let category;
  try {
    category = await resolveCompletionCategory(db, params.empresaId, params.qualificacaoTipoId);
  } catch (error) {
    const rejected =
      error instanceof LmsCompletionRejectedError
        ? error
        : new LmsCompletionRejectedError(
            'Falha ao resolver categoria canônica da qualificação',
            'LMS_QUALIFICATION_MAPPING_INVALID',
            error,
          );
    await logRejectionAudit(db, params, rejected.message);
    throw rejected;
  }

  const canonicalParams: CompleteLmsMatriculaParams = {
    ...params,
    qualificacaoCategoriaId: category.id,
    qualificacaoCategoria: category.nome,
    qualificacaoCategoriaCodigo: category.codigo,
  };
  const pre = await readPreBatchState(db, canonicalParams, qualificacaoCodigo);

  // LMS-P0-1: an existing row at this exact (funcionario, code, date) with a
  // status other than CONCLUIDA/PLANEJADA (reusable/realizable) must fail
  // closed — the matricula must NOT be marked CONCLUIDO on top of a
  // CANCELADA or already-RENOVADA (superseded) qualification record, nor on
  // an unrecognized status. Reject before touching lms_matriculas at all.
  if (
    pre.existingHistoricoId &&
    pre.existingHistoricoStatus !== null &&
    !LMS_REUSABLE_STATUSES.has(pre.existingHistoricoStatus)
  ) {
    await logRejectionAudit(
      db,
      params,
      `Histórico existente #${pre.existingHistoricoId} tem status incompatível para reuso: ${pre.existingHistoricoStatus}`,
    );
    throw new LmsCompletionRejectedError(
      `A qualificação já possui um registro com status ${pre.existingHistoricoStatus}, que não pode ser reutilizado para concluir esta matrícula`,
      'LMS_QUALIFICATION_STATUS_INCOMPATIBLE',
    );
  }

  const wasReuse = pre.existingHistoricoId !== null;
  const statements = buildCompletionBatchStatements(canonicalParams, pre);

  try {
    await db.batch(
      statements.map((statement) => db.prepare(statement.sql).bind(...statement.args)),
    );
  } catch (error) {
    if (isConcurrentQualificationUniqueConstraint(error)) {
      const retryPre = await readPreBatchState(db, canonicalParams, qualificacaoCodigo);
      if (retryPre.existingHistoricoId) {
        const retryStatements = buildCompletionBatchStatements(canonicalParams, retryPre);
        try {
          await db.batch(
            retryStatements.map((statement) => db.prepare(statement.sql).bind(...statement.args)),
          );
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

  const historico = await db
    .prepare(
      `SELECT id FROM qualificacoes_historico
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND qualificacao_codigo = ?
          AND data_conclusao = ?
          AND deleted_at IS NULL
        ORDER BY id DESC LIMIT 1`,
    )
    .bind(params.empresaId, params.funcionarioId, qualificacaoCodigo, params.dataConclusao)
    .first<{ id: number }>();

  if (!historico?.id) {
    throw new LmsCompletionRejectedError(
      'Histórico não localizado após conclusão',
      'LMS_QUALIFICATION_COMPLETION_FAILED',
    );
  }

  return {
    outcome: wasReuse ? 'qualification_reused' : 'qualification_created',
    qualificacaoHistoricoId: historico.id,
    matriculaId: params.matriculaId,
  };
}
