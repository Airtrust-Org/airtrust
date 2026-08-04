/**
 * Atomic overrides for qualification-history creation and renewal.
 *
 * Mounted before the legacy historico router so POST /historico and
 * POST /historico/:id/renovar use the D1 batch contract while every other
 * historico route keeps its existing handler.
 */

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../../types';
import { auth } from '../../middleware/auth';
import { getTenantContext } from '../../middleware/tenant';
import { requireRole } from '../../middleware/rbac';
import { ApiError } from '../../middleware/error-handler';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../../utils/auditoria';
import {
  invalidateMaterializedStats,
  normalizeTipoTreinamento,
  publishQualificacaoEvent,
  resolveCargaHorariaByTipo,
} from './historico-helpers';
import { assertQualificacaoAtribuicaoWithinOperationalScope } from '../../services/operational-domain-access';
import { ensureCertificateForQualification } from '../../services/ensure-certificate';
import {
  calculateQualificationExpiry,
  createQualificationHistoryAtomic,
  QualificationAtomicError,
  renewQualificationHistoryAtomic,
  resolveEffectiveValidityMonths,
  settleQualificationComplementaryEffects,
  type QualificationTrainingType,
  type RequiredQualificationRelation,
} from '../../services/qualification-history-atomic';

const router = new Hono<{ Bindings: Env }>();

type QualificationTypeRow = {
  id: number;
  codigo: string;
  categoria: string | null;
  validade: number | string | null;
  carga_horaria: number | null;
  carga_horaria_inicial: number | null;
  carga_horaria_recorrente: number | null;
};

type EmployeeRow = { id: number; nascimento: string | null };

type RenewalSourceRow = {
  id: number;
  funcionario_id: number;
  qualificacao_id: number | null;
  qualificacao_codigo: string | null;
  categoria: string | null;
  data_conclusao: string | null;
  data_vencimento: string | null;
  validade_meses: number | null;
  instrutor: string | null;
  observacoes: string | null;
  renovada: number | null;
  nascimento: string | null;
};

const createSchema = z
  .object({
    funcionario_id: z.number().int().positive().optional(),
    funcionario_cpf: z.string().trim().min(1).optional(),
    qualificacao_codigo: z.string().trim().min(1),
    tipo_treinamento: z
      .enum(['INICIAL', 'RECORRENTE', 'SEMESTRAL', 'UPGRADE', 'ESPECIFICO'])
      .optional(),
    data_conclusao: z.string().trim().min(1),
    data_vencimento: z.string().trim().min(1).nullable().optional(),
    instrutor_id: z.number().int().positive().optional(),
    instrutor: z.string().trim().max(200).optional(),
    observacoes: z.string().nullable().optional(),
    status: z.string().optional().default('CONCLUIDA'),
  })
  .refine((data) => data.funcionario_id !== undefined || data.funcionario_cpf !== undefined, {
    message: 'funcionario_id ou funcionario_cpf é obrigatório',
  });

const renewSchema = z
  .object({
    nova_data_vencimento: z.string().trim().min(1).optional(),
    nova_data_conclusao: z.string().trim().min(1).optional(),
    observacao: z.string().optional(),
  })
  .refine((data) => data.nova_data_vencimento || data.nova_data_conclusao, {
    message: 'Nova data de conclusão/realização é obrigatória',
  });

function normalizeCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function normalizeWritableStatus(value: unknown): 'PLANEJADA' | 'CONCLUIDA' | null {
  const normalized = normalizeCode(value);
  if (normalized === 'PLANEJADA' || normalized === 'PLANEJADO') return 'PLANEJADA';
  if (normalized === 'CONCLUIDA' || normalized === 'CONCLUIDO') return 'CONCLUIDA';
  return null;
}

function isFutureIsoDate(value: string): boolean {
  return value > new Date().toISOString().slice(0, 10);
}

