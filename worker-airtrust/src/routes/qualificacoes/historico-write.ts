/**
 * QUALIFICACOES HISTORICO — Write routes (POST, PUT, PATCH, DELETE)
 * Extracted from historico.ts
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import { z } from 'zod';
import { auth } from '../../middleware/auth';
import { getTenantContext } from '../../middleware/tenant';
import { requireRole } from '../../middleware/rbac';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../../utils/auditoria';
import {
  safe,
  historicoPertenceEmpresa,
  invalidateMaterializedStats,
  ensureHistoricoSchema,
  ensureQualificacoesTiposTrainingSchema,
  normalizeTipoTreinamento,
  resolveCargaHorariaByTipo,
  calcularDataVencimento,
  resolveParametrosRenovacaoQualificacao,
  publishQualificacaoEvent,
} from './historico-helpers';
import {
  COMPLETED_STATUS_VALUES,
  isPlannedQualificationStatus,
  normalizeCompletedStatusForNewWrites,
  normalizePlannedStatusForNewWrites,
  normalizeQualificationStatusForCompatibility,
  PLANNED_QUALIFICATION_STATUS_VALUES,
  QUALIFICACAO_STATUS,
  sqlStatusEqualsAny,
  sqlStatusNotEqualsAny,
} from '../../lib/status/status-codes';
import {
  garantirG1SemPlanejado,
  isG1QualificacaoCode,
  isG1SemQualificacaoCode,
  realizarG1SemPendente,
} from '../../services/qualificacoes-g1-sem';

const writeRouter = new Hono<{ Bindings: Env }>();

function normalizeWritableHistoricoStatus(
  status: string | null | undefined,
): typeof QUALIFICACAO_STATUS.PLANEJADA | typeof QUALIFICACAO_STATUS.CONCLUIDA | null {
  const planned = normalizePlannedStatusForNewWrites(status);
  if (planned) return planned;

  const completed = normalizeCompletedStatusForNewWrites(status);
  if (completed) return completed;

  return null;
}

async function resolveInstrutorNomePorPayload(
  db: D1Database,
  empresaId: number,
  payload: { instrutor?: unknown; instrutor_id?: unknown },
): Promise<{ instrutorNome: string | null; instrutorId: number | null; error?: string }> {
  const instrutorIdNum = Number(payload.instrutor_id || 0);
  const hasInstrutorId = Number.isInteger(instrutorIdNum) && instrutorIdNum > 0;

  if (hasInstrutorId) {
    const instrutorRow = await db
      .prepare(
        `SELECT id, nome, guerra
           FROM funcionarios
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(instrutorIdNum, empresaId)
      .first<{ id: number; nome: string | null; guerra: string | null }>();

    if (!instrutorRow) {
      return {
        instrutorNome: null,
        instrutorId: instrutorIdNum,
        error: 'Instrutor inválido para a empresa informada',
      };
    }

    return {
      instrutorNome: String(instrutorRow.guerra || instrutorRow.nome || '').trim() || null,
      instrutorId: instrutorRow.id,
    };
  }

  const instrutorTexto =
    typeof payload.instrutor === 'string' && payload.instrutor.trim().length > 0
      ? payload.instrutor.trim()
      : null;

  return {
    instrutorNome: instrutorTexto,
    instrutorId: null,
  };
}

// ===== SCHEMA PARA RENOVAÇÃO =====
const renovarSchema = z
  .object({
    // Aceitar ambos os nomes para compatibilidade
    nova_data_vencimento: z.string().min(1).optional(),
    nova_data_conclusao: z.string().min(1).optional(),
    observacao: z.string().optional(),
  })
  .refine((data) => data.nova_data_vencimento || data.nova_data_conclusao, {
    message: 'Nova data de conclusão/realização é obrigatória',
  });

/**
 * POST /historico/:id/renovar
 * Renovar qualificação existente
 * - Marca o registro atual como RENOVADA
 * - Cria novo registro com a nova data de vencimento
 */
