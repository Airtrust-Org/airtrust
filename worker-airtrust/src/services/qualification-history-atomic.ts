/**
 * Atomic qualification history mutations.
 *
 * Cloudflare D1 guarantees that DB.batch() executes all statements as a
 * transaction: one failing statement rolls the whole batch back. The
 * functions in this module keep the mandatory qualification invariants in
 * that batch and leave audit/events/certificates to resilient post-commit
 * processing.
 */

export type QualificationTrainingType =
  | 'INICIAL'
  | 'RECORRENTE'
  | 'SEMESTRAL'
  | 'UPGRADE'
  | 'ESPECIFICO';

export type QualificationMutationAction = 'created' | 'updated' | 'idempotent';

export class QualificationAtomicError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'QualificationAtomicError';
  }
}

export interface RequiredQualificationRelation {
  qualificationId: number;
  qualificationCode: string;
  category: string | null;
  expiryDate: string | null;
  validityMonths: number | null;
  workload: number | null;
  trainingType: QualificationTrainingType;
  status: 'CONCLUIDA';
}

export interface AtomicQualificationCreateInput {
  empresaId: number;
  funcionarioId: number;
  qualificationId: number;
  qualificationCode: string;
  category: string | null;
  completionDate: string;
  expiryDate: string | null;
  validityMonths: number | null;
  instructor: string | null;
  observations: string | null;
  status: 'PLANEJADA' | 'CONCLUIDA';
  workload: number | null;
  trainingType: QualificationTrainingType;
  requiredRelation?: RequiredQualificationRelation | null;
}

export interface AtomicQualificationRenewInput {
  empresaId: number;
  sourceHistoryId: number;
  qualificationId: number | null;
  qualificationCode: string;
  category: string | null;
  completionDate: string;
  expiryDate: string | null;
  validityMonths: number | null;
  instructor: string | null;
  observations: string | null;
  status: 'CONCLUIDA';
  workload: number | null;
  trainingType: QualificationTrainingType;
  requiredRelation?: RequiredQualificationRelation | null;
}

export interface AtomicQualificationMutationResult {
  id: number;
  action: QualificationMutationAction;
  previousHistoryId: number | null;
  relationHistoryId: number | null;
}

type HistoryRow = {
  id: number;
  funcionario_id: number;
  qualificacao_id: number | null;
  qualificacao_codigo: string | null;
  data_conclusao: string | null;
  data_vencimento: string | null;
  validade_meses: number | null;
  tipo_treinamento: string | null;
  carga_horaria: number | null;
  renovacao_de?: number | null;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function parseIsoDate(value: string, fieldName: string): Date {
  const normalized = String(value || '').trim();
  if (!ISO_DATE_RE.test(normalized)) {
    throw new QualificationAtomicError(
      'INVALID_QUALIFICATION_DATE',
      400,
      `${fieldName} deve usar o formato YYYY-MM-DD`,
    );
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new QualificationAtomicError(
      'INVALID_QUALIFICATION_DATE',
      400,
      `${fieldName} contém uma data inexistente`,
    );
  }
  return parsed;
}

/** NULL and zero mean no automatic expiry. */
export function normalizeValidityMonths(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new QualificationAtomicError(
      'INVALID_VALIDITY_MONTHS',
      400,
      'Validade deve ser um número inteiro de meses maior ou igual a zero',
    );
  }
  return parsed === 0 ? null : parsed;
}

export function resolveEffectiveValidityMonths(params: {
  qualificationCode: string;
  typeValidityMonths: unknown;
  birthDate?: string | null;
  completionDate: string;
}): number | null {
  const validity = normalizeValidityMonths(params.typeValidityMonths);
  if (normalizeCode(params.qualificationCode) !== 'CMA' || !params.birthDate) return validity;

  const completion = parseIsoDate(params.completionDate, 'data_conclusao');
  const birth = parseIsoDate(params.birthDate, 'data_nascimento');
  const sixtiethBirthday = new Date(birth);
  sixtiethBirthday.setUTCFullYear(sixtiethBirthday.getUTCFullYear() + 60);
  return sixtiethBirthday.getTime() <= completion.getTime() ? 6 : validity;
}

