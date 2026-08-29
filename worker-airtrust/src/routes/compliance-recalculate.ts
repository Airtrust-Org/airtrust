// ========================================
// AIRTRUST - COMPLIANCE: RECÁLCULO BATCH
// Endpoint para recalcular compliance em massa
// ========================================

import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import type { AppEnv } from '../types';
import { createLogger, toError } from '../utils/logger';

const app = new Hono<AppEnv>();

app.use('*', auth(), requireRole('admin'));

// ========================================
// SCHEMA DE VALIDAÇÃO
// ========================================

const recalculateSchema = z.object({
  scope: z.enum(['all', 'funcionario', 'tipo_qualificacao']).default('all'),
  entity_id: z.number().optional(),
  dry_run: z.boolean().default(false),
});

// ========================================
// TIPOS
// ========================================

interface RecalculateResponse {
  success: boolean;
  message: string;
  data?: {
    qualificacoes_processadas: number;
    licencas_processadas: number;
    registros_criados: number;
    registros_deletados: number;
    execution_time_ms: number;
  };
  error?: string;
}

interface QualificacaoParaRecalculo {
  id: number;
  funcionario_id: number;
  qualificacao_id: number;
  data_vencimento: string;
  codigo: string;
  nome: string;
}

interface LicencaParaRecalculo {
  id: number;
  funcionario_id: number;
  tipo: string;
  data_vencimento: string;
}

// ========================================
// POST /api/compliance/recalculate
// ========================================