async function loadEmployee(
  db: D1Database,
  empresaId: number,
  params: { funcionarioId?: number; cpf?: string },
): Promise<EmployeeRow | null> {
  if (params.funcionarioId) {
    return db
      .prepare(
        `SELECT id, nascimento
           FROM funcionarios
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(params.funcionarioId, empresaId)
      .first<EmployeeRow>();
  }

  return db
    .prepare(
      `SELECT id, nascimento
         FROM funcionarios
        WHERE cpf = ? AND empresa_id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(params.cpf || '', empresaId)
    .first<EmployeeRow>();
}

async function loadQualificationTypeByCode(
  db: D1Database,
  empresaId: number,
  code: string,
): Promise<QualificationTypeRow | null> {
  return db
    .prepare(
      `SELECT id, codigo, categoria, validade, carga_horaria,
              carga_horaria_inicial, carga_horaria_recorrente
         FROM qualificacoes_tipos
        WHERE UPPER(TRIM(COALESCE(codigo, ''))) = UPPER(TRIM(?))
          AND empresa_id = ?
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(code, empresaId)
    .first<QualificationTypeRow>();
}

async function loadQualificationTypeForRenewal(
  db: D1Database,
  empresaId: number,
  source: RenewalSourceRow,
): Promise<QualificationTypeRow | null> {
  return db
    .prepare(
      `SELECT id, codigo, categoria, validade, carga_horaria,
              carga_horaria_inicial, carga_horaria_recorrente
         FROM qualificacoes_tipos
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND (
            (? IS NOT NULL AND id = ?)
            OR UPPER(TRIM(COALESCE(codigo, ''))) =
               UPPER(TRIM(COALESCE(?, '')))
          )
        ORDER BY CASE WHEN (? IS NOT NULL AND id = ?) THEN 0 ELSE 1 END,
                 id DESC
        LIMIT 1`,
    )
    .bind(
      empresaId,
      source.qualificacao_id,
      source.qualificacao_id,
      source.qualificacao_codigo,
      source.qualificacao_id,
      source.qualificacao_id,
    )
    .first<QualificationTypeRow>();
}

async function resolveInstructorName(
  db: D1Database,
  empresaId: number,
  params: { instructorId?: number; instructorName?: string },
): Promise<string | null> {
  if (params.instructorId) {
    const row = await db
      .prepare(
        `SELECT nome, guerra
           FROM funcionarios
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(params.instructorId, empresaId)
      .first<{ nome: string | null; guerra: string | null }>();

    if (!row) {
      throw new QualificationAtomicError(
        'INVALID_QUALIFICATION_INSTRUCTOR',
        400,
        'Instrutor inválido para a empresa informada',
      );
    }
    return String(row.guerra || row.nome || '').trim() || null;
  }
  return String(params.instructorName || '').trim() || null;
}

async function buildRequiredG1SemRelation(
  db: D1Database,
  empresaId: number,
  completionDate: string,
): Promise<RequiredQualificationRelation> {
  const g1SemType = await loadQualificationTypeByCode(db, empresaId, 'G1-SEM');
  if (!g1SemType) {
    throw new QualificationAtomicError(
      'QUALIFICATION_REQUIRED_RELATION_MISSING',
      409,
      'O tipo obrigatório G1-SEM não está configurado para este tenant',
    );
  }

  return {
    qualificationId: g1SemType.id,
    qualificationCode: 'G1-SEM',
    category: g1SemType.categoria,
    expiryDate: calculateQualificationExpiry({
      completionDate,
      validityMonths: 6,
      endOfMonth: false,
    }),
    validityMonths: 6,
    workload: resolveCargaHorariaByTipo({
      tipoTreinamento: 'SEMESTRAL',
      cargaInicial: g1SemType.carga_horaria_inicial,
      cargaRecorrente: g1SemType.carga_horaria_recorrente,
      cargaPadrao: g1SemType.carga_horaria,
    }),
    trainingType: 'SEMESTRAL',
    status: 'CONCLUIDA',
  };
}

function resolveTrainingType(
  requested: string | null | undefined,
  validityMonths: number | null,
  fallback: QualificationTrainingType,
): QualificationTrainingType {
  if (validityMonths === 6) return 'SEMESTRAL';
  return (normalizeTipoTreinamento(requested) as QualificationTrainingType | null) || fallback;
}

function atomicErrorResponse(c: Context<{ Bindings: Env }>, error: unknown): Response {
  if (error instanceof QualificationAtomicError) {
    return c.json(
      {
        success: false,
        operation_state: 'not_performed',
        error: error.message,
        code: error.code,
      },
      error.httpStatus as 400 | 404 | 409 | 500,
    );
  }

  if (error instanceof ApiError) {
    return c.json(
      {
        success: false,
        operation_state: 'not_performed',
        error: error.message,
        code: error.code,
      },
      error.statusCode as 400 | 401 | 403 | 404 | 500 | 503,
    );
  }

  console.error('[qualificacoes/atomic-write] unexpected error', error);
  return c.json(
    {
      success: false,
      operation_state: 'not_performed',
      error: 'Erro ao persistir qualificação',
      code: 'QUALIFICATION_ATOMIC_WRITE_FAILED',
    },
    500,
  );
}

async function processCreateComplementaryEffects(params: {
  c: Context<{ Bindings: Env }>;
  historyId: number;
  funcionarioId: number;
  qualificationCode: string;
  completionDate: string;
  expiryDate: string | null;
  status: 'PLANEJADA' | 'CONCLUIDA';
  action: 'created' | 'updated' | 'idempotent';
  previousHistoryId: number | null;
}): Promise<string[]> {
  if (params.action === 'idempotent') return [];

  const tenantCtx = getTenantContext(params.c);
  const auditUser = extrairUsuarioAuditoria(params.c);
  const effects: Record<string, () => Promise<unknown>> = {
    cache: () => invalidateMaterializedStats(params.c.env.DB),
    audit: () =>
      registrarAuditoria({
        db: params.c.env.DB,
        tabela: 'qualificacoes_historico',
        acao: params.action === 'created' ? 'INSERT' : 'UPDATE',
        registro_id: params.historyId,
        dados_novos: {
          funcionario_id: params.funcionarioId,
          qualificacao_codigo: params.qualificationCode,
          data_conclusao: params.completionDate,
          data_vencimento: params.expiryDate,
          registro_anterior_renovado_id: params.previousHistoryId,
          atomic: true,
        },
        ...auditUser,
      }),
    event: () =>
      publishQualificacaoEvent(
        params.c.env.DB,
        'created',
        params.funcionarioId,
        params.qualificationCode,
        {
          registro_id: params.historyId,
          data_conclusao: params.completionDate,
          data_vencimento: params.expiryDate,
        },
      ),
  };

  if (params.status === 'CONCLUIDA') {
    effects.certificate = () =>
      ensureCertificateForQualification(
        params.c.env,
        params.historyId,
        tenantCtx.empresaId,
      );
  }

  const pending = await settleQualificationComplementaryEffects(effects);
  if (pending.length > 0) {
    console.error('[qualificacoes/atomic-write] complementary processing pending', {
      historyId: params.historyId,
      pending,
    });
  }
  return pending;
}

async function processRenewComplementaryEffects(params: {
  c: Context<{ Bindings: Env }>;
  sourceHistoryId: number;
  successorHistoryId: number;
  funcionarioId: number;
  qualificationCode: string;
  completionDate: string;
  expiryDate: string | null;
  action: 'created' | 'idempotent';
}): Promise<string[]> {
  if (params.action === 'idempotent') return [];

  const tenantCtx = getTenantContext(params.c);
  const auditUser = extrairUsuarioAuditoria(params.c);
  const pending = await settleQualificationComplementaryEffects({
    cache: () => invalidateMaterializedStats(params.c.env.DB),
    audit: () =>
      registrarAuditoria({
        db: params.c.env.DB,
        tabela: 'qualificacoes_historico',
        acao: 'UPDATE',
        registro_id: params.sourceHistoryId,
        dados_novos: {
          acao: 'RENOVAR',
          novo_id: params.successorHistoryId,
          atomic: true,
        },
        ...auditUser,
      }),
    event: () =>
      publishQualificacaoEvent(
        params.c.env.DB,
        'renewed',
        params.funcionarioId,
        params.qualificationCode,
        {
          registro_anterior_id: params.sourceHistoryId,
          novo_registro_id: params.successorHistoryId,
          data_conclusao: params.completionDate,
          data_vencimento: params.expiryDate,
        },
      ),
    certificate: () =>
      ensureCertificateForQualification(
        params.c.env,
        params.successorHistoryId,
        tenantCtx.empresaId,
      ),
  });

  if (pending.length > 0) {
    console.error('[qualificacoes/atomic-write] renewal complementary processing pending', {
      historyId: params.successorHistoryId,
      pending,
    });
  }
  return pending;
}

router.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const tenantCtx = getTenantContext(c);
    const parsed = createSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          operation_state: 'not_performed',
          error: 'Dados inválidos',
          details: parsed.error.flatten().fieldErrors,
        },
        400,
      );
    }

    const employee = await loadEmployee(c.env.DB, tenantCtx.empresaId, {
      funcionarioId: parsed.data.funcionario_id,
      cpf: parsed.data.funcionario_cpf,
    });
    if (!employee) {
      return c.json(
        {
          success: false,
          operation_state: 'not_performed',
          error: 'Funcionário não encontrado neste tenant',
        },
        404,
      );
    }

    const qualificationCode = normalizeCode(parsed.data.qualificacao_codigo);
    const type = await loadQualificationTypeByCode(
      c.env.DB,
      tenantCtx.empresaId,
      qualificationCode,
    );
    if (!type) {
      return c.json(
        {
          success: false,
          operation_state: 'not_performed',
          error: `Tipo de qualificação ${qualificationCode} não encontrado neste tenant`,
        },
        404,
      );
    }

    await assertQualificacaoAtribuicaoWithinOperationalScope({
      db: c.env.DB,
      empresaId: tenantCtx.empresaId,
      userId: Number((c.get as (key: string) => unknown)('userId') || 0),
      userRole: (c.get as (key: string) => unknown)('userRole'),
      qualificacaoTipoId: type.id,
      funcionarioId: employee.id,
    });

    const effectiveValidity = resolveEffectiveValidityMonths({
      qualificationCode,
      typeValidityMonths: type.validade,
      birthDate: employee.nascimento,
      completionDate: parsed.data.data_conclusao,
    });
    const expiryDate = calculateQualificationExpiry({
      completionDate: parsed.data.data_conclusao,
      explicitExpiryDate: parsed.data.data_vencimento,
      validityMonths: effectiveValidity,
      endOfMonth: false,
    });

    let status = normalizeWritableStatus(parsed.data.status);
    if (!status) {
      return c.json(
        {
          success: false,
          operation_state: 'not_performed',
          error: 'Status inválido. Use PLANEJADA/PLANEJADO ou CONCLUIDA/CONCLUIDO.',
        },
        400,
      );
    }
    if (isFutureIsoDate(parsed.data.data_conclusao)) status = 'PLANEJADA';

    const trainingType = resolveTrainingType(
      parsed.data.tipo_treinamento,
      effectiveValidity,
      'INICIAL',
    );
    const workload = resolveCargaHorariaByTipo({
      tipoTreinamento: trainingType,
      cargaInicial: type.carga_horaria_inicial,
      cargaRecorrente: type.carga_horaria_recorrente,
      cargaPadrao: type.carga_horaria,
    });
    const instructor = await resolveInstructorName(c.env.DB, tenantCtx.empresaId, {
      instructorId: parsed.data.instrutor_id,
      instructorName: parsed.data.instrutor,
    });
    const requiredRelation =
      qualificationCode === 'G1'
        ? await buildRequiredG1SemRelation(
            c.env.DB,
            tenantCtx.empresaId,
            parsed.data.data_conclusao,
          )
        : null;

    const core = await createQualificationHistoryAtomic(c.env.DB, {
      empresaId: tenantCtx.empresaId,
      funcionarioId: employee.id,
      qualificationId: type.id,
      qualificationCode,
      category: type.categoria,
      completionDate: parsed.data.data_conclusao,
      expiryDate,
      validityMonths: effectiveValidity,
      instructor,
      observations: parsed.data.observacoes || null,
      status,
      workload,
      trainingType,
      requiredRelation,
    });

    const pendingEffects = await processCreateComplementaryEffects({
      c,
      historyId: core.id,
      funcionarioId: employee.id,
      qualificationCode,
      completionDate: parsed.data.data_conclusao,
      expiryDate,
      status,
      action: core.action,
      previousHistoryId: core.previousHistoryId,
    });

    return c.json(
      {
        success: true,
        operation_state:
          pendingEffects.length > 0 ? 'core_completed_pending' : 'completed',
        message:
          core.action === 'idempotent'
            ? 'Qualificação já existia; estado confirmado'
            : core.action === 'updated'
              ? 'Qualificação planejada atualizada com sucesso'
              : 'Qualificação criada com sucesso',
        pending_effects: pendingEffects,
        data: {
          id: core.id,
          funcionario_id: employee.id,
          qualificacao_id: type.id,
          qualificacao_codigo: qualificationCode,
          categoria: type.categoria,
          tipo_treinamento: trainingType,
          data_conclusao: parsed.data.data_conclusao,
          data_vencimento: expiryDate,
          validade_meses: effectiveValidity,
          status,
          carga_horaria: workload,
          registro_anterior_renovado_id: core.previousHistoryId,
          relacao_obrigatoria_id: core.relationHistoryId,
          idempotent: core.action === 'idempotent',
        },
      },
      core.action === 'created' ? 201 : 200,
    );
  } catch (error) {
    return atomicErrorResponse(c, error);
  }
});