export function calculateQualificationExpiry(params: {
  completionDate: string;
  explicitExpiryDate?: string | null;
  validityMonths: unknown;
  endOfMonth?: boolean;
}): string | null {
  const completion = parseIsoDate(params.completionDate, 'data_conclusao');

  if (params.explicitExpiryDate !== undefined && params.explicitExpiryDate !== null) {
    const explicitValue = String(params.explicitExpiryDate).trim();
    if (explicitValue) {
      const explicit = parseIsoDate(explicitValue, 'data_vencimento');
      if (explicit.getTime() <= completion.getTime()) {
        throw new QualificationAtomicError(
          'INVALID_EXPIRY_DATE',
          400,
          'data_vencimento deve ser posterior à data_conclusao',
        );
      }
      return explicitValue;
    }
  }

  const validityMonths = normalizeValidityMonths(params.validityMonths);
  if (validityMonths === null) return null;

  if (params.endOfMonth) {
    return new Date(
      Date.UTC(
        completion.getUTCFullYear(),
        completion.getUTCMonth() + validityMonths + 1,
        0,
      ),
    )
      .toISOString()
      .slice(0, 10);
  }

  const expiry = new Date(completion);
  expiry.setUTCMonth(expiry.getUTCMonth() + validityMonths);
  return expiry.toISOString().slice(0, 10);
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new QualificationAtomicError(
      'INVALID_QUALIFICATION_REFERENCE',
      400,
      `${fieldName} inválido`,
    );
  }
}

function validateCommonInput(input: {
  empresaId: number;
  funcionarioId?: number;
  qualificationId?: number | null;
  qualificationCode: string;
  completionDate: string;
  expiryDate: string | null;
  validityMonths: number | null;
}): void {
  assertPositiveInteger(input.empresaId, 'empresa_id');
  if (input.funcionarioId !== undefined) assertPositiveInteger(input.funcionarioId, 'funcionario_id');
  if (input.qualificationId !== undefined && input.qualificationId !== null) {
    assertPositiveInteger(input.qualificationId, 'qualificacao_id');
  }
  if (!normalizeCode(input.qualificationCode)) {
    throw new QualificationAtomicError(
      'INVALID_QUALIFICATION_CODE',
      400,
      'Código da qualificação é obrigatório',
    );
  }
  parseIsoDate(input.completionDate, 'data_conclusao');
  normalizeValidityMonths(input.validityMonths);
  if (input.expiryDate) {
    calculateQualificationExpiry({
      completionDate: input.completionDate,
      explicitExpiryDate: input.expiryDate,
      validityMonths: input.validityMonths,
    });
  }
}

function buildOlderHistoryUpdate(
  db: D1Database,
  params: {
    empresaId: number;
    funcionarioId: number;
    qualificationId: number | null;
    qualificationCode: string;
    completionDate: string;
  },
) {
  return db
    .prepare(
      `UPDATE qualificacoes_historico
          SET renovada = 1,
              status = 'RENOVADA',
              updated_at = datetime('now')
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND deleted_at IS NULL
          AND COALESCE(renovada, 0) = 0
          AND UPPER(COALESCE(status, '')) NOT IN (
            'PLANEJADA', 'PLANEJADO', 'CANCELADA', 'CANCELADO', 'RENOVADA'
          )
          AND (
            (? IS NOT NULL AND qualificacao_id = ?)
            OR UPPER(COALESCE(qualificacao_codigo, '')) = UPPER(?)
          )
          AND date(COALESCE(data_conclusao, '1900-01-01')) <= date(?)
          AND id <> COALESCE(
            (
              SELECT current_row.id
                FROM qualificacoes_historico current_row
               WHERE current_row.empresa_id = ?
                 AND current_row.funcionario_id = ?
                 AND current_row.deleted_at IS NULL
                 AND UPPER(COALESCE(current_row.qualificacao_codigo, '')) = UPPER(?)
                 AND current_row.data_conclusao = ?
               ORDER BY current_row.id DESC
               LIMIT 1
            ),
            -1
          )
          AND EXISTS (
            SELECT 1
              FROM qualificacoes_historico current_row
             WHERE current_row.empresa_id = ?
               AND current_row.funcionario_id = ?
               AND current_row.deleted_at IS NULL
               AND UPPER(COALESCE(current_row.qualificacao_codigo, '')) = UPPER(?)
               AND current_row.data_conclusao = ?
          )`,
    )
    .bind(
      params.empresaId,
      params.funcionarioId,
      params.qualificationId,
      params.qualificationId,
      params.qualificationCode,
      params.completionDate,
      params.empresaId,
      params.funcionarioId,
      params.qualificationCode,
      params.completionDate,
      params.empresaId,
      params.funcionarioId,
      params.qualificationCode,
      params.completionDate,
    );
}