app.post('/recalculate', async (c: Context<AppEnv>) => {
  const startTime = Date.now();

  try {
    // Validar corpo da requisição
    const body = await c.req.json();
    const validatedData = recalculateSchema.parse(body);
    const { scope, entity_id, dry_run } = validatedData;

    const db = c.env.DB;
    const logger = createLogger(c, 'ComplianceRecalculate');
    const empresaId = Number(c.get('empresaId') || 0);

    if (!Number.isFinite(empresaId) || empresaId <= 0) {
      return c.json(
        {
          success: false,
          message: 'Empresa não identificada',
          error: 'TENANT_REQUIRED',
        } satisfies RecalculateResponse,
        401,
      );
    }

    logger.info('Iniciando recálculo de compliance', {
      empresaId,
      scope,
      entityId: entity_id,
      dryRun: dry_run,
    });

    // ========================================
    // 1. BUSCAR QUALIFICAÇÕES A RECALCULAR
    // ========================================

    let qualWhere =
      'WHERE qh.deleted_at IS NULL AND qh.data_vencimento IS NOT NULL AND qh.empresa_id = ?';
    const qualParams: (number | string)[] = [empresaId];

    if (scope === 'funcionario' && entity_id) {
      qualWhere += ' AND qh.funcionario_id = ?';
      qualParams.push(entity_id);
    } else if (scope === 'tipo_qualificacao' && entity_id) {
      qualWhere += ' AND qh.qualificacao_id = ?';
      qualParams.push(entity_id);
    }

    const qualQuery = `
      SELECT 
        qh.id,
        qh.funcionario_id,
        qh.qualificacao_id,
        qh.data_vencimento,
        qt.codigo,
        qt.nome
      FROM qualificacoes_historico qh
      LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
      ${qualWhere}
      ORDER BY qh.funcionario_id, qh.data_vencimento
    `;

    const qualResult = await db
      .prepare(qualQuery)
      .bind(...qualParams)
      .all<QualificacaoParaRecalculo>();
    const qualificacoes = qualResult.results || [];

    logger.info('Qualificações carregadas para recálculo', {
      empresaId,
      totalQualificacoes: qualificacoes.length,
    });

    // ========================================
    // 2. BUSCAR LICENÇAS A RECALCULAR
    // ========================================

    let licWhere =
      'WHERE l.deleted_at IS NULL AND l.data_vencimento IS NOT NULL AND l.empresa_id = ?';
    const licParams: number[] = [empresaId];

    if (scope === 'funcionario' && entity_id) {
      licWhere += ' AND l.funcionario_id = ?';
      licParams.push(entity_id);
    }
    // Note: tipo_qualificacao não se aplica a licenças

    const licQuery = `
      SELECT 
        l.id,
        l.funcionario_id,
        l.tipo,
        l.data_vencimento
      FROM licencas l
      ${licWhere}
      ORDER BY l.funcionario_id, l.data_vencimento
    `;

    const licResult = await db
      .prepare(licQuery)
      .bind(...licParams)
      .all<LicencaParaRecalculo>();
    const licencas = licResult.results || [];

    logger.info('Licenças carregadas para recálculo', {
      empresaId,
      totalLicencas: licencas.length,
    });

    // ========================================
    // 3. DRY RUN - APENAS SIMULAR
    // ========================================

    if (dry_run) {
      const response: RecalculateResponse = {
        success: true,
        message: 'Simulação de recálculo (dry run)',
        data: {
          qualificacoes_processadas: qualificacoes.length,
          licencas_processadas: licencas.length,
          registros_criados: qualificacoes.length + licencas.length,
          registros_deletados: 0,
          execution_time_ms: Date.now() - startTime,
        },
      };
      return c.json(response);
    }

    // ========================================
    // 4. EXECUTAR RECÁLCULO REAL
    // ========================================

    const statements: D1PreparedStatement[] = [];
    let registrosDeletados = 0;

    // 4.1. Soft delete registros existentes (qualificações)
    if (qualificacoes.length > 0) {
      const qualIds = qualificacoes.map((q) => q.id).join(',');
      statements.push(
        db.prepare(`
          UPDATE historico_compliance
          SET deleted_at = datetime('now'),
              updated_at = datetime('now')
          WHERE tipo_recurso = 'qualificacao'
            AND recurso_id IN (${qualIds})
            AND deleted_at IS NULL
        `),
      );
      registrosDeletados += qualificacoes.length;
    }

    // 4.2. Soft delete registros existentes (licenças)
    if (licencas.length > 0) {
      const licIds = licencas.map((l) => l.id).join(',');
      statements.push(
        db.prepare(`
          UPDATE historico_compliance
          SET deleted_at = datetime('now'),
              updated_at = datetime('now')
          WHERE tipo_recurso = 'licenca'
            AND recurso_id IN (${licIds})
            AND deleted_at IS NULL
        `),
      );
      registrosDeletados += licencas.length;
    }

    // 4.3. Inserir novos cálculos (qualificações)
    for (const qual of qualificacoes) {
      const dataVenc = new Date(qual.data_vencimento);
      const hoje = new Date();
      const diasParaVencer = Math.floor(
        (dataVenc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
      );

      let status: 'CONFORME' | 'A_VENCER' | 'VENCIDO' | 'PENDENTE';
      let percentual: number;

      if (diasParaVencer < 0) {
        status = 'VENCIDO';
        percentual = 0.0;
      } else if (diasParaVencer <= 30) {
        status = 'A_VENCER';
        percentual = 75.0; // Parcialmente conforme
      } else {
        status = 'CONFORME';
        percentual = 100.0;
      }

      statements.push(
        db
          .prepare(
            `
          INSERT INTO historico_compliance (
            funcionario_id,
            tipo_recurso,
            recurso_id,
            status_compliance,
            percentual_conformidade,
            data_calculo,
            data_vencimento,
            dias_para_vencer,
            observacoes
          ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
        `,
          )
          .bind(
            qual.funcionario_id,
            'qualificacao',
            qual.id,
            status,
            percentual,
            qual.data_vencimento,
            diasParaVencer,
            'Recálculo manual via API batch',
          ),
      );
    }

    // 4.4. Inserir novos cálculos (licenças)
    for (const lic of licencas) {
      const dataVenc = new Date(lic.data_vencimento);
      const hoje = new Date();
      const diasParaVencer = Math.floor(
        (dataVenc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
      );

      let status: 'CONFORME' | 'A_VENCER' | 'VENCIDO' | 'PENDENTE';
      let percentual: number;

      if (diasParaVencer < 0) {
        status = 'VENCIDO';
        percentual = 0.0;
      } else if (diasParaVencer <= 30) {
        status = 'A_VENCER';
        percentual = 75.0;
      } else {
        status = 'CONFORME';
        percentual = 100.0;
      }

      statements.push(
        db
          .prepare(
            `
          INSERT INTO historico_compliance (
            funcionario_id,
            tipo_recurso,
            recurso_id,
            status_compliance,
            percentual_conformidade,
            data_calculo,
            data_vencimento,
            dias_para_vencer,
            observacoes
          ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
        `,
          )
          .bind(
            lic.funcionario_id,
            'licenca',
            lic.id,
            status,
            percentual,
            lic.data_vencimento,
            diasParaVencer,
            'Recálculo manual via API batch (licença)',
          ),
      );
    }

    // ========================================
    // 5. EXECUTAR BATCH (máximo 100 statements)
    // ========================================

    const BATCH_SIZE = 100;
    let registrosCriados = 0;

    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);
      const batchResults = await db.batch(batch);

      // Contar registros criados (ignora UPDATEs iniciais)
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.meta && result.meta.changes > 0) {
          // Se for INSERT (não UPDATE), contar
          if (i + j >= (qualificacoes.length > 0 ? 1 : 0) + (licencas.length > 0 ? 1 : 0)) {
            registrosCriados += result.meta.changes;
          }
        }
      }
    }

    logger.info('Batch de recálculo executado', {
      empresaId,
      qualificacoes: qualificacoes.length,
      licencas: licencas.length,
      registrosCriados,
      registrosDeletados,
    });

    // ========================================
    // 6. REGISTRAR AUDITORIA
    // ========================================

    try {
      await db
        .prepare(
          `
        INSERT INTO auditoria_avancada_v2 (
          usuario_id,
          acao,
          modulo,
          detalhes,
          ip_address,
          created_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      `,
        )
        .bind(
          c.get('userId'),
          'RECALCULO_COMPLIANCE_BATCH',
          'COMPLIANCE',
          JSON.stringify({
            scope,
            entity_id,
            empresa_id: empresaId,
            qualificacoes: qualificacoes.length,
            licencas: licencas.length,
            registros_criados: registrosCriados,
            registros_deletados: registrosDeletados,
            execution_time_ms: Date.now() - startTime,
          }),
          c.req.header('CF-Connecting-IP') || 'unknown',
        )
        .run();
    } catch (auditError) {
      logger.warn('Falha ao registrar auditoria do recálculo', {
        empresaId,
        error: toError(auditError).message,
      });
      // Não falhar a requisição por erro de auditoria
    }

    // ========================================
    // 7. RESPOSTA DE SUCESSO
    // ========================================

    const response: RecalculateResponse = {
      success: true,
      message: 'Recálculo concluído com sucesso',
      data: {
        qualificacoes_processadas: qualificacoes.length,
        licencas_processadas: licencas.length,
        registros_criados: registrosCriados,
        registros_deletados: registrosDeletados,
        execution_time_ms: Date.now() - startTime,
      },
    };

    return c.json(response);
  } catch (error) {
    createLogger(c, 'ComplianceRecalculate').error('Erro ao recalcular compliance', toError(error));

    const response: RecalculateResponse = {
      success: false,
      message: 'Erro ao recalcular compliance',
      error: 'Erro interno do servidor',
    };

    return c.json(response, 500);
  }
});