writeRouter.post(
  '/:id/renovar',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);

    await ensureHistoricoSchema(db);
    await ensureQualificacoesTiposTrainingSchema(db);

    const id = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    // Parse body
    const body = await c.req.json();
    const parsed = renovarSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
        400,
      );
    }

    // Aceitar ambos os nomes
    const novaDataRealizacao = parsed.data.nova_data_conclusao || parsed.data.nova_data_vencimento;
    const observacao = parsed.data.observacao;

    // Validar formato de data
    if (!novaDataRealizacao || !/^\d{4}-\d{2}-\d{2}$/.test(novaDataRealizacao)) {
      return c.json(
        { success: false, error: 'Data de conclusão inválida. Use formato YYYY-MM-DD' },
        400,
      );
    }

    // Buscar qualificação original COM dados do tipo para calcular validade
    const originalResult = await db
      .prepare(
        `SELECT qh.id, qh.funcionario_id, qh.qualificacao_id, qh.qualificacao_codigo, 
                qh.data_conclusao, qh.data_vencimento, qh.observacoes, qh.renovada, 
                qh.validade_meses as hist_validade_meses, qh.tipo_codigo, qh.codigo,
                  qh.categoria, qh.numero_certificado, qh.instrutor, qh.carga_horaria,
                qt.validade as tipo_validade, qt.nome as tipo_nome, qt.categoria as tipo_categoria,
                  qt.carga_horaria as tipo_carga_horaria,
                  qt.carga_horaria_inicial as tipo_carga_horaria_inicial,
                  qt.carga_horaria_recorrente as tipo_carga_horaria_recorrente
         FROM qualificacoes_historico qh
         INNER JOIN funcionarios f ON f.id = qh.funcionario_id
         LEFT JOIN qualificacoes_tipos qt
           ON (qt.id = qh.qualificacao_id OR qt.codigo = qh.qualificacao_codigo)
          AND qt.empresa_id = f.empresa_id
          AND qt.deleted_at IS NULL
         WHERE qh.id = ?
           AND qh.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND f.empresa_id = ?`,
      )
      .bind(id, tenantCtx.empresaId)
      .first();

    const original = originalResult as {
      id: number;
      funcionario_id: number;
      qualificacao_id: number | null;
      qualificacao_codigo: string | null;
      data_conclusao: string | null;
      data_vencimento: string | null;
      observacoes: string | null;
      renovada: number;
      hist_validade_meses: number | null;
      tipo_codigo: string | null;
      codigo: string | null;
      categoria: string | null;
      numero_certificado: string | null;
      instrutor: string | null;
      carga_horaria: number | null;
      tipo_validade: number | null;
      tipo_nome: string | null;
      tipo_categoria: string | null;
      tipo_carga_horaria: number | null;
      tipo_carga_horaria_inicial: number | null;
      tipo_carga_horaria_recorrente: number | null;
    } | null;

    if (!original) {
      return c.json({ success: false, error: 'Qualificação não encontrada' }, 404);
    }

    if (original.renovada === 1) {
      const referenciaRenovacao = `Renovação de #${id}`;
      const renovacaoExistente = await db
        .prepare(
          `SELECT id, data_conclusao, data_vencimento, validade_meses, tipo_treinamento, carga_horaria
             FROM qualificacoes_historico
            WHERE deleted_at IS NULL
              AND id != ?
              AND funcionario_id = ?
              AND data_conclusao = ?
              AND observacoes LIKE ?
              AND (
                (? IS NOT NULL AND qualificacao_id = ?)
                OR (? IS NOT NULL AND qualificacao_codigo = ?)
              )
            ORDER BY id DESC
            LIMIT 1`,
        )
        .bind(
          id,
          original.funcionario_id,
          novaDataRealizacao,
          `${referenciaRenovacao}%`,
          original.qualificacao_id,
          original.qualificacao_id,
          original.qualificacao_codigo,
          original.qualificacao_codigo,
        )
        .first<{
          id: number;
          data_conclusao: string | null;
          data_vencimento: string | null;
          validade_meses: number | null;
          tipo_treinamento: string | null;
          carga_horaria: number | null;
        }>();

      if (renovacaoExistente) {
        return c.json({
          success: true,
          message: 'Qualificação já havia sido renovada',
          data: {
            registro_anterior_id: id,
            novo_registro_id: renovacaoExistente.id,
            nova_data_conclusao: renovacaoExistente.data_conclusao,
            nova_data_vencimento: renovacaoExistente.data_vencimento,
            validade_meses: renovacaoExistente.validade_meses,
            tipo_treinamento: renovacaoExistente.tipo_treinamento,
            carga_horaria: renovacaoExistente.carga_horaria,
            idempotent: true,
          },
        });
      }

      return c.json({ success: false, error: 'Esta qualificação já foi renovada' }, 400);
    }

    const codigoOriginal = original.qualificacao_codigo || original.codigo || original.tipo_codigo;

    // Verificar conflito antes de qualquer modificação para evitar UNIQUE constraint
    // e corrupção de dados (renovada=1 sem novo registro)
    if (codigoOriginal) {
      const conflito = await db
        .prepare(
          `SELECT id FROM qualificacoes_historico
           WHERE funcionario_id = ?
             AND qualificacao_codigo = ?
             AND data_conclusao = ?
             AND deleted_at IS NULL
             AND id != ?`,
        )
        .bind(original.funcionario_id, codigoOriginal, novaDataRealizacao, id)
        .first<{ id: number }>();

      if (conflito) {
        return c.json(
          {
            success: false,
            error:
              'Já existe um registro ativo para este funcionário com esta qualificação na data informada. Escolha uma data diferente.',
          },
          409,
        );
      }
    }

    try {
      // 1. Marcar original como RENOVADA
      await db
        .prepare(
          `UPDATE qualificacoes_historico 
           SET renovada = 1, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(id)
        .run();

      // 2. Calcular nova data de vencimento
      // Prioridade: hist_validade_meses > tipo_validade > default 12 meses
      let validadeMeses = original.hist_validade_meses || original.tipo_validade || 12;

      // Regra CMA semestral: pilotos com mais de 60 anos têm validade de 6 meses
      const codigoCMACheck =
        original.qualificacao_codigo || original.codigo || original.tipo_codigo;
      if (codigoCMACheck === 'CMA') {
        const funcBirth = await db
          .prepare(
            'SELECT nascimento AS data_nascimento FROM funcionarios WHERE id = ? AND deleted_at IS NULL',
          )
          .bind(original.funcionario_id)
          .first<{ data_nascimento: string | null }>();
        if (funcBirth?.data_nascimento) {
          const refDate = new Date((novaDataRealizacao ?? '') + 'T00:00:00Z');
          const birthDate = new Date(funcBirth.data_nascimento + 'T00:00:00Z');
          const sixtiethBirthday = new Date(birthDate);
          sixtiethBirthday.setFullYear(sixtiethBirthday.getFullYear() + 60);
          if (sixtiethBirthday <= refDate) validadeMeses = 6;
        }
      }

      const renovacaoResolvida = resolveParametrosRenovacaoQualificacao({
        codigoQualificacao: codigoOriginal,
        dataConclusao: novaDataRealizacao,
        validadeMeses,
      });
      validadeMeses = renovacaoResolvida.validadeMeses;
      const novaDataVencimento = renovacaoResolvida.dataVencimento;

      // 3. Criar novo registro com nova data
      // Copiar TODOS os dados do original, apenas alterando datas e observações
      const codigoQualificacao =
        original.qualificacao_codigo || original.codigo || original.tipo_codigo;
      const categoriaQualificacao = original.categoria || original.tipo_categoria;

      const novaObservacao = observacao
        ? `Renovação de #${id}. ${observacao}`
        : `Renovação automática de #${id} em ${new Date().toISOString().split('T')[0]}`;
      const tipoTreinamento = renovacaoResolvida.tipoTreinamento;
      const cargaHorariaEfetiva = resolveCargaHorariaByTipo({
        tipoTreinamento,
        cargaInicial: original.tipo_carga_horaria_inicial,
        cargaRecorrente: original.tipo_carga_horaria_recorrente,
        cargaPadrao: original.tipo_carga_horaria,
      });

      console.log('[RENOVAR] Inserindo novo registro:', {
        funcionario_id: original.funcionario_id,
        qualificacao_id: original.qualificacao_id,
        qualificacao_codigo: codigoQualificacao,
        data_conclusao: novaDataRealizacao,
        data_vencimento: novaDataVencimento,
        validade_meses: validadeMeses,
        numero_certificado: original.numero_certificado,
        instrutor: original.instrutor,
      });

      const insertResult = await db
        .prepare(
          `INSERT INTO qualificacoes_historico 
           (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, 
            data_conclusao, data_vencimento, validade_meses, observacoes, 
            renovada, numero_certificado, instrutor, carga_horaria, tipo_treinamento, status,
            empresa_id,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          original.funcionario_id,
          original.qualificacao_id,
          codigoQualificacao,
          categoriaQualificacao,
          novaDataRealizacao,
          novaDataVencimento,
          validadeMeses,
          `Renovação de #${id}${observacao ? '. ' + observacao : ''}`,
          original.numero_certificado,
          original.instrutor,
          cargaHorariaEfetiva,
          tipoTreinamento,
          renovacaoResolvida.status,
          tenantCtx.empresaId,
        )
        .run();

      if (isG1QualificacaoCode(codigoQualificacao)) {
        await garantirG1SemPlanejado(db, {
          funcionarioId: original.funcionario_id,
          dataConclusaoG1: novaDataRealizacao,
          g1HistoricoId: Number(insertResult.meta.last_row_id || 0),
        });
      }

      // Invalidar cache
      await invalidateMaterializedStats(db);

      const ua = extrairUsuarioAuditoria(c);
      await registrarAuditoria({
        db,
        tabela: 'qualificacoes_historico',
        acao: 'UPDATE',
        registro_id: id,
        dados_novos: { acao: 'RENOVAR', novo_id: insertResult.meta.last_row_id },
        ...ua,
      });

      try {
        await publishQualificacaoEvent(db, 'renewed', original.funcionario_id, codigoQualificacao, {
          registro_anterior_id: id,
          novo_registro_id: Number(insertResult.meta.last_row_id || 0),
          data_conclusao: novaDataRealizacao,
          data_vencimento: novaDataVencimento,
        });
      } catch (error) {
        console.error('domain_event_error', error);
      }

      return c.json({
        success: true,
        message: 'Qualificação renovada com sucesso',
        data: {
          registro_anterior_id: id,
          novo_registro_id: insertResult.meta.last_row_id,
          nova_data_conclusao: novaDataRealizacao,
          nova_data_vencimento: novaDataVencimento,
          validade_meses: validadeMeses,
          tipo_treinamento: tipoTreinamento,
          carga_horaria: cargaHorariaEfetiva,
        },
      });
    } catch (error) {
      console.error('[RENOVAR] Erro:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('UNIQUE constraint failed')) {
        // INSERT falhou após UPDATE — reverter renovada=1 para evitar corrupção de dados
        try {
          await db
            .prepare(
              `UPDATE qualificacoes_historico SET renovada = 0, updated_at = datetime('now') WHERE id = ?`,
            )
            .bind(id)
            .run();
        } catch (rollbackError) {
          console.error('[RENOVAR] Falha ao reverter renovada=1:', rollbackError);
        }
        return c.json(
          {
            success: false,
            error:
              'Já existe um registro ativo para este funcionário com esta qualificação na data informada. Escolha uma data diferente.',
          },
          409,
        );
      }

      return c.json(
        { success: false, error: 'Erro ao renovar qualificação', details: errorMessage },
        500,
      );
    }
  }),
);