function appendRequiredRelationStatements(
  statements: ReturnType<D1Database['prepare']>[],
  db: D1Database,
  params: {
    empresaId: number;
    parentFuncionarioId: number;
    parentQualificationCode: string;
    parentCompletionDate: string;
    relation: RequiredQualificationRelation;
    parentRenewalSourceId?: number | null;
  },
): void {
  const relation = params.relation;
  const relationCode = normalizeCode(relation.qualificationCode);
  validateCommonInput({
    empresaId: params.empresaId,
    funcionarioId: params.parentFuncionarioId,
    qualificationId: relation.qualificationId,
    qualificationCode: relationCode,
    completionDate: params.parentCompletionDate,
    expiryDate: relation.expiryDate,
    validityMonths: relation.validityMonths,
  });

  const renewalPredicate =
    params.parentRenewalSourceId && params.parentRenewalSourceId > 0
      ? 'AND parent.renovacao_de = ?'
      : '';
  const renewalBindings =
    params.parentRenewalSourceId && params.parentRenewalSourceId > 0
      ? [params.parentRenewalSourceId]
      : [];

  statements.push(
    db
      .prepare(
        `UPDATE qualificacoes_historico
            SET qualificacao_id = ?,
                categoria = ?,
                data_vencimento = ?,
                validade_meses = ?,
                instrutor = (
                  SELECT parent.instrutor
                    FROM qualificacoes_historico parent
                   WHERE parent.empresa_id = ?
                     AND parent.funcionario_id = ?
                     AND UPPER(COALESCE(parent.qualificacao_codigo, '')) = UPPER(?)
                     AND parent.data_conclusao = ?
                     AND parent.deleted_at IS NULL
                     ${renewalPredicate}
                   ORDER BY parent.id DESC
                   LIMIT 1
                ),
                observacoes = COALESCE(
                  observacoes,
                  'Gerada automaticamente a partir da qualificação relacionada'
                ),
                status = ?,
                renovada = 0,
                carga_horaria = ?,
                tipo_treinamento = ?,
                updated_at = datetime('now')
          WHERE empresa_id = ?
            AND funcionario_id = ?
            AND UPPER(COALESCE(qualificacao_codigo, '')) = UPPER(?)
            AND data_conclusao = ?
            AND deleted_at IS NULL
            AND UPPER(COALESCE(status, '')) IN ('PLANEJADA', 'PLANEJADO')
            AND EXISTS (
              SELECT 1
                FROM qualificacoes_historico parent
               WHERE parent.empresa_id = ?
                 AND parent.funcionario_id = ?
                 AND UPPER(COALESCE(parent.qualificacao_codigo, '')) = UPPER(?)
                 AND parent.data_conclusao = ?
                 AND parent.deleted_at IS NULL
                 ${renewalPredicate}
            )`,
      )
      .bind(
        relation.qualificationId,
        relation.category,
        relation.expiryDate,
        relation.validityMonths,
        params.empresaId,
        params.parentFuncionarioId,
        params.parentQualificationCode,
        params.parentCompletionDate,
        ...renewalBindings,
        relation.status,
        relation.workload,
        relation.trainingType,
        params.empresaId,
        params.parentFuncionarioId,
        relationCode,
        params.parentCompletionDate,
        params.empresaId,
        params.parentFuncionarioId,
        params.parentQualificationCode,
        params.parentCompletionDate,
        ...renewalBindings,
      ),
  );

  // This statement follows predecessor updates intentionally: if it fails,
  // D1 rolls the whole batch back, including any RENOVADA marking.
  statements.push(
    db
      .prepare(
        `INSERT INTO qualificacoes_historico (
           funcionario_id,
           qualificacao_id,
           qualificacao_codigo,
           categoria,
           data_conclusao,
           data_vencimento,
           validade_meses,
           instrutor,
           observacoes,
           status,
           renovada,
           carga_horaria,
           tipo_treinamento,
           empresa_id,
           renovacao_de,
           created_at,
           updated_at
         )
         SELECT parent.funcionario_id,
                ?,
                ?,
                ?,
                parent.data_conclusao,
                ?,
                ?,
                parent.instrutor,
                'Gerada automaticamente a partir de #' || parent.id,
                ?,
                0,
                ?,
                ?,
                parent.empresa_id,
                NULL,
                datetime('now'),
                datetime('now')
           FROM qualificacoes_historico parent
          WHERE parent.empresa_id = ?
            AND parent.funcionario_id = ?
            AND UPPER(COALESCE(parent.qualificacao_codigo, '')) = UPPER(?)
            AND parent.data_conclusao = ?
            AND parent.deleted_at IS NULL
            ${renewalPredicate}
          ORDER BY parent.id DESC
          LIMIT 1
         ON CONFLICT DO NOTHING`,
      )
      .bind(
        relation.qualificationId,
        relationCode,
        relation.category,
        relation.expiryDate,
        relation.validityMonths,
        relation.status,
        relation.workload,
        relation.trainingType,
        params.empresaId,
        params.parentFuncionarioId,
        params.parentQualificationCode,
        params.parentCompletionDate,
        ...renewalBindings,
      ),
  );

  statements.push(
    buildOlderHistoryUpdate(db, {
      empresaId: params.empresaId,
      funcionarioId: params.parentFuncionarioId,
      qualificationId: relation.qualificationId,
      qualificationCode: relationCode,
      completionDate: params.parentCompletionDate,
    }),
  );
}

