/**
 * FRMS — Relatórios, Configurações e Notificações
 * Routes:
 *   GET /relatorios/individual/:tripulante_id
 *   GET /relatorios/compliance
 *   GET /relatorios/mapa-fadiga
 *   GET /relatorios/alertas-historico
 *   GET /limites
 *   GET/PUT /configuracoes
 *   POST /configuracoes/restaurar
 *   GET/PUT /configuracoes/notificacoes
 *   GET/PUT /notificacoes
 *   PUT /notificacoes/:id/ler
 *   PUT /notificacoes/ler-todas
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { requireRole } from '../middleware/rbac';
import {
  relatorioIndividual,
  relatorioCompliance,
  relatorioMapaFadiga,
  buscarAlertas,
  carregarLimites,
  buscarConfiguracoes,
  createRevisionAndRecalcRun,
  listFrmsConfigurationHistory,
  loadEffectiveFrmsConfiguration,
  loadFrmsRecalcRun,
  loadRestorableFrmsRevision,
  runGovernedRecalc,
  buscarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
} from '../lib/frms/db-service';
import {
  FRMS_APPROVED_OPERATIONAL_POLICY_SOURCE,
  FrmsParameterResolutionError,
} from '../lib/frms/parameter-governance';
import {
  safe,
  type FrmsAppContext,
  getEmpresaIdSafe,
  auditFrms,
  assertTripulanteEmpresa,
  resolveFuncionarioId,
  requirePlatformAdmin,
} from './frms-shared';

const frmsRelatoriosConfig = new Hono<{ Bindings: Env; Variables: { userId?: string } }>();

const GOVERNED_SOURCE_TYPES = [
  'REGULATORY',
  'REGULATORY_CONTEXT_BASELINE',
  'OPERATIONAL_POLICY_WITH_REGULATORY_CONTEXT',
  'UNVERIFIED_OPERATIONAL_POLICY',
  FRMS_APPROVED_OPERATIONAL_POLICY_SOURCE,
] as const;

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function frmsConfigurationUnavailable(c: FrmsAppContext, error: unknown) {
  const code = error instanceof FrmsParameterResolutionError ? error.code : 'FRMS_CONTEXT_UNAVAILABLE';
  return c.json(
    {
      success: false,
      error: 'Configuração FRMS efetiva indisponível para este tenant. Nenhum valor padrão foi aplicado.',
      code,
      state: 'UNKNOWN',
    },
    503,
  );
}

function sameParameterKeys(
  expected: readonly { parameter_key: string; numeric_value: number | null }[],
  submitted: readonly { key: string; value: number }[],
): boolean {
  const expectedKeys = new Set(expected.filter((parameter) => parameter.numeric_value != null).map((parameter) => parameter.parameter_key));
  const submittedKeys = new Set(submitted.map((parameter) => parameter.key));
  return expectedKeys.size === submitted.length
    && submittedKeys.size === submitted.length
    && [...expectedKeys].every((key) => submittedKeys.has(key));
}

// ════════════════════════════════════════════════════════
// RELATÓRIOS
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/relatorios/individual/:tripulante_id
 * Query: ?mes=2026-02
 */
frmsRelatoriosConfig.get(
  '/relatorios/individual/:tripulante_id',
  safe(async (c) => {
    const tripulanteId = c.req.param('tripulante_id') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;

    const empresaId = getEmpresaIdSafe(c);
    const mes = c.req.query('mes') || new Date().toISOString().slice(0, 7);
    const result = await relatorioIndividual(c.env.DB, tripulanteId, mes, empresaId);
    return c.json({ success: true, data: result });
  }),
);

/**
 * GET /api/frms/relatorios/compliance
 * Query: ?mes=2026-02
 */
frmsRelatoriosConfig.get(
  '/relatorios/compliance',
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const mes = c.req.query('mes') || new Date().toISOString().slice(0, 7);
    const result = await relatorioCompliance(c.env.DB, mes, empresaId);
    return c.json({ success: true, data: result });
  }),
);