/**
 * POST /historico
 * Criar novo registro de qualificação
 */
writeRouter.post(
  '/',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);

    await ensureHistoricoSchema(db);
    await ensureQualificacoesTiposTrainingSchema(db);

    const body = await c.req.json();

    // Schema de criação - aceita tanto funcionario_cpf quanto funcionario_id
    const createSchema = z
      .object({
        funcionario_id: z.number().int().positive().optional(),
        funcionario_cpf: z.string().optional(),
        qualificacao_codigo: z.string().min(1),
        tipo_treinamento: z
          .enum(['INICIAL', 'RECORRENTE', 'SEMESTRAL', 'UPGRADE', 'ESPECIFICO'])
          .optional(),
        data_conclusao: z.string().min(1),
        data_vencimento: z.string().min(1).nullable().optional(),
        instrutor_id: z.number().int().positive().optional(),
        instrutor: z.string().max(200).optional(),
        observacoes: z.string().nullable().optional(),
        status: z.string().optional().default(QUALIFICACAO_STATUS.CONCLUIDA),
      })
      .refine((data) => data.funcionario_id !== undefined || data.funcionario_cpf !== undefined, {
        message: 'funcionario_id ou funcionario_cpf é obrigatório',
      });

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.issues },
        400,
      );
    }

    const {
      funcionario_cpf,
      qualificacao_codigo,
      data_conclusao,
      observacoes,
      data_vencimento,
      tipo_treinamento,
    } = parsed.data;
    let funcionario_id = parsed.data.funcionario_id;

    // Se veio CPF, buscar funcionario_id
    if (!funcionario_id && funcionario_cpf) {
      const func = (await db
        .prepare(
          'SELECT id FROM funcionarios WHERE cpf = ? AND empresa_id = ? AND deleted_at IS NULL',
        )
        .bind(funcionario_cpf, tenantCtx.empresaId)
        .first()) as { id: number } | null;
      if (!func) {
        return c.json(
          { success: false, error: `Funcionário com CPF ${funcionario_cpf} não encontrado` },
          404,
        );
      }
      funcionario_id = func.id;
    }

    const funcionarioTenant = await db
      .prepare('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(funcionario_id, tenantCtx.empresaId)
      .first<{ id: number }>();

    if (!funcionarioTenant) {
      return c.json({ success: false, error: 'Funcionário não encontrado neste tenant' }, 404);
    }

    // Buscar qualificacao_id pelo código
    const tipo = await db
      .prepare(
        `SELECT id, categoria, validade, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente
           FROM qualificacoes_tipos
          WHERE codigo = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(qualificacao_codigo, tenantCtx.empresaId)
      .first<{
        id: number;
        categoria: string;
        validade: number | null;
        carga_horaria: number | null;
        carga_horaria_inicial: number | null;
        carga_horaria_recorrente: number | null;
      }>();

    if (!tipo) {
      return c.json(
        {
          success: false,
          error: `Tipo de qualificação com código ${qualificacao_codigo} não encontrado`,
        },
        404,
      );
    }

    const qualificacao_id = tipo.id;
    const categoria = tipo.categoria;
    const validade_meses = tipo.validade || 12;
    const tipoTreinamento =
      tipo.validade === 6 ? 'SEMESTRAL' : normalizeTipoTreinamento(tipo_treinamento) || 'INICIAL';
    const cargaHorariaEfetiva = resolveCargaHorariaByTipo({
      tipoTreinamento,
      cargaInicial: tipo.carga_horaria_inicial,
      cargaRecorrente: tipo.carga_horaria_recorrente,
      cargaPadrao: tipo.carga_horaria,
    });

    // Auto-detectar status baseado na data de conclusão
    // Se data_conclusao é no futuro, automaticamente definir como PLANEJADA
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataConclusaoDate = new Date(data_conclusao + 'T00:00:00Z');

    let statusFinal = normalizeWritableHistoricoStatus(parsed.data.status);
    if (!statusFinal) {
      return c.json(
        {
          success: false,
          error:
            'Status inválido. Use uma variante compatível de PLANEJADA/PLANEJADO ou CONCLUIDA/CONCLUIDO.',
        },
        400,
      );
    }
    if (dataConclusaoDate > hoje) {
      // Data futura = qualificação planejada
      statusFinal = QUALIFICACAO_STATUS.PLANEJADA;
    }

    // Inserir registro — data_vencimento NULL (cálculo dinâmico), validade_meses só se override CMA >60
    // Regra CMA semestral: pilotos > 60 anos → validade 6 meses, caso contrário NULL (usa tipo)
    let validadeMesesInsert: number | null = null;
    if (qualificacao_codigo === 'CMA') {
      const funcBirth2 = await db
        .prepare(
          'SELECT nascimento AS data_nascimento FROM funcionarios WHERE id = ? AND deleted_at IS NULL',
        )
        .bind(funcionario_id)
        .first<{ data_nascimento: string | null }>();
      if (funcBirth2?.data_nascimento) {
        const refDate2 = new Date(data_conclusao + 'T00:00:00Z');
        const birthDate2 = new Date(funcBirth2.data_nascimento + 'T00:00:00Z');
        const sixtiethBirthday2 = new Date(birthDate2);
        sixtiethBirthday2.setFullYear(sixtiethBirthday2.getFullYear() + 60);
        if (sixtiethBirthday2 <= refDate2) validadeMesesInsert = 6;
      }
    }

    const dataVencimentoFinal = calcularDataVencimento({
      dataConclusao: data_conclusao,
      dataVencimento: data_vencimento,
      validadeMeses: validadeMesesInsert ?? validade_meses,
      vencimentoFimMes: 0,
    });

    const instrutorResolution = await resolveInstrutorNomePorPayload(db, tenantCtx.empresaId, {
      instrutor: parsed.data.instrutor,
      instrutor_id: parsed.data.instrutor_id,
    });
    if (instrutorResolution.error) {
      return c.json({ success: false, error: instrutorResolution.error }, 400);
    }
    const instrutor = instrutorResolution.instrutorNome;

    if (isG1SemQualificacaoCode(qualificacao_codigo)) {
      const realizacaoPendente = await realizarG1SemPendente(db, {
        funcionarioId: funcionario_id!,
        qualificacaoId: qualificacao_id,
        qualificacaoCodigo: qualificacao_codigo,
        categoria,
        dataConclusao: data_conclusao,
        observacoes: observacoes || null,
        instrutor: instrutor || null,
        status: statusFinal,
        tipoTreinamento,
        cargaHoraria: cargaHorariaEfetiva,
      });

      if (realizacaoPendente) {
        await invalidateMaterializedStats(db);

        const uaG1Sem = extrairUsuarioAuditoria(c);
        await registrarAuditoria({
          db,
          tabela: 'qualificacoes_historico',
          acao: 'UPDATE',
          registro_id: realizacaoPendente.id,
          dados_novos: {
            qualificacao_codigo,
            data_conclusao,
            data_vencimento: realizacaoPendente.dataVencimento,
            status: statusFinal,
            tipo_treinamento: tipoTreinamento,
            instrutor: instrutor || null,
          },
          ...uaG1Sem,
        });

        return c.json({
          success: true,
          message: 'G1-SEM registrada com sucesso',
          data: {
            id: realizacaoPendente.id,
            funcionario_id,
            qualificacao_id,
            qualificacao_codigo,
            categoria,
            tipo_treinamento: tipoTreinamento,
            data_conclusao,
            status: statusFinal,
            data_vencimento: realizacaoPendente.dataVencimento,
            validade_meses,
            carga_horaria: cargaHorariaEfetiva,
          },
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    try {
      result = await db
        .prepare(
          `INSERT INTO qualificacoes_historico 
           (funcionario_id, qualificacao_id, qualificacao_codigo, categoria, 
            data_conclusao, data_vencimento, validade_meses, instrutor, observacoes, 
            status, renovada, carga_horaria, tipo_treinamento, empresa_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          funcionario_id,
          qualificacao_id,
          qualificacao_codigo,
          categoria,
          data_conclusao,
          isG1SemQualificacaoCode(qualificacao_codigo)
            ? data_vencimento || null
            : dataVencimentoFinal,
          validadeMesesInsert,
          instrutor || null,
          observacoes || null,
          statusFinal,
          cargaHorariaEfetiva,
          tipoTreinamento,
          tenantCtx.empresaId,
        )
        .run();
    } catch (insertErr: unknown) {
      const msg = (insertErr as Error).message || String(insertErr);
      if (msg.includes('UNIQUE constraint failed')) {
        return c.json(
          {
            success: false,
            error: `Já existe uma qualificação "${qualificacao_codigo}" para este funcionário na data ${data_conclusao}. 
Alternativamente, edite ou exclua o registro existente antes de criar um novo.`,
            code: 'DUPLICATE_ENTRY',
          },
          409,
        );
      }
      throw insertErr;
    }

    const createdHistoricoId = Number(result.meta.last_row_id || 0);
    let registroAnteriorRenovadoId: number | null = null;

    if (statusFinal !== QUALIFICACAO_STATUS.PLANEJADA) {
      // Mark ALL older completed/valid records for the same person+qualification as RENOVADA.
      // Using a direct UPDATE (no LIMIT) ensures that bulk-imported multi-cycle records are
      // fully cleaned up when a new record arrives, not just the immediate predecessor.
      const renovaResult = await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET renovada = 1,
                  status = 'RENOVADA',
                  updated_at = datetime('now')
            WHERE funcionario_id = ?
              AND qualificacao_codigo = ?
              AND id <> ?
              AND deleted_at IS NULL
              AND COALESCE(renovada, 0) = 0
              AND ${sqlStatusNotEqualsAny('status', PLANNED_QUALIFICATION_STATUS_VALUES, QUALIFICACAO_STATUS.CONCLUIDA)}
              AND date(COALESCE(data_conclusao, '1900-01-01')) <= date(COALESCE(?, '2099-12-31'))`,
        )
        .bind(funcionario_id, qualificacao_codigo, createdHistoricoId, data_conclusao)
        .run();

      if (renovaResult.meta.changes > 0) {
        // Return the most recent of the newly-renovated records for audit logging
        const anteriorAudit = await db
          .prepare(
            `SELECT id FROM qualificacoes_historico
              WHERE funcionario_id = ?
                AND qualificacao_codigo = ?
                AND id <> ?
                AND deleted_at IS NULL
                AND COALESCE(renovada, 0) = 1
              ORDER BY date(COALESCE(data_conclusao, '1900-01-01')) DESC, id DESC
              LIMIT 1`,
          )
          .bind(funcionario_id, qualificacao_codigo, createdHistoricoId)
          .first<{ id: number }>();
        registroAnteriorRenovadoId = anteriorAudit?.id ?? null;
      }
    }

    if (isG1QualificacaoCode(qualificacao_codigo)) {
      await garantirG1SemPlanejado(db, {
        funcionarioId: funcionario_id!,
        dataConclusaoG1: data_conclusao,
        g1HistoricoId: createdHistoricoId,
      });
    }

    // Invalidar cache
    await invalidateMaterializedStats(db);

    const ua2 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_historico',
      acao: 'INSERT',
      registro_id: createdHistoricoId,
      dados_novos: {
        funcionario_id,
        qualificacao_codigo,
        tipo_treinamento: tipoTreinamento,
        data_conclusao,
        carga_horaria: cargaHorariaEfetiva,
        data_vencimento: dataVencimentoFinal,
        instrutor: instrutor || null,
        registro_anterior_renovado_id: registroAnteriorRenovadoId,
      },
      ...ua2,
    });

    try {
      await publishQualificacaoEvent(db, 'created', funcionario_id!, qualificacao_codigo, {
        registro_id: createdHistoricoId,
        data_conclusao,
      });
    } catch (error) {
      console.error('domain_event_error', error);
    }

    return c.json({
      success: true,
      message: 'Qualificação criada com sucesso',
      data: {
        id: createdHistoricoId,
        funcionario_id,
        qualificacao_id,
        qualificacao_codigo,
        categoria,
        tipo_treinamento: tipoTreinamento,
        data_conclusao,
        status: statusFinal,
        registro_anterior_renovado_id: registroAnteriorRenovadoId,
        data_vencimento: dataVencimentoFinal,
        validade_meses,
        carga_horaria: cargaHorariaEfetiva,
      },
    });
  }),
);

/**
 * PUT /historico/:id
 * Atualizar registro de qualificação (data_conclusao, data_vencimento, observacoes)
 */
writeRouter.put(
  '/:id',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const id = parseInt(c.req.param('id') ?? '');

    await ensureHistoricoSchema(db);
    await ensureQualificacoesTiposTrainingSchema(db);

    if (isNaN(id) || id <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    // Verificar se existe
    const existing = await historicoPertenceEmpresa(db, id, tenantCtx.empresaId);

    if (!existing) {
      return c.json({ success: false, error: 'Registro não encontrado' }, 404);
    }

    // Parse body
    const body = await c.req.json();
    const { data_conclusao, data_vencimento, observacoes } = body;
    const observacoesNormalizadas =
      typeof observacoes === 'string' ? observacoes : (observacoes ?? null);
    const tipoTreinamentoBody = normalizeTipoTreinamento(body?.tipo_treinamento);

    const instrutorResolution = await resolveInstrutorNomePorPayload(db, tenantCtx.empresaId, {
      instrutor: body?.instrutor,
      instrutor_id: body?.instrutor_id,
    });
    if (instrutorResolution.error) {
      return c.json({ success: false, error: instrutorResolution.error }, 400);
    }
    const instrutorNormalizado = instrutorResolution.instrutorNome;

    // Validar campos obrigatórios
    if (!data_conclusao) {
      return c.json({ success: false, error: 'data_conclusao é obrigatória' }, 400);
    }

    const cargaContext = await db
      .prepare(
        `SELECT qh.tipo_treinamento, qh.carga_horaria,
                qh.validade_meses, qh.data_vencimento, qh.qualificacao_codigo, qt.validade,
                qt.carga_horaria, qt.carga_horaria_inicial, qt.carga_horaria_recorrente
           FROM qualificacoes_historico qh
           LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
          WHERE qh.id = ? AND qh.deleted_at IS NULL`,
      )
      .bind(id)
      .first<{
        tipo_treinamento: string | null;
        carga_horaria: number | null;
        validade_meses: number | null;
        data_vencimento: string | null;
        qualificacao_codigo: string | null;
        validade: number | null;
        carga_horaria_inicial: number | null;
        carga_horaria_recorrente: number | null;
      }>();

    const tipoTreinamentoFinal =
      (Number(cargaContext?.validade_meses ?? cargaContext?.validade ?? 0) === 6
        ? 'SEMESTRAL'
        : undefined) ||
      tipoTreinamentoBody ||
      normalizeTipoTreinamento(cargaContext?.tipo_treinamento);
    const cargaHorariaEfetiva = resolveCargaHorariaByTipo({
      tipoTreinamento: tipoTreinamentoFinal,
      cargaInicial: cargaContext?.carga_horaria_inicial,
      cargaRecorrente: cargaContext?.carga_horaria_recorrente,
      cargaPadrao: cargaContext?.carga_horaria,
    });
    const dataVencimentoFinal = isG1SemQualificacaoCode(cargaContext?.qualificacao_codigo)
      ? (data_vencimento ?? cargaContext?.data_vencimento ?? null)
      : calcularDataVencimento({
          dataConclusao: data_conclusao,
          dataVencimento: data_vencimento,
          validadeMeses: cargaContext?.validade_meses ?? cargaContext?.validade,
          vencimentoFimMes: 0,
        });

    await db
      .prepare(
        `UPDATE qualificacoes_historico 
         SET data_conclusao = ?, 
             data_vencimento = ?, 
             instrutor = ?,
             observacoes = ?,
             tipo_treinamento = ?,
             carga_horaria = ?,
             updated_at = datetime('now')
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(
        data_conclusao,
        dataVencimentoFinal,
        instrutorNormalizado,
        observacoesNormalizadas,
        tipoTreinamentoFinal,
        cargaHorariaEfetiva,
        id,
      )
      .run();

    let registroAtualizado = await db
      .prepare(
        `SELECT id, data_conclusao, data_vencimento, observacoes, instrutor,
                tipo_treinamento, carga_horaria
           FROM qualificacoes_historico
          WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(id)
      .first<{
        id: number;
        data_conclusao: string | null;
        data_vencimento: string | null;
        observacoes: string | null;
        instrutor: string | null;
        tipo_treinamento: string | null;
        carga_horaria: number | null;
      }>();

    if (registroAtualizado && registroAtualizado.instrutor !== instrutorNormalizado) {
      console.warn('[qualificacoes/historico] instrutor mismatch after update, retrying', {
        id,
        requested: instrutorNormalizado,
        stored: registroAtualizado.instrutor,
      });

      await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET instrutor = ?,
                  updated_at = datetime('now')
            WHERE id = ? AND deleted_at IS NULL`,
        )
        .bind(instrutorNormalizado, id)
        .run();

      registroAtualizado = await db
        .prepare(
          `SELECT id, data_conclusao, data_vencimento, observacoes, instrutor,
                  tipo_treinamento, carga_horaria
             FROM qualificacoes_historico
            WHERE id = ? AND deleted_at IS NULL`,
        )
        .bind(id)
        .first<{
          id: number;
          data_conclusao: string | null;
          data_vencimento: string | null;
          observacoes: string | null;
          instrutor: string | null;
          tipo_treinamento: string | null;
          carga_horaria: number | null;
        }>();
    }

    // Invalidar cache
    await invalidateMaterializedStats(db);

    const ua3 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_historico',
      acao: 'UPDATE',
      registro_id: id,
      dados_novos: {
        data_conclusao,
        observacoes: observacoesNormalizadas,
        instrutor: instrutorNormalizado,
        tipo_treinamento: tipoTreinamentoFinal,
      },
      ...ua3,
    });

    try {
      const atualizada = await db
        .prepare(
          'SELECT funcionario_id, qualificacao_codigo FROM qualificacoes_historico WHERE id = ? AND deleted_at IS NULL',
        )
        .bind(id)
        .first<{ funcionario_id: number; qualificacao_codigo: string | null }>();
      if (atualizada) {
        await publishQualificacaoEvent(
          db,
          'renewed',
          atualizada.funcionario_id,
          atualizada.qualificacao_codigo,
          {
            registro_id: id,
            data_conclusao,
          },
        );
      }
    } catch (error) {
      console.error('domain_event_error', error);
    }

    return c.json({
      success: true,
      message: 'Qualificação atualizada com sucesso',
      data: {
        id,
        data_conclusao: registroAtualizado?.data_conclusao ?? data_conclusao,
        data_vencimento: registroAtualizado?.data_vencimento ?? dataVencimentoFinal,
        observacoes: registroAtualizado?.observacoes ?? observacoesNormalizadas,
        instrutor: registroAtualizado?.instrutor ?? instrutorNormalizado,
        tipo_treinamento: registroAtualizado?.tipo_treinamento ?? tipoTreinamentoFinal,
        carga_horaria: registroAtualizado?.carga_horaria ?? cargaHorariaEfetiva,
      },
    });
  }),
);