router.post('/:id/renovar', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const tenantCtx = getTenantContext(c);
    const sourceHistoryId = Number(c.req.param('id'));
    if (!Number.isInteger(sourceHistoryId) || sourceHistoryId <= 0) {
      return c.json(
        {
          success: false,
          operation_state: 'not_performed',
          error: 'ID inválido',
        },
        400,
      );
    }

    const parsed = renewSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          operation_state: 'not_performed',
          error: 'Dados inválidos',
          details: parsed.error.flatten().fieldErrors,
        },
        400,
      );
    }

    const source = await c.env.DB.prepare(
      `SELECT qh.id,
              qh.funcionario_id,
              qh.qualificacao_id,
              qh.qualificacao_codigo,
              qh.categoria,
              qh.data_conclusao,
              qh.data_vencimento,
              qh.validade_meses,
              qh.instrutor,
              qh.observacoes,
              qh.renovada,
              f.nascimento
         FROM qualificacoes_historico qh
         INNER JOIN funcionarios f
           ON f.id = qh.funcionario_id
          AND f.empresa_id = qh.empresa_id
          AND f.deleted_at IS NULL
        WHERE qh.id = ?
          AND qh.empresa_id = ?
          AND qh.deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(sourceHistoryId, tenantCtx.empresaId)
      .first<RenewalSourceRow>();

    if (!source) {
      return c.json(
        {
          success: false,
          operation_state: 'not_performed',
          error: 'Qualificação não encontrada neste tenant',
        },
        404,
      );
    }

    const type = await loadQualificationTypeForRenewal(
      c.env.DB,
      tenantCtx.empresaId,
      source,
    );
    if (!type) {
      return c.json(
        {
          success: false,
          operation_state: 'not_performed',
          error: 'Tipo da qualificação não encontrado neste tenant',
          code: 'QUALIFICATION_TYPE_NOT_FOUND',
        },
        409,
      );
    }

    await assertQualificacaoAtribuicaoWithinOperationalScope({
      db: c.env.DB,
      empresaId: tenantCtx.empresaId,
      userId: Number((c.get as (key: string) => unknown)('userId') || 0),
      userRole: (c.get as (key: string) => unknown)('userRole'),
      qualificacaoTipoId: type.id,
      funcionarioId: source.funcionario_id,
    });

    const completionDate =
      parsed.data.nova_data_conclusao || parsed.data.nova_data_vencimento || '';
    const qualificationCode = normalizeCode(source.qualificacao_codigo || type.codigo);
    const sourceValidity =
      source.validade_meses !== null && source.validade_meses !== undefined
        ? source.validade_meses
        : type.validade;
    const effectiveValidity = resolveEffectiveValidityMonths({
      qualificationCode,
      typeValidityMonths: sourceValidity,
      birthDate: source.nascimento,
      completionDate,
    });
    const expiryDate = calculateQualificationExpiry({
      completionDate,
      validityMonths: effectiveValidity,
      endOfMonth: qualificationCode !== 'G1-SEM',
    });
    const trainingType = resolveTrainingType(
      effectiveValidity === 6 ? 'SEMESTRAL' : 'RECORRENTE',
      effectiveValidity,
      'RECORRENTE',
    );
    const workload = resolveCargaHorariaByTipo({
      tipoTreinamento: trainingType,
      cargaInicial: type.carga_horaria_inicial,
      cargaRecorrente: type.carga_horaria_recorrente,
      cargaPadrao: type.carga_horaria,
    });
    const requiredRelation =
      qualificationCode === 'G1'
        ? await buildRequiredG1SemRelation(
            c.env.DB,
            tenantCtx.empresaId,
            completionDate,
          )
        : null;

    const core = await renewQualificationHistoryAtomic(c.env.DB, {
      empresaId: tenantCtx.empresaId,
      sourceHistoryId,
      qualificationId: type.id,
      qualificationCode,
      category: source.categoria || type.categoria,
      completionDate,
      expiryDate,
      validityMonths: effectiveValidity,
      instructor: source.instrutor,
      observations: parsed.data.observacao
        ? `Renovação de #${sourceHistoryId}. ${parsed.data.observacao}`
        : `Renovação de #${sourceHistoryId}`,
      status: 'CONCLUIDA',
      workload,
      trainingType,
      requiredRelation,
    });

    const pendingEffects = await processRenewComplementaryEffects({
      c,
      sourceHistoryId,
      successorHistoryId: core.id,
      funcionarioId: source.funcionario_id,
      qualificationCode,
      completionDate,
      expiryDate,
      action: core.action === 'created' ? 'created' : 'idempotent',
    });

    return c.json({
      success: true,
      operation_state:
        pendingEffects.length > 0 ? 'core_completed_pending' : 'completed',
      message:
        core.action === 'idempotent'
          ? 'Qualificação já havia sido renovada; estado confirmado'
          : 'Qualificação renovada com sucesso',
      pending_effects: pendingEffects,
      data: {
        registro_anterior_id: sourceHistoryId,
        novo_registro_id: core.id,
        nova_data_conclusao: completionDate,
        nova_data_vencimento: expiryDate,
        validade_meses: effectiveValidity,
        tipo_treinamento: trainingType,
        carga_horaria: workload,
        relacao_obrigatoria_id: core.relationHistoryId,
        idempotent: core.action === 'idempotent',
      },
    });
  } catch (error) {
    return atomicErrorResponse(c, error);
  }
});

export default router;