/**
 * GET /api/frms/relatorios/mapa-fadiga
 */
frmsRelatoriosConfig.get(
  '/relatorios/mapa-fadiga',
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      return c.json({ success: false, error: 'Tenant context ausente.', code: 'FRMS_CONTEXT_UNAVAILABLE' }, 403);
    }
    c.header('Cache-Control', 'private, max-age=3600');
    c.header('Vary', 'Authorization');
    const result = await relatorioMapaFadiga(c.env.DB, empresaId);
    return c.json({ success: true, data: result });
  }),
);

/**
 * GET /api/frms/relatorios/alertas-historico
 * Query: ?data_inicio= &data_fim=
 */
frmsRelatoriosConfig.get(
  '/relatorios/alertas-historico',
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const result = await buscarAlertas(
      c.env.DB,
      {
        data_inicio: c.req.query('data_inicio') ?? undefined,
        data_fim: c.req.query('data_fim') ?? undefined,
        limit: 500,
      },
      empresaId,
    );
    return c.json({ success: true, data: result.alertas, total: result.total });
  }),
);

// ════════════════════════════════════════════════════════
// CONFIGURAÇÃO DE LIMITES (admin)
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/limites
 * Retorna configuração atual de limites
 */
frmsRelatoriosConfig.get(
  '/limites',
  safe(async (c) => {
    const limites = await carregarLimites(c.env.DB);
    return c.json({ success: true, data: limites });
  }),
);

// ════════════════════════════════════════════════════════
// CONFIGURAÇÃO CIENTÍFICA (admin)
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/configuracoes
 * Compatibilidade de leitura para consumidores legados. Não é uma fonte
 * operacional tenant-aware e a UI FRMS não deve mais chamá-lo.
 */
frmsRelatoriosConfig.get(
  '/configuracoes',
  safe(async (c) => {
    const configs = await buscarConfiguracoes(c.env.DB);
    const limites = await carregarLimites(c.env.DB);
    return c.json({
      success: true,
      data: { configs, limites },
      deprecated: true,
      operational: false,
      replacement: '/api/frms/configuracoes/governadas',
    });
  }),
);

/**
 * PUT /api/frms/configuracoes
 * Legacy global writer retained only as an explicit fail-closed compatibility
 * response. It must never mutate shared operational configuration.
 */
frmsRelatoriosConfig.put(
  '/configuracoes',
  safe(async (c) => {
    const denied = await requirePlatformAdmin(c);
    if (denied) return denied;
    return c.json(
      {
        success: false,
        error: 'A escrita global de parâmetros FRMS foi retirada do caminho operacional.',
        code: 'FRMS_LEGACY_CONFIGURATION_WRITE_RETIRED',
        replacement: '/api/frms/configuracoes/governadas',
      },
      410,
    );
  }),
);

/**
 * GET /api/frms/configuracoes/governadas
 *
 * Returns only the current tenant's effective immutable revision. Missing,
 * invalid or ambiguous governance state is a 503/UNKNOWN; there is no global
 * table or code-default fallback in this administrative path.
 */
frmsRelatoriosConfig.get(
  '/configuracoes/governadas',
  requireRole('admin'),
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) return frmsConfigurationUnavailable(c, new Error('tenant context absent'));
    try {
      const effective = await loadEffectiveFrmsConfiguration(c.env.DB, empresaId, isoDateToday());
      return c.json({
        success: true,
        data: {
          revision: effective.revision,
          profile_code: effective.profileCode,
          regulatory_profile_id: effective.regulatoryProfileId,
          model_version: effective.modelVersion,
          effective_from: effective.revision.effective_from,
          effective_to: effective.revision.effective_to,
          limites: effective.values,
          parameters: effective.parameters,
        },
      });
    } catch (error) {
      return frmsConfigurationUnavailable(c, error);
    }
  }),
);