/**
 * PATCH /historico/:id/reagendar
 * Reagendar qualificação planejada para uma nova data futura
 */
writeRouter.patch(
  '/:id/reagendar',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const id = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(id) || id <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    let novaDataPlanejada = '';
    try {
      const body = await c.req.json();
      novaDataPlanejada =
        typeof body?.nova_data_planejada === 'string' ? body.nova_data_planejada.trim() : '';
    } catch {
      return c.json({ success: false, error: 'Nova data planejada é obrigatória' }, 400);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(novaDataPlanejada)) {
      return c.json({ success: false, error: 'Nova data planejada inválida' }, 400);
    }

    const existing = await historicoPertenceEmpresa(db, id, tenantCtx.empresaId);

    if (!existing) {
      return c.json({ success: false, error: 'Qualificação não encontrada' }, 404);
    }

    const currentStatus = normalizeQualificationStatusForCompatibility(existing.status);
    if (!isPlannedQualificationStatus(currentStatus)) {
      return c.json(
        {
          success: false,
          error: `Apenas qualificações PLANEJADAS podem ser reagendadas. Status atual: ${currentStatus}`,
        },
        400,
      );
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const novaDataDate = new Date(`${novaDataPlanejada}T00:00:00`);
    if (Number.isNaN(novaDataDate.getTime()) || novaDataDate <= hoje) {
      return c.json(
        {
          success: false,
          error: 'A nova data planejada deve ser futura',
        },
        400,
      );
    }

    const cargaContext = await db
      .prepare(
        `SELECT qt.validade_meses, qt.validade, qt.data_vencimento, qt.qualificacao_codigo
           FROM qualificacoes_historico qh
           LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
          WHERE qh.id = ? AND qh.deleted_at IS NULL`,
      )
      .bind(id)
      .first<{
        validade_meses: number | null;
        validade: number | null;
        data_vencimento: string | null;
        qualificacao_codigo: string | null;
      }>();

    const dataVencimentoFinal = isG1SemQualificacaoCode(cargaContext?.qualificacao_codigo)
      ? (cargaContext?.data_vencimento ?? null)
      : calcularDataVencimento({
          dataConclusao: novaDataPlanejada,
          dataVencimento: null,
          validadeMeses: cargaContext?.validade_meses ?? cargaContext?.validade,
          vencimentoFimMes: 0,
        });

    await db
      .prepare(
        `UPDATE qualificacoes_historico
            SET data_conclusao = ?,
                data_vencimento = ?,
                status = '${QUALIFICACAO_STATUS.PLANEJADA}',
                updated_at = datetime('now')
          WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(novaDataPlanejada, dataVencimentoFinal, id)
      .run();

    await invalidateMaterializedStats(db);

    const uaReagendamento = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_historico',
      acao: 'UPDATE',
      registro_id: id,
      dados_novos: {
        status: QUALIFICACAO_STATUS.PLANEJADA,
        data_conclusao: novaDataPlanejada,
        data_vencimento: dataVencimentoFinal,
      },
      ...uaReagendamento,
    });

    return c.json({
      success: true,
      message: 'Qualificação reagendada com sucesso',
      data: {
        id,
        status: QUALIFICACAO_STATUS.PLANEJADA,
        data_conclusao: novaDataPlanejada,
        data_vencimento: dataVencimentoFinal,
      },
    });
  }),
);

/**
 * POST /historico/:id/confirmar
 * Confirmar qualificação planejada como concluída
 * - Verifica se status = 'PLANEJADA'
 * - Atualiza para status = 'CONCLUIDA'
 * - Registra data_confirmacao e confirmada_por
 */
writeRouter.post(
  '/:id/confirmar',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);

    await ensureHistoricoSchema(db);

    const id = parseInt(c.req.param('id') ?? '', 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = ((c as any).get('userId') as number | undefined) ?? null;
    let renovarAnterior = true;
    try {
      const body = await c.req.json();
      if (typeof body?.renovar_anterior === 'boolean') {
        renovarAnterior = body.renovar_anterior;
      }
    } catch {
      // body opcional
    }

    if (isNaN(id) || id <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    // Verificar se existe e está PLANEJADA
    const existing = await historicoPertenceEmpresa(db, id, tenantCtx.empresaId);

    if (!existing) {
      return c.json({ success: false, error: 'Qualificação não encontrada' }, 404);
    }

    const currentStatus = normalizeQualificationStatusForCompatibility(existing.status);
    if (!isPlannedQualificationStatus(currentStatus)) {
      return c.json(
        {
          success: false,
          error: `Apenas qualificações PLANEJADAS podem ser confirmadas. Status atual: ${currentStatus}`,
        },
        400,
      );
    }

    // Atualizar para CONCLUIDA
    await db
      .prepare(
        `UPDATE qualificacoes_historico 
         SET status = '${QUALIFICACAO_STATUS.CONCLUIDA}',
             data_confirmacao = datetime('now'), 
             confirmada_por = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(userId, id)
      .run();

    // Opcional: renovar automaticamente a qualificação anterior equivalente
    let registroAnteriorRenovadoId: number | null = null;
    if (renovarAnterior) {
      const anterior = await db
        .prepare(
          `SELECT id
             FROM qualificacoes_historico
            WHERE funcionario_id = ?
              AND qualificacao_codigo = ?
              AND id <> ?
              AND deleted_at IS NULL
              AND ${sqlStatusEqualsAny('status', COMPLETED_STATUS_VALUES, QUALIFICACAO_STATUS.CONCLUIDA)}
              AND COALESCE(renovada, 0) = 0
            ORDER BY date(COALESCE(data_conclusao, '1900-01-01')) DESC, id DESC
            LIMIT 1`,
        )
        .bind(existing.funcionario_id, existing.qualificacao_codigo, id)
        .first<{ id: number }>();

      if (anterior?.id) {
        await db
          .prepare(
            `UPDATE qualificacoes_historico
                SET renovada = 1,
                    status = 'RENOVADA',
                    updated_at = datetime('now')
              WHERE id = ? AND deleted_at IS NULL`,
          )
          .bind(anterior.id)
          .run();
        registroAnteriorRenovadoId = anterior.id;
      }
    }

    // Invalidar cache
    await invalidateMaterializedStats(db);

    const ua4 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_historico',
      acao: 'UPDATE',
      registro_id: id,
      dados_novos: { status: QUALIFICACAO_STATUS.CONCLUIDA, confirmada_por: userId },
      ...ua4,
    });

    try {
      await publishQualificacaoEvent(
        db,
        'created',
        existing.funcionario_id,
        existing.qualificacao_codigo,
        {
          registro_id: id,
          status: QUALIFICACAO_STATUS.CONCLUIDA,
        },
      );
    } catch (error) {
      console.error('domain_event_error', error);
    }

    return c.json({
      success: true,
      message: 'Qualificação confirmada com sucesso',
      data: {
        id,
        status: QUALIFICACAO_STATUS.CONCLUIDA,
        confirmada_por: userId,
        renovou_anterior: renovarAnterior,
        registro_anterior_renovado_id: registroAnteriorRenovadoId,
      },
    });
  }),
);