async function findExactHistory(
  db: D1Database,
  params: {
    empresaId: number;
    funcionarioId: number;
    qualificationCode: string;
    completionDate: string;
  },
): Promise<HistoryRow | null> {
  return db
    .prepare(
      `SELECT id,
              funcionario_id,
              qualificacao_id,
              qualificacao_codigo,
              data_conclusao,
              data_vencimento,
              validade_meses,
              tipo_treinamento,
              carga_horaria,
              renovacao_de
         FROM qualificacoes_historico
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND UPPER(COALESCE(qualificacao_codigo, '')) = UPPER(?)
          AND data_conclusao = ?
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(
      params.empresaId,
      params.funcionarioId,
      params.qualificationCode,
      params.completionDate,
    )
    .first<HistoryRow>();
}

async function findMostRecentRenewedPredecessor(
  db: D1Database,
  params: {
    empresaId: number;
    funcionarioId: number;
    qualificationCode: string;
    currentId: number;
  },
): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT id
         FROM qualificacoes_historico
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND UPPER(COALESCE(qualificacao_codigo, '')) = UPPER(?)
          AND id <> ?
          AND deleted_at IS NULL
          AND COALESCE(renovada, 0) = 1
        ORDER BY date(COALESCE(data_conclusao, '1900-01-01')) DESC, id DESC
        LIMIT 1`,
    )
    .bind(
      params.empresaId,
      params.funcionarioId,
      params.qualificationCode,
      params.currentId,
    )
    .first<{ id: number }>();

  return row?.id ?? null;
}