/** Tenant/profile-scoped immutable history for audit and restore selection. */
frmsRelatoriosConfig.get(
  '/configuracoes/governadas/historico',
  requireRole('admin'),
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) return frmsConfigurationUnavailable(c, new Error('tenant context absent'));
    try {
      const effective = await loadEffectiveFrmsConfiguration(c.env.DB, empresaId, isoDateToday());
      const history = await listFrmsConfigurationHistory(c.env.DB, empresaId, effective.profileCode);
      return c.json({ success: true, data: history });
    } catch (error) {
      return frmsConfigurationUnavailable(c, error);
    }
  }),
);

/**
 * Creates a tenant-scoped immutable revision. Scope and regulatory profile are
 * resolved from the authenticated tenant; empresa_id/profile IDs in the body
 * are rejected rather than trusted.
 */
frmsRelatoriosConfig.put(
  '/configuracoes/governadas',
  requireRole('admin'),
  safe(async (c) => {
    const schema = z.object({
      source_type: z.enum(GOVERNED_SOURCE_TYPES),
      source_reference: z.string().trim().min(3),
      policy_version: z.string().min(1),
      effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      reason: z.string().trim().min(3),
      parameters: z.array(z.object({ key: z.string().min(1), value: z.number().finite() })).min(1),
    }).strict();
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ success: false, error: parsed.error.flatten() }, 400);
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) return frmsConfigurationUnavailable(c, new Error('tenant context absent'));
    if (parsed.data.effective_from < isoDateToday()) {
      return c.json({ success: false, error: 'Revisões FRMS não podem alterar vigência histórica.', code: 'FRMS_HISTORICAL_WRITE_FORBIDDEN' }, 400);
    }
    try {
      const effective = await loadEffectiveFrmsConfiguration(c.env.DB, empresaId, isoDateToday());
      if (!sameParameterKeys(effective.parameters, parsed.data.parameters)) {
        return c.json({
          success: false,
          error: 'A revisão deve conter exatamente todas as chaves numéricas da configuração efetiva.',
          code: 'FRMS_PARAMETER_SET_MISMATCH',
        }, 400);
      }
      const submitted = new Map(parsed.data.parameters.map((parameter) => [parameter.key, parameter.value]));
      const created = await createRevisionAndRecalcRun(c.env.DB, {
        empresaId,
        profileCode: effective.profileCode,
        sourceType: parsed.data.source_type,
        sourceReference: parsed.data.source_reference,
        regulatoryProfileId: effective.regulatoryProfileId,
        policyVersion: parsed.data.policy_version,
        effectiveFrom: parsed.data.effective_from,
        effectiveTo: parsed.data.effective_to ?? null,
        actorUserId: c.get('userId') == null ? null : String(c.get('userId')),
        reason: parsed.data.reason,
        parameters: effective.parameters.map((parameter) => ({
          key: parameter.parameter_key,
          value: submitted.get(parameter.parameter_key) as number,
          unit: parameter.unit,
          metric: parameter.metric,
          windowKind: parameter.window_kind,
          direction: parameter.direction,
        })),
      });
      const run = await loadFrmsRecalcRun(c.env.DB, created.runId);
      c.executionCtx.waitUntil(runGovernedRecalc(c.env.DB, run));
      await auditFrms(c, 'frms_config_revisions', 'INSERT', created.revisionId, {
        depois: {
          empresa_id: empresaId,
          profile_code: effective.profileCode,
          source_type: parsed.data.source_type,
          source_reference: parsed.data.source_reference,
          policy_version: parsed.data.policy_version,
          effective_from: parsed.data.effective_from,
          effective_to: parsed.data.effective_to ?? null,
          reason: parsed.data.reason,
          supersedes_revision_id: created.previousRevisionId,
        },
      });
      return c.json({ success: true, data: { revision_id: created.revisionId, run_id: created.runId, status: 'PENDING' } });
    } catch (error) {
      return frmsConfigurationUnavailable(c, error);
    }
  }),
);