/**
 * PATCH /historico/:id/cancelar
 * Cancelar qualificação planejada
 * - Verifica se status = 'PLANEJADA'
 * - Atualiza para status = 'CANCELADA'
 */
writeRouter.patch(
  '/:id/cancelar',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const id = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(id) || id <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    // Verificar se existe e está PLANEJADA
    const existing = await historicoPertenceEmpresa(db, id, tenantCtx.empresaId);

    if (!existing) {
      return c.json({ success: false, error: 'Qualificação não encontrada' }, 404);
    }

    const currentStatus = normalizeQualificationStatusForCompatibility(existing.status);
    if (!isPlannedQualificationStatus(currentStatus)) {
      return c.json(
        {
          success: false,
          error: `Apenas qualificações PLANEJADAS podem ser canceladas. Status atual: ${currentStatus}`,
        },
        400,
      );
    }

    // Atualizar para CANCELADA
    await db
      .prepare(
        `UPDATE qualificacoes_historico 
         SET status = '${QUALIFICACAO_STATUS.CANCELADA}',
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(id)
      .run();

    // Invalidar cache
    await invalidateMaterializedStats(db);

    const ua5 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_historico',
      acao: 'UPDATE',
      registro_id: id,
      dados_novos: { status: QUALIFICACAO_STATUS.CANCELADA },
      ...ua5,
    });

    return c.json({
      success: true,
      message: 'Qualificação cancelada com sucesso',
      data: {
        id,
        status: QUALIFICACAO_STATUS.CANCELADA,
      },
    });
  }),
);

/**
 * DELETE /historico/:id
 * Deletar registro de qualificação (soft delete ou hard delete para testes)
 */
writeRouter.delete(
  '/:id',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const id = parseInt(c.req.param('id') ?? '');

    if (isNaN(id) || id <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    // Verificar se existe (apenas registros não deletados)
    const exists = await historicoPertenceEmpresa(db, id, tenantCtx.empresaId);

    if (!exists) {
      return c.json({ success: false, error: 'Registro não encontrado' }, 404);
    }

    // Soft delete (padrão do sistema)
    await db
      .prepare(
        'UPDATE qualificacoes_historico SET deleted_at = datetime("now") WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, tenantCtx.empresaId)
      .run();

    // Invalidar cache
    await invalidateMaterializedStats(db);

    const ua6 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_historico',
      acao: 'DELETE',
      registro_id: id,
      ...ua6,
    });

    try {
      await publishQualificacaoEvent(
        db,
        'revoked',
        exists.funcionario_id,
        exists.qualificacao_codigo,
        {
          registro_id: id,
        },
      );
    } catch (error) {
      console.error('domain_event_error', error);
    }

    return c.json({
      success: true,
      message: 'Registro deletado com sucesso',
      data: { id },
    });
  }),
);

export default writeRouter;