export async function createQualificationHistoryAtomic(
  db: D1Database,
  input: AtomicQualificationCreateInput,
): Promise<AtomicQualificationMutationResult> {
  const qualificationCode = normalizeCode(input.qualificationCode);
  validateCommonInput({ ...input, qualificationCode });

  const statements: ReturnType<D1Database['prepare']>[] = [];
  let plannedUpdateIndex: number | null = null;

  if (qualificationCode === 'G1-SEM') {
    plannedUpdateIndex = statements.length;
    statements.push(
      db
        .prepare(
          `UPDATE qualificacoes_historico
              SET qualificacao_id = ?,
                  categoria = ?,
                  data_vencimento = ?,
                  validade_meses = ?,
                  instrutor = ?,
                  observacoes = ?,
                  status = ?,
                  renovada = 0,
                  carga_horaria = ?,
                  tipo_treinamento = ?,
                  updated_at = datetime('now')
            WHERE empresa_id = ?
              AND funcionario_id = ?
              AND UPPER(COALESCE(qualificacao_codigo, '')) = 'G1-SEM'
              AND data_conclusao = ?
              AND deleted_at IS NULL
              AND UPPER(COALESCE(status, '')) IN ('PLANEJADA', 'PLANEJADO')`,
        )
        .bind(
          input.qualificationId,
          input.category,
          input.expiryDate,
          input.validityMonths,
          input.instructor,
          input.observations,
          input.status,
          input.workload,
          input.trainingType,
          input.empresaId,
          input.funcionarioId,
          input.completionDate,
        ),
    );
  }

  const insertResultIndex = statements.length;
  statements.push(
    db
      .prepare(
        `INSERT INTO qualificacoes_historico (
           funcionario_id,
           qualificacao_id,
           qualificacao_codigo,
           categoria,
           data_conclusao,
           data_vencimento,
           validade_meses,
           instrutor,
           observacoes,
           status,
           renovada,
           carga_horaria,
           tipo_treinamento,
           empresa_id,
           renovacao_de,
           created_at,
           updated_at
         )
         SELECT f.id,
                qt.id,
                qt.codigo,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                0,
                ?,
                ?,
                f.empresa_id,
                NULL,
                datetime('now'),
                datetime('now')
           FROM funcionarios f
           INNER JOIN qualificacoes_tipos qt
             ON qt.id = ?
            AND qt.empresa_id = f.empresa_id
            AND qt.deleted_at IS NULL
          WHERE f.id = ?
            AND f.empresa_id = ?
            AND f.deleted_at IS NULL
         ON CONFLICT DO NOTHING`,
      )
      .bind(
        input.category,
        input.completionDate,
        input.expiryDate,
        input.validityMonths,
        input.instructor,
        input.observations,
        input.status,
        input.workload,
        input.trainingType,
        input.qualificationId,
        input.funcionarioId,
        input.empresaId,
      ),
  );

  statements.push(
    buildOlderHistoryUpdate(db, {
      empresaId: input.empresaId,
      funcionarioId: input.funcionarioId,
      qualificationId: input.qualificationId,
      qualificationCode,
      completionDate: input.completionDate,
    }),
  );

  if (input.requiredRelation) {
    appendRequiredRelationStatements(statements, db, {
      empresaId: input.empresaId,
      parentFuncionarioId: input.funcionarioId,
      parentQualificationCode: qualificationCode,
      parentCompletionDate: input.completionDate,
      relation: input.requiredRelation,
    });
  }

  const results = await db.batch(statements);
  const created = Number(results[insertResultIndex]?.meta?.changes || 0) > 0;
  const updated =
    plannedUpdateIndex !== null &&
    Number(results[plannedUpdateIndex]?.meta?.changes || 0) > 0;

  const row = await findExactHistory(db, {
    empresaId: input.empresaId,
    funcionarioId: input.funcionarioId,
    qualificationCode,
    completionDate: input.completionDate,
  });

  if (!row) {
    throw new QualificationAtomicError(
      'QUALIFICATION_CORE_NOT_CREATED',
      409,
      'A qualificação não foi criada; funcionário ou tipo não pertence ao tenant informado',
    );
  }

  let relationHistoryId: number | null = null;
  if (input.requiredRelation) {
    const relation = await findExactHistory(db, {
      empresaId: input.empresaId,
      funcionarioId: input.funcionarioId,
      qualificationCode: input.requiredRelation.qualificationCode,
      completionDate: input.completionDate,
    });
    if (!relation) {
      throw new QualificationAtomicError(
        'QUALIFICATION_RELATION_INVARIANT_FAILED',
        500,
        'A relação obrigatória da qualificação não foi persistida',
      );
    }
    relationHistoryId = relation.id;
  }

  const previousHistoryId = await findMostRecentRenewedPredecessor(db, {
    empresaId: input.empresaId,
    funcionarioId: input.funcionarioId,
    qualificationCode,
    currentId: row.id,
  });

  return {
    id: row.id,
    action: created ? 'created' : updated ? 'updated' : 'idempotent',
    previousHistoryId,
    relationHistoryId,
  };
}