/**
 * POST /api/frms/configuracoes/restaurar
 * Legacy global restore is intentionally retired. See the governed endpoint
 * below, which clones an explicit persisted revision instead of LIMITES_DEFAULT.
 */
frmsRelatoriosConfig.post(
  '/configuracoes/restaurar',
  safe(async (c) => {
    const denied = await requirePlatformAdmin(c);
    if (denied) return denied;

    return c.json(
      {
        success: false,
        error: 'Restaurar padrões globais foi retirado. Selecione uma revisão persistida do histórico governado.',
        code: 'FRMS_LEGACY_CONFIGURATION_RESTORE_RETIRED',
        replacement: '/api/frms/configuracoes/governadas/restaurar',
      },
      410,
    );
  }),
);

/**
 * Restores values only by creating a new tenant revision from an explicit,
 * persisted history entry. Code constants are never consulted.
 */
frmsRelatoriosConfig.post(
  '/configuracoes/governadas/restaurar',
  requireRole('admin'),
  safe(async (c) => {
    const schema = z.object({
      baseline_revision_id: z.string().min(1),
      effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      reason: z.string().trim().min(3),
    }).strict();
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ success: false, error: parsed.error.flatten() }, 400);
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) return frmsConfigurationUnavailable(c, new Error('tenant context absent'));
    if (parsed.data.effective_from < isoDateToday()) {
      return c.json({ success: false, error: 'Revisões FRMS não podem alterar vigência histórica.', code: 'FRMS_HISTORICAL_WRITE_FORBIDDEN' }, 400);
    }
    try {
      const effective = await loadEffectiveFrmsConfiguration(c.env.DB, empresaId, isoDateToday());
      const baseline = await loadRestorableFrmsRevision(
        c.env.DB,
        empresaId,
        effective.profileCode,
        parsed.data.baseline_revision_id,
      );
      if (!sameParameterKeys(effective.parameters, baseline.parameters.map((parameter) => ({
        key: parameter.parameter_key,
        value: Number(parameter.numeric_value),
      })))) {
        return c.json({ success: false, error: 'A revisão de restauração não possui o conjunto completo de parâmetros.', code: 'FRMS_RESTORE_BASELINE_INVALID' }, 400);
      }
      const created = await createRevisionAndRecalcRun(c.env.DB, {
        empresaId,
        profileCode: effective.profileCode,
        sourceType: baseline.revision.source_type,
        sourceReference: `${baseline.revision.source_reference ?? 'Revisão persistida'}; restaurada de ${baseline.revision.id}`,
        regulatoryProfileId: effective.regulatoryProfileId,
        policyVersion: baseline.revision.policy_version,
        effectiveFrom: parsed.data.effective_from,
        effectiveTo: parsed.data.effective_to ?? null,
        actorUserId: c.get('userId') == null ? null : String(c.get('userId')),
        reason: parsed.data.reason,
        parameters: baseline.parameters.map((parameter) => ({
          key: parameter.parameter_key,
          value: Number(parameter.numeric_value),
          unit: parameter.unit,
          metric: parameter.metric,
          windowKind: parameter.window_kind,
          direction: parameter.direction,
        })),
      });
      const run = await loadFrmsRecalcRun(c.env.DB, created.runId);
      c.executionCtx.waitUntil(runGovernedRecalc(c.env.DB, run));
      await auditFrms(c, 'frms_config_revisions', 'INSERT', created.revisionId, {
        depois: {
          empresa_id: empresaId,
          restored_from_revision_id: baseline.revision.id,
          policy_version: baseline.revision.policy_version,
          effective_from: parsed.data.effective_from,
          reason: parsed.data.reason,
        },
      });
      return c.json({ success: true, data: { revision_id: created.revisionId, run_id: created.runId, status: 'PENDING' } });
    } catch (error) {
      return frmsConfigurationUnavailable(c, error);
    }
  }),
);

// ════════════════════════════════════════════════════════
// CONFIGURAÇÃO DE NOTIFICAÇÕES POR CARGO
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/configuracoes/notificacoes
 * Retorna a configuração de notificações por cargo (quem recebe qual nível mínimo de alerta).
 */