// ========================================
// GET /api/compliance/stats
// ========================================

app.get('/stats', async (c: Context<AppEnv>) => {
  try {
    const db = c.env.DB;
    const empresaId = Number(c.get('empresaId') || 0);

    if (!Number.isFinite(empresaId) || empresaId <= 0) {
      return c.json({ success: false, error: 'Empresa não identificada' }, 401);
    }

    const stats = await db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status_compliance = 'CONFORME' THEN 1 ELSE 0 END), 0) as conformes,
        COALESCE(SUM(CASE WHEN status_compliance = 'A_VENCER' THEN 1 ELSE 0 END), 0) as a_vencer,
        COALESCE(SUM(CASE WHEN status_compliance = 'VENCIDO' THEN 1 ELSE 0 END), 0) as vencidos,
        COALESCE(SUM(CASE WHEN status_compliance = 'PENDENTE' THEN 1 ELSE 0 END), 0) as pendentes,
        COALESCE(ROUND(AVG(percentual_conformidade), 2), 0) as percentual_medio
      FROM historico_compliance
      WHERE deleted_at IS NULL
        AND funcionario_id IN (
          SELECT id FROM funcionarios WHERE deleted_at IS NULL AND empresa_id = ?
        )
    `,
      )
      .bind(empresaId)
      .first();

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    createLogger(c, 'ComplianceRecalculate').error(
      'Erro ao buscar estatísticas de compliance',
      toError(error),
    );
    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

export default app;