export async function renewQualificationHistoryAtomic(
  db: D1Database,
  input: AtomicQualificationRenewInput,
): Promise<AtomicQualificationMutationResult> {
  assertPositiveInteger(input.sourceHistoryId, 'registro_anterior_id');
  const qualificationCode = normalizeCode(input.qualificationCode);
  validateCommonInput({ ...input, qualificationCode });

  const statements: ReturnType<D1Database['prepare']>[] = [];
  const insertResultIndex = statements.length;

  statements.push(
    db
      .prepare(
        `INSERT INTO qualificacoes_historico (
           funcionario_id,
           qualificacao_id,
           qualificacao_codigo,
           categoria,
           data_conclusao,
           data_vencimento,
           validade_meses,
           numero_certificado,
           instrutor,
           observacoes,
           status,
           renovada,
           carga_horaria,
           tipo_treinamento,
           empresa_id,
           renovacao_de,
           created_at,
           updated_at
         )
         SELECT source.funcionario_id,
                COALESCE(source.qualificacao_id, ?),
                COALESCE(NULLIF(source.qualificacao_codigo, ''), ?),
                COALESCE(source.categoria, ?),
                ?,
                ?,
                ?,
                source.numero_certificado,
                COALESCE(?, source.instrutor),
                ?,
                ?,
                0,
                ?,
                ?,
                source.empresa_id,
                source.id,
                datetime('now'),
                datetime('now')
           FROM qualificacoes_historico source
           INNER JOIN funcionarios f
             ON f.id = source.funcionario_id
            AND f.empresa_id = source.empresa_id
            AND f.deleted_at IS NULL
          WHERE source.id = ?
            AND source.empresa_id = ?
            AND source.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
                FROM qualificacoes_historico successor
               WHERE successor.empresa_id = source.empresa_id
                 AND successor.renovacao_de = source.id
                 AND successor.deleted_at IS NULL
                 AND UPPER(COALESCE(successor.status, '')) NOT IN ('CANCELADA', 'CANCELADO')
            )
         ON CONFLICT DO NOTHING`,
      )
      .bind(
        input.qualificationId,
        qualificationCode,
        input.category,
        input.completionDate,
        input.expiryDate,
        input.validityMonths,
        input.instructor,
        input.observations,
        input.status,
        input.workload,
        input.trainingType,
        input.sourceHistoryId,
        input.empresaId,
      ),
  );

  statements.push(
    db
      .prepare(
        `UPDATE qualificacoes_historico
            SET renovada = 1,
                status = 'RENOVADA',
                updated_at = datetime('now')
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
            AND EXISTS (
              SELECT 1
                FROM qualificacoes_historico successor
               WHERE successor.empresa_id = ?
                 AND successor.renovacao_de = ?
                 AND successor.deleted_at IS NULL
                 AND UPPER(COALESCE(successor.status, '')) NOT IN ('CANCELADA', 'CANCELADO')
            )`,
      )
      .bind(
        input.sourceHistoryId,
        input.empresaId,
        input.empresaId,
        input.sourceHistoryId,
      ),
  );

  const source = await db
    .prepare(
      `SELECT funcionario_id
         FROM qualificacoes_historico
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(input.sourceHistoryId, input.empresaId)
    .first<{ funcionario_id: number }>();

  if (!source) {
    throw new QualificationAtomicError(
      'QUALIFICATION_SOURCE_NOT_FOUND',
      404,
      'Qualificação de origem não encontrada neste tenant',
    );
  }

  if (input.requiredRelation) {
    appendRequiredRelationStatements(statements, db, {
      empresaId: input.empresaId,
      parentFuncionarioId: source.funcionario_id,
      parentQualificationCode: qualificationCode,
      parentCompletionDate: input.completionDate,
      relation: input.requiredRelation,
      parentRenewalSourceId: input.sourceHistoryId,
    });
  }

  const results = await db.batch(statements);
  const created = Number(results[insertResultIndex]?.meta?.changes || 0) > 0;

  const successor = await db
    .prepare(
      `SELECT id,
              funcionario_id,
              qualificacao_id,
              qualificacao_codigo,
              data_conclusao,
              data_vencimento,
              validade_meses,
              tipo_treinamento,
              carga_horaria,
              renovacao_de
         FROM qualificacoes_historico
        WHERE empresa_id = ?
          AND renovacao_de = ?
          AND deleted_at IS NULL
          AND UPPER(COALESCE(status, '')) NOT IN ('CANCELADA', 'CANCELADO')
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(input.empresaId, input.sourceHistoryId)
    .first<HistoryRow>();

  if (!successor) {
    const conflict = await findExactHistory(db, {
      empresaId: input.empresaId,
      funcionarioId: source.funcionario_id,
      qualificationCode,
      completionDate: input.completionDate,
    });

    throw new QualificationAtomicError(
      conflict ? 'QUALIFICATION_RENEWAL_CONFLICT' : 'QUALIFICATION_RENEWAL_NOT_PERFORMED',
      conflict ? 409 : 500,
      conflict
        ? 'Já existe um registro para a qualificação e data informadas sem vínculo com esta renovação'
        : 'A renovação não foi realizada',
    );
  }

  if (successor.data_conclusao !== input.completionDate) {
    throw new QualificationAtomicError(
      'QUALIFICATION_ALREADY_RENEWED',
      409,
      `A qualificação já possui sucessora na data ${successor.data_conclusao || 'não informada'}`,
    );
  }

  let relationHistoryId: number | null = null;
  if (input.requiredRelation) {
    const relation = await findExactHistory(db, {
      empresaId: input.empresaId,
      funcionarioId: successor.funcionario_id,
      qualificationCode: input.requiredRelation.qualificationCode,
      completionDate: input.completionDate,
    });
    if (!relation) {
      throw new QualificationAtomicError(
        'QUALIFICATION_RELATION_INVARIANT_FAILED',
        500,
        'A relação obrigatória da renovação não foi persistida',
      );
    }
    relationHistoryId = relation.id;
  }

  return {
    id: successor.id,
    action: created ? 'created' : 'idempotent',
    previousHistoryId: input.sourceHistoryId,
    relationHistoryId,
  };
}

export async function settleQualificationComplementaryEffects(
  effects: Record<string, () => Promise<unknown>>,
): Promise<string[]> {
  const entries = Object.entries(effects);
  const settled = await Promise.allSettled(entries.map(([, effect]) => effect()));
  return settled.flatMap((result, index) =>
    result.status === 'rejected' ? [entries[index][0]] : [],
  );
}