frmsRelatoriosConfig.get(
  '/configuracoes/notificacoes',
  safe(async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT id, cargo, nivel_minimo, ativo FROM frms_notificacao_config WHERE deleted_at IS NULL ORDER BY cargo`,
    ).all<{ id: string; cargo: string; nivel_minimo: string; ativo: number }>();
    return c.json({ success: true, data: rows.results ?? [] });
  }),
);

/**
 * PUT /api/frms/configuracoes/notificacoes
 * Upsert de configuração de notificação por cargo.
 * Body: { cargo: string, nivel_minimo: string, ativo: boolean }
 * Requer role admin.
 */
frmsRelatoriosConfig.put(
  '/configuracoes/notificacoes',
  safe(async (c) => {
    const denied = await requirePlatformAdmin(c);
    if (denied) return denied;

    const schema = z.object({
      cargo: z.string().min(1),
      nivel_minimo: z.enum(['AVISO', 'ATENCAO', 'CRITICO', 'VIOLACAO']),
      ativo: z.boolean(),
    });
    const body = await c.req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    const { cargo, nivel_minimo, ativo } = parsed.data;

    // Upsert
    await c.env.DB.prepare(
      `INSERT INTO frms_notificacao_config (id, cargo, nivel_minimo, ativo, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(cargo) DO UPDATE SET
         nivel_minimo = excluded.nivel_minimo,
         ativo = excluded.ativo,
         updated_at = datetime('now'),
         deleted_at = NULL`,
    )
      .bind(cargo, nivel_minimo, ativo ? 1 : 0)
      .run();

    await auditFrms(c, 'frms_notificacao_config', 'UPDATE', cargo, {
      depois: { cargo, nivel_minimo, ativo },
    });

    return c.json({ success: true });
  }),
);

// ════════════════════════════════════════════════════════
// NOTIFICAÇÕES POR CARGO
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/notificacoes
 * Retorna notificações do usuário logado
 * Query: ?lido=false &page=1 &limit=50
 */
frmsRelatoriosConfig.get(
  '/notificacoes',
  safe(async (c) => {
    const userId = await resolveFuncionarioId(c);
    const lido = c.req.query('lido') !== undefined ? c.req.query('lido') === 'true' : undefined;
    const page = c.req.query('page') ? parseInt(c.req.query('page')!) : undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const result = await buscarNotificacoes(c.env.DB, userId, { lido, page, limit });
    return c.json({ success: true, data: result.notificacoes, total: result.total });
  }),
);

/**
 * GET /api/frms/notificacoes/count
 * Conta notificações não lidas (para badge)
 */
frmsRelatoriosConfig.get(
  '/notificacoes/count',
  safe(async (c) => {
    const userId = await resolveFuncionarioId(c);
    const row = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM frms_notificacao_destinatario WHERE funcionario_id = ? AND lido = 0 AND deleted_at IS NULL',
    )
      .bind(userId)
      .first<{ count: number }>();
    return c.json({ success: true, data: { count: row?.count ?? 0 } });
  }),
);

/**
 * PUT /api/frms/notificacoes/:id/ler
 * Marca uma notificação como lida
 */
frmsRelatoriosConfig.put(
  '/notificacoes/:id/ler',
  safe(async (c) => {
    const id = c.req.param('id') ?? '';
    const userId = await resolveFuncionarioId(c);
    await marcarNotificacaoLida(c.env.DB, id, userId);
    return c.json({ success: true });
  }),
);

/**
 * PUT /api/frms/notificacoes/ler-todas
 * Marca todas as notificações do usuário como lidas
 */
frmsRelatoriosConfig.put(
  '/notificacoes/ler-todas',
  safe(async (c) => {
    const userId = await resolveFuncionarioId(c);
    await marcarTodasNotificacoesLidas(c.env.DB, userId);
    return c.json({ success: true });
  }),
);

export default frmsRelatoriosConfig;
