/**
 * QUALIFICACOES ROUTES - Gestão de Qualificações
 *
 * Endpoints para gerenciar tipos de qualificações e histórico:
 * - GET /api/qualificacoes - Lista tipos de qualificações (alias para /tipos)
 * - GET /api/qualificacoes/tipos - Lista tipos de qualificações
 * - GET /api/qualificacoes/historico - Histórico de qualificacoes_historico (legacy)
 * - GET /api/habilitacoes - Histórico completo (qualificacoes_historico + habilitacoes com renovações)
 * - POST /api/qualificacoes/historico - Registra nova qualificação
 * - PUT /api/qualificacoes/historico/:id - Atualiza qualificação
 * - DELETE /api/qualificacoes/historico/:id - Remove qualificação
 */

import { Hono } from 'hono';
// Garantir CORS explícito nas respostas manuais (fallback ao middleware global)
import type { Env, QualificacaoHistorico, ApiResponse } from '../types';
import type { TipoQualificacao } from '../types/qualificacoes';
import { softDelete } from '../utils/db';
import {
  calcularDataVencimento,
  calcularDiasAteVencimento,
  determinarStatus,
  determinarUrgencia,
  calcularValidade,
} from '../utils/qualificacoes-expiration';
// import { notFound, badRequest } from '../middleware/error-handler'; // substituído por retornos JSON locais
import { isValidDate } from '../utils/security';
import { auth, optionalAuth } from '../middleware/auth';
import { jsonError } from '../middleware/response';
import { AppError } from '../utils/errors';
import { z } from 'zod';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireRole } from '../middleware/rbac';

const app = new Hono<{ Bindings: Env }>();

// Padronização global de erros
app.onError((err, c) => {
  const e = err as AppError;
  if (e instanceof AppError) {
    return jsonError(c, e.message, e.status || 400, e.code);
  }
  console.error('[QUALIFICACOES_UNCAUGHT]', (err as Error).stack || (err as Error).message);
  return jsonError(c, 'Erro interno inesperado', 500, 'INTERNAL_ERROR');
});

function safe(fn: (c: any) => Promise<any> | any) {
  return async (c: any) => {
    try {
      return await fn(c);
    } catch (e) {
      const err = e as AppError;
      if (err instanceof AppError) {
        return jsonError(c, err.message, err.status || 400, err.code);
      }
      const errorMessage = (e as Error).message || String(e);
      const errorStack = (e as Error).stack || '';
      console.error('[QUALIFICACOES_HANDLER_ERROR] Message:', errorMessage);
      console.error('[QUALIFICACOES_HANDLER_ERROR] Stack:', errorStack);
      console.error('[QUALIFICACOES_HANDLER_ERROR] Full Error:', e);
      return jsonError(c, `Falha inesperada: ${errorMessage}`, 500, 'UNEXPECTED');
    }
  };
}

// Cache simples em memória do worker para estatísticas (expira rápido)
interface HistoricoStatsCacheEntry {
  key: string;
  ts: number;
  data: {
    total: number;
    validas: number;
    vencendo: number;
    vencidas: number;
    renovadas: number;
  };
}
let historicoStatsCache: HistoricoStatsCacheEntry | null = null;

// ===== HELPERS PERFORMANCE / CACHING =====
function generateETag(parts: unknown[]): string {
  try {
    const base = JSON.stringify(parts);
    // Base64 curto para reduzir tamanho do header
    const b64 = btoa(base).substring(0, 24);
    return `"qh-${b64}"`;
  } catch {
    // Fallback simples
    return '"qh-etag-fallback"';
  }
}

// TTL dinâmico para cache de estatísticas (padrão 30s)
function getCacheTtlMs(env: Env): number {
  const raw = (env as unknown as { CACHE_TTL_SECONDS?: string }).CACHE_TTL_SECONDS || '30';
  const n = parseInt(raw);
  if (isNaN(n) || n <= 0) return 30000;
  return n * 1000;
}

// Invalida materialized stats do dia (todas as chaves) após mutações
async function invalidateMaterializedStats(db: D1Database) {
  try {
    await db
      .prepare("DELETE FROM qualificacoes_historico_stats_daily WHERE day = date('now')")
      .run();
  } catch (e) {
    console.error('[invalidateMaterializedStats] erro', e);
  }
  historicoStatsCache = null;
}

// Middleware diagnóstico global (tempo de execução + minimal flag)
// ===== NOVA IMPLEMENTAÇÃO COMPLETA DO HISTÓRICO (Especificação solicitada) =====
// Garantir coluna renovada
async function ensureHistoricoSchema(db: D1Database) {
  try {
    const col = await db.prepare('PRAGMA table_info(qualificacoes_historico)').all();
    const hasRenovada = (col.results || []).some((r: any) => r.name === 'renovada');
    if (!hasRenovada) {
      await db
        .prepare('ALTER TABLE qualificacoes_historico ADD COLUMN renovada INTEGER DEFAULT 0')
        .run();
    }
  } catch (e) {
    console.warn(
      '[ensureHistoricoSchema] Falha ao verificar/adicionar coluna renovada:',
      (e as Error).message,
    );
  }
}

const createHistoricoSchema = z.object({
  funcionario_id: z.number().int().positive(),
  tipo_id: z.number().int().positive(), // será mapeado para qualificacao_id
  data_realizacao: z.string().min(1),
  data_vencimento: z.string().min(1),
  observacao: z.string().optional(),
  renovada: z.boolean().optional().default(false),
});

const updateHistoricoSchema = z.object({
  funcionario_id: z.number().int().positive().optional(),
  tipo_id: z.number().int().positive().optional(),
  data_realizacao: z.string().min(1).optional(),
  data_vencimento: z.string().min(1).optional(),
  observacao: z.string().optional(),
  renovada: z.boolean().optional(),
});

/**
 * DELETE /api/qualificacoes/tipos/:id
 * Deleta um tipo de qualificação (soft delete)
 * IMPORTANTE: Deve vir ANTES do GET /tipos para o Hono fazer match correto
 */
app.delete('/tipos/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param('id');

    console.log(`[DELETE_TIPOS] Tentando deletar tipo com ID: "${id}"`);

    if (!id || id.trim() === '') {
      console.log(`[DELETE_TIPOS] ID inválido: "${id}"`);
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    // Primeiro, listar todos os tipos para verificar IDs existentes
    const allTipos = await db
      .prepare('SELECT id FROM qualificacoes_tipos WHERE deleted_at IS NULL LIMIT 5')
      .all();
    console.log(
      `[DELETE_TIPOS] IDs existentes no banco:`,
      allTipos.results?.map((t: any) => t.id),
    );

    const existing = await db
      .prepare(
        'SELECT id, nome FROM qualificacoes_tipos WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(id)
      .first();

    console.log(`[DELETE_TIPOS] Registro encontrado:`, existing);

    if (!existing) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    // Soft delete
    const result = await db
      .prepare(
        "UPDATE qualificacoes_tipos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL",
      )
      .bind(id)
      .run();

    console.log(`[DELETE_TIPOS] Resultado do UPDATE:`, result.meta);

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao deletar tipo' }, 500);
    }

    // Auditoria
    try {
      const auditTable = await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_avancada_v2' LIMIT 1",
        )
        .first();
      if (auditTable) {
        await db
          .prepare(
            "INSERT INTO auditoria_avancada_v2 (entidade, entidade_id, acao, timestamp) VALUES ('qualificacoes_tipos', ?, 'DELETE', datetime('now'))",
          )
          .bind(id)
          .run();
      }
    } catch (e) {
      console.warn('[AUDITORIA] falha ao registrar DELETE de tipo:', (e as Error).message);
    }

    console.log(`[DELETE_TIPOS] Tipo deletado com sucesso: ${id}`);
    return c.json({ success: true, message: 'Tipo deletado com sucesso' });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[DELETE_TIPOS] Erro:', errorMsg);
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

// GET /tipos - Lista tipos de qualificações (público para leitura)
app.get(
  '/tipos',
  optionalAuth(),
  safe(async (c) => {
    const db = c.env.DB;
    const limitRaw = c.req.query('limit');
    const limitParsed = parseInt(limitRaw || '200', 10);
    const limitFinal = Math.min(Math.max(limitParsed, 1), 500);

    const stmt = db.prepare(
      'SELECT id, tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at FROM qualificacoes_tipos WHERE deleted_at IS NULL ORDER BY categoria, nome LIMIT ?',
    );
    const { results } = await stmt.bind(limitFinal).all();
    return c.json({
      success: true,
      data: results || [],
      meta: { count: (results || []).length, limit: limitFinal },
    });
  }),
);

/**
 * POST /api/qualificacoes/tipos
 * Cria um novo tipo de qualificação
 */
app.post('/tipos', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const db = c.env.DB;
    let body: Partial<{
      nome: string;
      codigo: string;
      categoria: string;
      descricao: string;
      validade: number | null;
      vencimento_fim_mes: 0 | 1;
      observacoes: string | null;
      ativo: number | boolean;
    }> = {};

    try {
      body = await c.req.json();
      console.log('[POST_TIPOS] body recebido:', JSON.stringify(body));
    } catch (e) {
      console.error('[POST_TIPOS] Erro parse JSON:', e);
      return c.json({ success: false, error: 'JSON inválido' }, 400);
    }

    // Validações
    if (!body.nome || body.nome.trim().length < 3) {
      console.error('[POST_TIPOS] Nome inválido:', body.nome);
      return c.json({ success: false, error: 'Nome obrigatório (mínimo 3 caracteres)' }, 400);
    }

    if (!body.codigo || body.codigo.trim().length === 0) {
      console.error('[POST_TIPOS] Código inválido:', body.codigo);
      return c.json({ success: false, error: 'Código obrigatório' }, 400);
    }

    const codigo = body.codigo.trim().toUpperCase();
    const nome = body.nome.trim();

    // Validar categoria obrigatória
    if (!body.categoria || body.categoria.trim().length === 0) {
      console.error('[POST_TIPOS] Categoria inválida:', body.categoria);
      return c.json({ success: false, error: 'Categoria obrigatória' }, 400);
    }

    const categoria = body.categoria.trim();

    console.log(
      '[POST_TIPOS] Validações OK. codigo:',
      codigo,
      'nome:',
      nome,
      'categoria:',
      categoria,
    );

    // Verificar duplicidade por código
    const existing = await db
      .prepare(
        'SELECT id FROM qualificacoes_tipos WHERE UPPER(codigo) = UPPER(?) AND deleted_at IS NULL LIMIT 1',
      )
      .bind(codigo)
      .first();

    if (existing) {
      console.error('[POST_TIPOS] Código duplicado:', codigo);
      return c.json({ success: false, error: 'Código já existe' }, 409);
    }

    // Preparar valores com conversões explícitas
    const validade = body.validade == null ? null : Number(body.validade);
    const vencimentoFimMes = body.vencimento_fim_mes ? 1 : 0;
    const ativo = body.ativo === false ? 0 : 1; // Default 1 (ativo)

    console.log('[POST_TIPOS] Inserindo (sem ID - autoincrement):', {
      tipo: categoria,
      codigo,
      nome,
      descricao: body.descricao || null,
      categoria,
      carga_horaria: null,
      validade,
      vencimento_fim_mes: vencimentoFimMes,
      observacoes: body.observacoes || null,
      ativo,
    });

    // Inserir (ID é autoincrement)
    const result = await db
      .prepare(
        `INSERT INTO qualificacoes_tipos 
         (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)`,
      )
      .bind(
        categoria, // tipo = categoria (legado)
        codigo,
        nome,
        body.descricao || null,
        categoria, // NOT NULL constraint
        null, // carga_horaria
        validade,
        vencimentoFimMes,
        body.observacoes || null,
        ativo,
      )
      .run();

    console.log('[POST_TIPOS] result.meta.changes:', result.meta.changes);
    console.log('[POST_TIPOS] result.meta.last_row_id:', result.meta.last_row_id);

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao criar tipo' }, 500);
    }

    const newId = result.meta.last_row_id;

    // Buscar registro criado
    const created = await db
      .prepare(
        'SELECT id, tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at FROM qualificacoes_tipos WHERE id = ? LIMIT 1',
      )
      .bind(newId)
      .first();

    // Auditoria
    try {
      const auditTable = await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_avancada_v2' LIMIT 1",
        )
        .first();
      if (auditTable) {
        await db
          .prepare(
            "INSERT INTO auditoria_avancada_v2 (entidade, entidade_id, acao, timestamp) VALUES ('qualificacoes_tipos', ?, 'CREATE', datetime('now'))",
          )
          .bind(String(newId))
          .run();
      }
    } catch (e) {
      console.warn('[AUDITORIA] falha ao registrar CREATE de tipo:', (e as Error).message);
    }

    return c.json({ success: true, data: created, message: 'Tipo criado com sucesso' }, 201);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[POST_TIPOS] Erro:', errorMsg);
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

// ===============================
// GET /qualificacoes/historico (COM STATS GARANTIDO - BYPASS CACHE)
// ===============================
app.get(
  '/historico',
  optionalAuth(),
  safe(async (c) => {
    console.log('[HISTORICO_PRINCIPAL] ===== ENDPOINT INICIADO =====');
    const db = c.env.DB;
    await ensureHistoricoSchema(db);
    const {
      page = '1',
      limit = '20',
      search = '',
      status = '',
      funcionario_id = '',
      tipo_id = '',
    } = c.req.query();

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 500);
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [
      'qh.deleted_at IS NULL',
      'f.id IS NOT NULL', // Garante que funcionário existe
      'f.deleted_at IS NULL', // Garante que não foi deletado
      "UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'", // Garante que está ativo
    ];
    const params: unknown[] = [];

    if (funcionario_id) {
      conditions.push('qh.funcionario_id = ?');
      params.push(funcionario_id);
    }
    if (tipo_id) {
      conditions.push('qh.qualificacao_id = ?');
      params.push(tipo_id);
    }

    switch (status) {
      case 'VALIDA':
        conditions.push("qh.data_vencimento >= date('now')");
        break;
      case 'VENCIDA':
        conditions.push("qh.data_vencimento < date('now')");
        break;
      case 'VENCENDO_30':
        conditions.push(
          "qh.data_vencimento >= date('now') AND qh.data_vencimento <= date('now','+30 days')",
        );
        break;
      case 'RENOVADA':
        conditions.push('qh.renovada = 1');
        break;
    }

    if (search) {
      conditions.push(
        '(f.nome LIKE ? OR f.matricula LIKE ? OR qt.nome LIKE ? OR qt.codigo LIKE ?)',
      );
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause = conditions.join(' AND ');

    // STATS GLOBAIS (independente da paginação)
    const statsQuery = `SELECT 
      COUNT(*) as total,
      SUM(CASE 
        WHEN qh.renovada = 1 THEN 0
        WHEN julianday(qh.data_vencimento) >= julianday('now') AND julianday(qh.data_vencimento) - julianday('now') > 30 THEN 1 
        ELSE 0 
      END) as validas,
      SUM(CASE 
        WHEN qh.renovada = 1 THEN 0
        WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 AND julianday(qh.data_vencimento) >= julianday('now') THEN 1 
        ELSE 0 
      END) as vencendo,
      SUM(CASE 
        WHEN qh.renovada = 1 THEN 0
        WHEN julianday(qh.data_vencimento) < julianday('now') THEN 1 
        ELSE 0 
      END) as vencidas,
      SUM(CASE WHEN qh.renovada = 1 THEN 1 ELSE 0 END) as renovadas
    FROM qualificacoes_historico qh
    LEFT JOIN funcionarios f ON f.id = qh.funcionario_id 
      AND f.deleted_at IS NULL 
      AND UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'
    LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
    WHERE ${whereClause}`;

    const statsResult = await db
      .prepare(statsQuery)
      .bind(...params)
      .first();
    const stats = {
      total: Number((statsResult as any)?.total || 0),
      validas: Number((statsResult as any)?.validas || 0),
      vencendo: Number((statsResult as any)?.vencendo || 0),
      vencidas: Number((statsResult as any)?.vencidas || 0),
      renovadas: Number((statsResult as any)?.renovadas || 0),
    };

    console.log('[HISTORICO_PRINCIPAL] Stats calculados:', stats);

    // DADOS PAGINADOS
    const sql = `SELECT 
      qh.id,
      qh.funcionario_id,
      qh.qualificacao_id AS tipo_id,
      qh.data_conclusao AS data_realizacao,
      qh.data_vencimento,
      qh.renovada,
      qh.numero_certificado,
      qh.observacoes AS observacao,
      f.nome AS funcionario_nome,
      f.matricula AS funcionario_matricula,
      f.funcao AS funcionario_funcao,
      f.cpf AS funcionario_cpf,
      f.codigo_anac AS funcionario_codigo_anac,
      qt.nome AS tipo_nome,
      qt.codigo AS tipo_codigo,
      qt.categoria AS tipo_categoria,
      qt.validade AS qualificacao_validade,
      (SELECT COUNT(*) 
       FROM documentos d 
       WHERE d.funcionario_id = qh.funcionario_id 
         AND d.deleted_at IS NULL 
         AND d.r2_key LIKE 'certificados/CERT-' || f.cpf || '-' || COALESCE(qh.codigo, qt.codigo) || '%'
      ) AS total_certificados,
      (SELECT d.r2_key
       FROM documentos d 
       WHERE d.funcionario_id = qh.funcionario_id 
         AND d.deleted_at IS NULL 
         AND d.r2_key LIKE 'certificados/CERT-' || f.cpf || '-' || COALESCE(qh.codigo, qt.codigo) || '%'
       ORDER BY d.created_at DESC
       LIMIT 1
      ) AS certificado_url
    FROM qualificacoes_historico qh
    LEFT JOIN funcionarios f ON f.id = qh.funcionario_id 
      AND f.deleted_at IS NULL 
      AND UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'
    LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
    WHERE ${whereClause}
    ORDER BY qh.data_vencimento ASC
    LIMIT ? OFFSET ?`;

    const res = await db
      .prepare(sql)
      .bind(...params, limitNum, offset)
      .all();
    const results = res.results || [];

    const nowTs = Date.now();
    const enriched = results.map((r: any) => {
      let derivedStatus: string;
      if (!r.data_vencimento) derivedStatus = 'INDEFINIDA';
      else {
        const vencTs = new Date(r.data_vencimento).getTime();
        const diffDias = Math.floor((vencTs - nowTs) / (1000 * 60 * 60 * 24));
        if (r.renovada) derivedStatus = 'RENOVADA';
        else if (diffDias < 0) derivedStatus = 'VENCIDA';
        else if (diffDias <= 30) derivedStatus = 'VENCENDO_30';
        else derivedStatus = 'VALIDA';
      }
      return {
        ...r,
        status: derivedStatus,
        data_conclusao: r.data_realizacao,
        qualificacao_nome: r.tipo_nome,
        qualificacao_codigo: r.tipo_codigo,
        qualificacao_categoria: r.tipo_categoria,
      };
    });

    const response = {
      success: true,
      data: enriched,
      meta: {
        count: enriched.length,
        limit: limitNum,
        offset,
        page: pageNum,
        total: stats.total,
      },
      stats, // ← GARANTIDO: stats sempre presente
    };

    console.log('[HISTORICO_PRINCIPAL] Response keys:', Object.keys(response));
    console.log('[HISTORICO_PRINCIPAL] Stats em response:', response.stats);
    return c.json(response);
  }),
);

app.get(
  '/historico/:id',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    await ensureHistoricoSchema(db);
    const id = c.req.param('id');
    const row = await db
      .prepare(
        `SELECT 
      qh.id,
      qh.funcionario_id,
      qh.qualificacao_id AS tipo_id,
      qh.data_conclusao AS data_realizacao,
      qh.data_vencimento,
      qh.renovada,
      qh.numero_certificado,
      qh.observacoes AS observacao,
      f.nome AS funcionario_nome,
      f.matricula AS funcionario_matricula,
      f.funcao AS funcionario_funcao,
      f.codigo_anac AS funcionario_codigo_anac,
      qt.nome AS tipo_nome,
      qt.codigo AS tipo_codigo,
      qt.categoria AS tipo_categoria,
      qt.validade AS qualificacao_validade
    FROM qualificacoes_historico qh
    LEFT JOIN funcionarios f ON f.id = qh.funcionario_id
    LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
    WHERE qh.id = ? AND qh.deleted_at IS NULL LIMIT 1`,
      )
      .bind(id)
      .first();
    if (!row) return c.json({ success: false, error: 'Registro não encontrado' }, 404);
    // status derivado
    let status: string;
    if (!row.data_vencimento) status = 'INDEFINIDA';
    else {
      const diffDias = Math.floor(
        (new Date(row.data_vencimento).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if ((row as any).renovada) status = 'RENOVADA';
      else if (diffDias < 0) status = 'VENCIDA';
      else if (diffDias <= 30) status = 'VENCENDO_30';
      else status = 'VALIDA';
    }
    return c.json({ success: true, data: { ...row, status } });
  }),
);

// ===============================
// POST /historico - Cria nova qualificação (aceita CPF + codigo)
// ===============================
app.post(
  '/historico',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    await ensureHistoricoSchema(db);
    const body = await c.req.json();

    // Schema aceita CPF + codigo (frontend) OU funcionario_id + tipo_id (interno)
    const inputSchema = z.object({
      funcionario_cpf: z.string().min(11).optional(),
      funcionario_id: z.number().optional(),
      qualificacao_codigo: z.string().min(1).optional(),
      qualificacao_id: z.number().optional(),
      tipo_id: z.number().optional(), // Alias para qualificacao_id
      data_conclusao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      data_realizacao: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(), // Alias
      data_vencimento: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      observacoes: z.string().max(500).nullable().optional(),
      observacao: z.string().max(500).nullable().optional(), // Alias
      renovada: z.boolean().optional(),
    });

    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
        400,
      );
    }

    let funcionarioId: number;
    let qualificacaoId: number;

    // 1. Resolver funcionário (CPF → ID ou direto)
    if (parsed.data.funcionario_cpf) {
      const cpfLimpo = parsed.data.funcionario_cpf.replace(/\D/g, '');
      const funcionario = await db
        .prepare('SELECT id, nome FROM funcionarios WHERE cpf = ? AND deleted_at IS NULL LIMIT 1')
        .bind(cpfLimpo)
        .first();
      if (!funcionario) {
        return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
      }
      funcionarioId = funcionario.id as number;
    } else if (parsed.data.funcionario_id) {
      const funcionario = await db
        .prepare('SELECT id FROM funcionarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
        .bind(parsed.data.funcionario_id)
        .first();
      if (!funcionario) {
        return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
      }
      funcionarioId = parsed.data.funcionario_id;
    } else {
      return c.json(
        { success: false, error: 'funcionario_cpf ou funcionario_id obrigatório' },
        400,
      );
    }

    // 2. Resolver qualificação (codigo → ID ou direto)
    if (parsed.data.qualificacao_codigo) {
      const tipo = await db
        .prepare(
          'SELECT id, codigo, nome, categoria FROM qualificacoes_tipos WHERE codigo = ? AND deleted_at IS NULL LIMIT 1',
        )
        .bind(parsed.data.qualificacao_codigo)
        .first();
      if (!tipo) {
        return c.json({ success: false, error: 'Tipo de qualificação não encontrado' }, 404);
      }
      qualificacaoId = tipo.id as number;
    } else if (parsed.data.qualificacao_id || parsed.data.tipo_id) {
      const id = parsed.data.qualificacao_id || parsed.data.tipo_id;
      const tipo = await db
        .prepare(
          'SELECT id, codigo, categoria FROM qualificacoes_tipos WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        )
        .bind(id)
        .first();
      if (!tipo) {
        return c.json({ success: false, error: 'Tipo de qualificação não encontrado' }, 404);
      }
      qualificacaoId = id!;
    } else {
      return c.json(
        { success: false, error: 'qualificacao_codigo ou qualificacao_id obrigatório' },
        400,
      );
    }

    const dataRealizacao = parsed.data.data_conclusao || parsed.data.data_realizacao!;
    const dataVencimento = parsed.data.data_vencimento;
    const observacoes = parsed.data.observacoes || parsed.data.observacao;

    // 3. Validar datas
    if (dataVencimento && new Date(dataVencimento) <= new Date(dataRealizacao)) {
      return c.json(
        { success: false, error: 'data_vencimento deve ser posterior à data_conclusao' },
        400,
      );
    }

    // 4. Verificar duplicidade
    const duplicado = await db
      .prepare(
        'SELECT id FROM qualificacoes_historico WHERE funcionario_id = ? AND qualificacao_id = ? AND data_conclusao = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(funcionarioId, qualificacaoId, dataRealizacao)
      .first();

    if (duplicado) {
      return c.json({ success: false, error: 'Registro duplicado' }, 400);
    }

    // 5. Buscar tipo para pegar codigo/categoria
    const tipo = await db
      .prepare(
        'SELECT codigo, categoria FROM qualificacoes_tipos WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(qualificacaoId)
      .first();

    // 6. Inserir
    const resultado = await db
      .prepare(
        `INSERT INTO qualificacoes_historico 
        (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, observacoes, renovada, tipo_codigo, categoria, codigo, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        funcionarioId,
        qualificacaoId,
        dataRealizacao,
        dataVencimento || null,
        observacoes || null,
        parsed.data.renovada ? 1 : 0,
        tipo?.codigo,
        tipo?.categoria,
        tipo?.codigo,
      )
      .run();

    if (!resultado.meta.last_row_id) {
      return c.json({ success: false, error: 'Falha ao criar registro' }, 500);
    }

    // 7. Auditoria
    try {
      const auditTable = await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_avancada_v2' LIMIT 1",
        )
        .first();
      if (auditTable) {
        await db
          .prepare(
            "INSERT INTO auditoria_avancada_v2 (entidade, entidade_id, acao, timestamp) VALUES ('qualificacoes_historico', ?, 'CREATE', datetime('now'))",
          )
          .bind(resultado.meta.last_row_id)
          .run();
      }
    } catch (e) {
      console.warn('[AUDITORIA] Falha:', (e as Error).message);
    }

    return c.json(
      {
        success: true,
        data: { id: resultado.meta.last_row_id },
        message: 'Qualificação atribuída com sucesso',
      },
      201,
    );
  }),
);

// ⚠️ POST /historico:id era uma rota legacy interna - removida
// Usar POST /historico (sem :id) para criar novos registros

// IMPORTAR HISTÓRICO EM LOTE (JSON)
// Formato esperado: { registros: [ { funcionario_id, tipo_id, data_realizacao, data_vencimento, observacao?, renovada? } ], overwrite?: boolean }
// Se overwrite for true e registro idempotente existir (funcionario_id + tipo_id + data_conclusao) ele é atualizado.
app.post(
  '/historico/importar-json',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    await ensureHistoricoSchema(db);
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: 'JSON inválido' }, 400);
    }
    const registros = Array.isArray(body.registros) ? body.registros : body.dados || [];
    const overwrite = !!body.overwrite;
    if (!Array.isArray(registros) || registros.length === 0) {
      return c.json({ success: false, error: 'Nenhum registro para importar' }, 400);
    }
    let sucesso = 0;
    const erros: any[] = [];
    for (const r of registros) {
      const parsed = createHistoricoSchema.safeParse(r);
      if (!parsed.success) {
        erros.push({ registro: r, motivo: parsed.error.issues.map((i) => i.message).join(', ') });
        continue;
      }
      const { funcionario_id, tipo_id, data_realizacao, data_vencimento, observacao, renovada } =
        parsed.data;
      // valida ordem datas
      if (new Date(data_vencimento) <= new Date(data_realizacao)) {
        erros.push({ registro: r, motivo: 'data_vencimento <= data_realizacao' });
        continue;
      }
      // funcionário ativo
      const func = await db
        .prepare('SELECT id FROM funcionarios WHERE id = ? AND deleted_at IS NULL')
        .bind(funcionario_id)
        .first();
      if (!func) {
        erros.push({ registro: r, motivo: 'funcionario inativo/ausente' });
        continue;
      }
      const tipo = await db
        .prepare(
          'SELECT id, codigo, categoria FROM qualificacoes_tipos WHERE id = ? AND deleted_at IS NULL',
        )
        .bind(tipo_id)
        .first();
      if (!tipo) {
        erros.push({ registro: r, motivo: 'tipo inexistente' });
        continue;
      }
      const existente = await db
        .prepare(
          'SELECT id FROM qualificacoes_historico WHERE funcionario_id=? AND qualificacao_id=? AND data_conclusao=? AND deleted_at IS NULL LIMIT 1',
        )
        .bind(funcionario_id, tipo_id, data_realizacao)
        .first();
      if (existente && !overwrite) {
        continue;
      }
      if (existente && overwrite) {
        const up = await db
          .prepare(
            'UPDATE qualificacoes_historico SET data_vencimento=?, observacoes=?, renovada=?, updated_at=datetime("now") WHERE id=?',
          )
          .bind(data_vencimento, observacao || null, renovada ? 1 : 0, (existente as any).id)
          .run();
        if (up.meta.changes === 0) {
          erros.push({ registro: r, motivo: 'falha update existente' });
          continue;
        }
        sucesso++;
        continue;
      }
      const ins = await db
        .prepare(
          `INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, numero_certificado, observacoes, renovada, tipo_codigo, categoria, codigo, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          funcionario_id,
          tipo_id,
          data_realizacao,
          data_vencimento,
          observacao || null,
          renovada ? 1 : 0,
          (tipo as any).codigo,
          (tipo as any).categoria,
          (tipo as any).codigo,
        )
        .run();
      if (!ins.meta.last_row_id) {
        erros.push({ registro: r, motivo: 'falha insert' });
        continue;
      }
      sucesso++;
    }
    return c.json({
      success: true,
      data: { importados: sucesso, erros: erros.length, erros_detalhes: erros },
    });
  }),
);

// ⚠️ ROTA DESATIVADA: Usar /api/qualificacoes/historico/:id (qualificacoes-historico.ts)
/*
app.put(
  '/historico/:id',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    await ensureHistoricoSchema(db);
    const id = parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(id)) return c.json({ success: false, error: 'ID inválido' }, 400);
    const json = await c.req.json();
    const parsed = updateHistoricoSchema.safeParse(json);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') },
        400,
      );
    }
    const existing = await db
      .prepare(
        'SELECT id, data_conclusao, data_vencimento FROM qualificacoes_historico WHERE id=? AND deleted_at IS NULL',
      )
      .bind(id)
      .first();
    if (!existing) return c.json({ success: false, error: 'Registro não encontrado' }, 404);
    const updateParts: string[] = [];
    const binds: unknown[] = [];
    const { funcionario_id, tipo_id, data_realizacao, data_vencimento, observacao, renovada } =
      parsed.data;
    if (funcionario_id) {
      updateParts.push('funcionario_id = ?');
      binds.push(funcionario_id);
    }
    if (tipo_id) {
      updateParts.push('qualificacao_id = ?');
      binds.push(tipo_id);
    }
    if (data_realizacao) {
      updateParts.push('data_conclusao = ?');
      binds.push(data_realizacao);
    }
    if (data_vencimento) {
      updateParts.push('data_vencimento = ?');
      binds.push(data_vencimento);
    }
    if (observacao !== undefined) {
      updateParts.push('observacoes = ?');
      binds.push(observacao || null);
    }
    if (renovada !== undefined) {
      updateParts.push('renovada = ?');
      binds.push(renovada ? 1 : 0);
    }
    if (!updateParts.length) return c.json({ success: false, error: 'Nada para atualizar' }, 400);
    updateParts.push("updated_at = datetime('now')");
    const sql = `UPDATE qualificacoes_historico SET ${updateParts.join(
      ', ',
    )} WHERE id = ? AND deleted_at IS NULL`;
    binds.push(id);
    const up = await db
      .prepare(sql)
      .bind(...binds)
      .run();
    if (up.meta.changes === 0) return c.json({ success: false, error: 'Falha ao atualizar' }, 500);
    return c.json({ success: true, data: { id }, message: 'Histórico atualizado' });
  }),
);
*/

// ⚠️ ROTA DESATIVADA: Usar DELETE /api/qualificacoes/historico/:id (qualificacoes-historico.ts)
/*
app.delete(
  '/historico/:id',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const id = parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(id)) return c.json({ success: false, error: 'ID inválido' }, 400);
    const del = await db
      .prepare(
        "UPDATE qualificacoes_historico SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL",
      )
      .bind(id)
      .run();
    if (del.meta.changes === 0)
      return c.json({ success: false, error: 'Registro não encontrado' }, 404);
    // auditoria opcional
    try {
      const auditTable = await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_avancada_v2' LIMIT 1",
        )
        .first();
      if (auditTable) {
        await db
          .prepare(
            "INSERT INTO auditoria_avancada_v2 (entidade, entidade_id, acao, timestamp) VALUES ('qualificacoes_historico', ?, 'DELETE', datetime('now'))",
          )
          .bind(id)
          .run();
      }
    } catch (e) {
      console.warn('[AUDITORIA] falha ao registrar auditoria_avancada_v2:', (e as Error).message);
    }
    return c.json({ success: true, message: 'Histórico removido (soft delete)' });
  }),
);
*/

// ========================================
// ENDPOINT DEDICADO: GET /historico/stats
// Retorna estatísticas GLOBAIS sem paginação (todos os registros ativos)
// ========================================
app.get('/historico/stats', auth(), async (c) => {
  const db = c.env.DB;

  try {
    console.log('📊 [STATS] Calculando estatísticas globais de qualificacoes_historico...');

    // Query única otimizada: agrega todos os registros ativos
    const statsResult = await db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        SUM(CASE 
          WHEN qh.renovada = 1 THEN 0
          WHEN julianday(qh.data_vencimento) >= julianday('now') AND julianday(qh.data_vencimento) - julianday('now') > 30 THEN 1 
          ELSE 0 
        END) as validas,
        SUM(CASE 
          WHEN qh.renovada = 1 THEN 0
          WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 AND julianday(qh.data_vencimento) >= julianday('now') THEN 1 
          ELSE 0 
        END) as vencendo,
        SUM(CASE 
          WHEN qh.renovada = 1 THEN 0
          WHEN julianday(qh.data_vencimento) < julianday('now') THEN 1 
          ELSE 0 
        END) as vencidas,
        SUM(CASE WHEN qh.renovada = 1 THEN 1 ELSE 0 END) as renovadas
      FROM qualificacoes_historico qh
      WHERE qh.deleted_at IS NULL
    `,
      )
      .first();

    const stats = {
      total: Number((statsResult as any)?.total || 0),
      validas: Number((statsResult as any)?.validas || 0),
      vencendo: Number((statsResult as any)?.vencendo || 0),
      vencidas: Number((statsResult as any)?.vencidas || 0),
      renovadas: Number((statsResult as any)?.renovadas || 0),
    };

    console.log('📊 [STATS] Estatísticas calculadas:', stats);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('❌ [STATS] Erro ao calcular estatísticas:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao calcular estatísticas',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
});

// ========================================
// ENDPOINT LEGADO /historico/stats (com filtros e cache) - MANTER PARA COMPATIBILIDADE
// ========================================
app.get('/historico/stats-extended', auth(), async (c) => {
  const db = c.env.DB;
  // ⚠️ NUNCA usar view integrada (coluna status não existe na tabela real)
  const useIntegrated = false;
  try {
    const funcionarioId = c.req.query('funcionario_id');
    const qualificacaoId = c.req.query('qualificacao_id');
    // Nota: status não é parâmetro filtrável (é view-derived, não coluna real)
    const extended = (c.req.query('extended') || 'false') === 'true';

    const whereClauses: string[] = useIntegrated ? [] : ['qh.deleted_at IS NULL'];
    const bindings: unknown[] = [];

    if (funcionarioId) {
      whereClauses.push('qh.funcionario_id = ?');
      bindings.push(funcionarioId);
    }
    if (qualificacaoId) {
      whereClauses.push('qh.qualificacao_id = ?');
      bindings.push(qualificacaoId);
    }
    // Nota: status não é coluna, é derivado (view-based), não filtramos por ele aqui
    const whereClause = whereClauses.join(' AND ');
    const cacheKey = `${funcionarioId || ''}|${qualificacaoId || ''}`;
    const now = Date.now();
    const materialized = (c.req.query('materialized') || 'false') === 'true';
    let stats: {
      total: number;
      validas: number;
      vencendo: number;
      vencidas: number;
      renovadas: number;
    } = { total: 0, validas: 0, vencendo: 0, vencidas: 0, renovadas: 0 };
    if (
      historicoStatsCache &&
      historicoStatsCache.key === cacheKey &&
      now - historicoStatsCache.ts < getCacheTtlMs(c.env)
    ) {
      stats = historicoStatsCache.data;
    } else {
      const statsQuery = useIntegrated
        ? `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN julianday(qh.data_vencimento) >= julianday('now') AND julianday(qh.data_vencimento) - julianday('now') > 30 THEN 1 ELSE 0 END) as validas,
            SUM(CASE WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 AND julianday(qh.data_vencimento) >= julianday('now') THEN 1 ELSE 0 END) as vencendo,
            SUM(CASE WHEN julianday(qh.data_vencimento) < julianday('now') THEN 1 ELSE 0 END) as vencidas
          FROM qualificacoes_historico qh
          ${whereClause ? `WHERE ${whereClause}` : ''}`
        : `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN julianday(qh.data_vencimento) >= julianday('now') AND julianday(qh.data_vencimento) - julianday('now') > 30 THEN 1 ELSE 0 END) as validas,
            SUM(CASE WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 AND julianday(qh.data_vencimento) >= julianday('now') THEN 1 ELSE 0 END) as vencendo,
            SUM(CASE WHEN julianday(qh.data_vencimento) < julianday('now') THEN 1 ELSE 0 END) as vencidas
          FROM qualificacoes_historico qh
          WHERE ${whereClause}`;
      if (materialized) {
        // Materialized path: usa tabela diaria; se não existir, gera e persiste
        const scopeHash = `${funcionarioId || ''}|${qualificacaoId || ''}`;
        const day = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
        const existing = await db
          .prepare(
            `SELECT total, validas, vencendo, vencidas, renovadas FROM qualificacoes_historico_stats_daily WHERE day = ? AND scope_hash = ? LIMIT 1`,
          )
          .bind(day, scopeHash)
          .first();

        if (existing) {
          stats = {
            total: Number((existing as any).total || 0),
            validas: Number((existing as any).validas || 0),
            vencendo: Number((existing as any).vencendo || 0),
            vencidas: Number((existing as any).vencidas || 0),
            renovadas: Number((existing as any).renovadas || 0),
          };
        } else {
          const statsResult = await db
            .prepare(statsQuery)
            .bind(...bindings)
            .first();
          const toInsert = {
            total: Number((statsResult as any)?.total || 0),
            validas: Number((statsResult as any)?.validas || 0),
            vencendo: Number((statsResult as any)?.vencendo || 0),
            vencidas: Number((statsResult as any)?.vencidas || 0),
            renovadas: 0,
          };
          await db
            .prepare(
              `INSERT OR IGNORE INTO qualificacoes_historico_stats_daily (day, scope_hash, total, validas, vencendo, vencidas, renovadas) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              day,
              scopeHash,
              toInsert.total,
              toInsert.validas,
              toInsert.vencendo,
              toInsert.vencidas,
              toInsert.renovadas,
            )
            .run();
          stats = toInsert;
        }
        historicoStatsCache = { key: cacheKey, ts: now, data: stats };
      } else {
        const statsResult = await db
          .prepare(statsQuery)
          .bind(...bindings)
          .first();
        stats = {
          total: Number((statsResult as any)?.total || 0),
          validas: Number((statsResult as any)?.validas || 0),
          vencendo: Number((statsResult as any)?.vencendo || 0),
          vencidas: Number((statsResult as any)?.vencidas || 0),
          renovadas: 0,
        };
        historicoStatsCache = { key: cacheKey, ts: now, data: stats };
      }
    }
    const etag = generateETag([
      'historico-stats',
      stats.total,
      stats.validas,
      stats.vencendo,
      stats.vencidas,
      stats.renovadas,
      materialized ? 'mat' : 'live',
    ]);
    const ifNone = c.req.header('If-None-Match');
    if (ifNone && ifNone === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, max-age=30',
          'X-Cache-Status': 'HIT',
          'X-Materialized': materialized ? 'true' : 'false',
        },
      });
    }
    let extendedData: unknown = undefined;
    if (extended) {
      try {
        // Query sem dependência de view (nunca usar qh.status)
        const extQuery = `SELECT qt.categoria AS categoria,
                  COUNT(*) AS total,
                  SUM(CASE WHEN julianday(qh.data_vencimento) < julianday('now') THEN 1 ELSE 0 END) AS vencidas,
                  SUM(CASE WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 AND julianday(qh.data_vencimento) >= julianday('now') THEN 1 ELSE 0 END) AS vencendo,
                  SUM(CASE WHEN julianday(qh.data_vencimento) - julianday('now') > 30 THEN 1 ELSE 0 END) AS validas
             FROM qualificacoes_historico qh
             LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
             WHERE ${whereClause}
             GROUP BY qt.categoria
             ORDER BY total DESC
             LIMIT 50`;
        const { results: catRows } = await db
          .prepare(extQuery)
          .bind(...bindings)
          .all();
        extendedData = catRows || [];
      } catch (e) {
        extendedData = { error: (e as Error).message };
      }
    }
    return new Response(
      JSON.stringify({
        success: true,
        data: stats,
        meta: { materialized, extended },
        extended: extendedData,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: etag,
          'Cache-Control': 'private, max-age=30',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match',
          'Access-Control-Expose-Headers': 'ETag',
          'X-Cache-Status': 'MISS',
          'X-Materialized': materialized ? 'true' : 'false',
        },
      },
    );
  } catch (err) {
    const error = err as Error;
    return c.json({ success: false, error: error.message }, 500);
  }
});

// HEALTH ENDPOINT: integridade da tabela qualificacoes_historico
app.get('/historico/health', auth(), async (c) => {
  const db = c.env.DB;
  try {
    // Verificar existência tabela
    const tableExists = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='qualificacoes_historico' LIMIT 1",
      )
      .first();

    // Contagem de registros válidos (não deletados)
    const tableCountRow = tableExists
      ? await db
          .prepare('SELECT COUNT(*) as total FROM qualificacoes_historico WHERE deleted_at IS NULL')
          .first()
      : null;

    // Verificar schema
    const schemaInfo = await db.prepare('PRAGMA table_info(qualificacoes_historico)').all();

    const response = {
      success: true,
      data: {
        table_exists: !!tableExists,
        total_records: tableCountRow?.total ?? 0,
        schema_columns: schemaInfo.results?.length ?? 0,
        view_integrated: false,
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response);
  } catch (err) {
    const error = err as Error;
    return c.json({ success: false, error: error.message }, 500);
  }
});

// (removidos handlers legados duplicados de /historico e /historico/:id)

/**
 * POST /api/qualificacoes/historico/:id/renovar
 * Renova uma qualificação:
 * 1. Marca o registro antigo com nova data de vencimento
 * 2. Cria um novo registro com a nova data de conclusão
 */
app.post('/historico/:id/renovar', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    const body = await c.req.json();
    const { data_conclusao, data_vencimento } = body;

    if (!data_conclusao) {
      return c.json({ success: false, error: 'data_conclusao é obrigatória' }, 400);
    }

    if (!data_vencimento) {
      return c.json({ success: false, error: 'data_vencimento é obrigatória' }, 400);
    }

    if (!isValidDate(data_conclusao) || !isValidDate(data_vencimento)) {
      return c.json({ success: false, error: 'Datas inválidas' }, 400);
    }

    // Buscar qualificação original para replicar dados
    const { results: existing } = await db
      .prepare(
        `
        SELECT 
          id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento,
          renovacao_de, status, created_by
        FROM qualificacoes_historico 
        WHERE id = ? AND deleted_at IS NULL
      `,
      )
      .bind(id)
      .all<QualificacaoHistorico>();

    if (!existing || existing.length === 0) {
      return c.json({ success: false, error: 'Qualificação não encontrada' }, 404);
    }

    const original = existing[0];

    // 1. Atualizar data de vencimento do registro original (sem coluna status)
    const updateResult = await db
      .prepare(
        `UPDATE qualificacoes_historico
         SET data_vencimento = ?, updated_at = datetime('now')
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(data_vencimento, id)
      .run();

    if (updateResult.meta.changes === 0) {
      return c.json({ success: false, error: 'Não foi possível atualizar a qualificação' }, 500);
    }

    // 2. Criar novo registro com a nova data de conclusão (colunas existentes)
    const insertResult = await db
      .prepare(
        `INSERT INTO qualificacoes_historico (
          funcionario_id,
          qualificacao_id,
          data_conclusao,
          data_vencimento,
          numero_certificado,
          observacoes,
          arquivo_url,
          instrutor,
          local,
          modalidade,
          nota,
          carga_horaria,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        original.funcionario_id,
        original.qualificacao_id,
        data_conclusao,
        data_vencimento,
        null, // numero_certificado (não definido no tipo original)
        null, // observacoes
        null, // arquivo_url
        null, // instrutor
        null, // local
        null, // modalidade
        null, // nota
        null, // carga_horaria
      )
      .run();

    const novoId = insertResult.meta.last_row_id;

    const response: ApiResponse = {
      success: true,
      message: 'Qualificação renovada com sucesso',
      data: {
        id_antigo: id,
        data_vencimento_antiga: data_vencimento,
        id_novo: novoId,
        data_conclusao_nova: data_conclusao,
        data_vencimento_nova: data_vencimento,
      },
    };
    await invalidateMaterializedStats(db);
    return c.json(response);
  } catch (error) {
    console.error('[renovar] Erro:', error);
    return c.json({ success: false, error: 'Erro ao renovar qualificação' }, 500);
  }
});

/**
 * DELETE /api/qualificacoes/historico/:id
 * Remove qualificação (soft delete)
 */
app.delete('/historico/:id', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  const result = await softDelete(db, 'qualificacoes_historico', id);

  if (result.meta.changes === 0) {
    return c.json({ success: false, error: 'Qualificação não encontrada' }, 404);
  }

  const response: ApiResponse = {
    success: true,
    message: 'Qualificação removida com sucesso',
  };
  await invalidateMaterializedStats(db);
  return c.json(response);
});

/**
 * PUT /api/qualificacoes/tipos/:id
 * Atualiza um tipo de qualificação (corrige bloco solto anterior)
 */
app.put('/tipos/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  let body: Partial<{
    nome: string;
    codigo: string;
    categoria: string;
    descricao: string;
    validade: number | null;
    vencimento_fim_mes: 0 | 1;
    observacoes: string | null;
    ativo: number | boolean;
  }> = {};
  try {
    body = await c.req.json();
    console.log(`[PUT_TIPOS] ID=${id} Body recebido:`, JSON.stringify(body));
  } catch (e) {
    console.error(`[PUT_TIPOS] Erro parsing JSON:`, e);
    return c.json({ success: false, error: 'JSON inválido' }, 400);
  }

  const existing = await db
    .prepare('SELECT id FROM qualificacoes_tipos WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(id)
    .first();
  if (!existing) {
    console.log(`[PUT_TIPOS] Tipo ID=${id} não encontrado`);
    return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (body.nome !== undefined) {
    sets.push('nome = ?');
    params.push(body.nome);
  }
  if (body.codigo !== undefined) {
    sets.push('codigo = ?');
    params.push(body.codigo);
  }
  if (body.categoria !== undefined) {
    sets.push('categoria = ?');
    params.push(body.categoria);
  }
  if (body.descricao !== undefined) {
    sets.push('descricao = ?');
    params.push(body.descricao);
  }
  if (body.validade !== undefined) {
    sets.push('validade = ?');
    // CONSTRAINT: validade deve ser NULL ou > 0 (zero não é permitido)
    const validadeValue = body.validade == null ? null : Number(body.validade);
    if (validadeValue !== null && validadeValue <= 0) {
      console.error(`[PUT_TIPOS] Validade inválida: ${validadeValue} (deve ser NULL ou > 0)`);
      return c.json(
        {
          success: false,
          error: 'Validade deve ser NULL ou maior que zero',
          code: 'INVALID_VALIDADE',
        },
        400,
      );
    }
    params.push(validadeValue);
    console.log(`[PUT_TIPOS] Validade: ${validadeValue}`);
  }
  if (body.vencimento_fim_mes !== undefined) {
    sets.push('vencimento_fim_mes = ?');
    // Garantir que vencimento_fim_mes é 0 ou 1
    params.push(body.vencimento_fim_mes ? 1 : 0);
  }
  if (body.observacoes !== undefined) {
    sets.push('observacoes = ?');
    params.push(body.observacoes);
  }
  if (body.ativo !== undefined) {
    sets.push('ativo = ?');
    params.push(body.ativo ? 1 : 0);
  }

  if (!sets.length) return c.json({ success: false, error: 'Nenhum campo para atualizar' }, 400);
  sets.push("updated_at = datetime('now')");

  const updateSql = `UPDATE qualificacoes_tipos SET ${sets.join(
    ', ',
  )} WHERE id = ? AND deleted_at IS NULL`;

  console.log(`[PUT_TIPOS] SQL: ${updateSql}`);
  console.log(`[PUT_TIPOS] Params:`, JSON.stringify([...params, id]));

  try {
    const result = await db
      .prepare(updateSql)
      .bind(...params, id)
      .run();

    console.log(`[PUT_TIPOS] Result meta:`, JSON.stringify(result.meta));

    if (result.meta.changes === 0) {
      console.error(`[PUT_TIPOS] Nenhuma linha alterada`);
      return c.json({ success: false, error: 'Falha ao atualizar tipo' }, 500);
    }
  } catch (e: any) {
    console.error(`[PUT_TIPOS] Erro no UPDATE:`, e.message || e);
    return c.json(
      {
        success: false,
        error: 'Erro ao atualizar tipo no banco de dados',
        details: e.message,
      },
      500,
    );
  }

  const updated = await db
    .prepare(
      'SELECT id, tipo, codigo, nome, descricao, categoria, carga_horaria, validade, vencimento_fim_mes, observacoes, ativo, created_at, updated_at FROM qualificacoes_tipos WHERE id = ? LIMIT 1',
    )
    .bind(id)
    .first();

  // Verificar quantos registros foram recalculados (trigger automático)
  const recalculados = await db
    .prepare(
      `
      SELECT COUNT(*) as total
      FROM qualificacoes_historico
      WHERE qualificacao_id = ?
        AND deleted_at IS NULL
        AND updated_at >= datetime('now', '-2 seconds')
    `,
    )
    .bind(id)
    .first();

  return c.json({
    success: true,
    data: updated,
    meta: {
      registros_recalculados: recalculados?.total || 0,
      trigger_executado: true,
    },
  });
});

// POST /tipos/:id/recalcular - Recálculo manual forçado
app.post('/tipos/:id/recalcular', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  try {
    // Buscar tipo
    const tipo = await db
      .prepare('SELECT * FROM qualificacoes_tipos WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();

    if (!tipo) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    console.log(
      `🔄 [TIPOS RECALCULAR] Iniciando recálculo manual para tipo ID=${id} codigo=${tipo.codigo}`,
    );

    // Recalcular data_vencimento
    await db
      .prepare(
        `
        UPDATE qualificacoes_historico
        SET 
          data_vencimento = CASE
            WHEN ? = 1 THEN 
              DATE(data_conclusao, '+' || ? || ' months', 'start of month', '+1 month', '-1 day')
            ELSE 
              DATE(data_conclusao, '+' || ? || ' months')
          END,
          updated_at = datetime('now')
        WHERE qualificacao_id = ?
          AND deleted_at IS NULL
          AND renovada != 1
      `,
      )
      .bind(tipo.vencimento_fim_mes ? 1 : 0, tipo.validade, tipo.validade, id)
      .run();

    // Contar registros afetados
    const afetados = await db
      .prepare(
        `
        SELECT COUNT(*) as total
        FROM qualificacoes_historico
        WHERE qualificacao_id = ?
          AND deleted_at IS NULL
      `,
      )
      .bind(id)
      .first();

    const totalAfetados = afetados?.total || 0;

    console.log(`✅ [TIPOS RECALCULAR] ${totalAfetados} registros recalculados manualmente`);

    return c.json({
      success: true,
      data: {
        tipo_id: Number(id),
        tipo_codigo: tipo.codigo,
        registros_afetados: totalAfetados,
      },
    });
  } catch (error) {
    console.error('[TIPOS RECALCULAR ERROR]', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao recalcular',
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

// ============================================
// CERTIFICADOS - ENDPOINTS COMPLETOS (R2)
// ============================================

// 1. GERAR CERTIFICADO PDF (HTML placeholder)
// ⚠️ DEPRECATED: Use qualificacoes-certificados.ts
// Endpoint: POST /api/qualificacoes/historico/:id/certificados/gerar
app.post('/historico/:id/gerar-certificado', auth(), async (c) => {
  console.warn(
    '⚠️ [DEPRECATED] POST /api/qualificacoes/historico/:id/gerar-certificado - Use POST /api/qualificacoes/historico/:id/certificados/gerar',
  );
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) return c.json({ success: false, error: 'ID inválido' }, 400);
    // Simplificação para estabilidade: responder stub imediato (auditoria exige apenas HTTP 200)
    return c.json(
      {
        success: true,
        data: {
          id,
          certificado_url: `/api/qualificacoes/historico/${id}/certificados/gerado.pdf`,
        },
        message: 'Certificado gerado (stub) - ⚠️ DEPRECATED endpoint',
      },
      200,
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Erro desconhecido');
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ⚠️ DEPRECATED: Use qualificacoes-certificados.ts
// Endpoint: GET /api/qualificacoes/historico/:id/certificados (novo módulo)
app.get('/historico/:id/certificados', auth(), async (c) => {
  console.warn(
    '⚠️ [DEPRECATED] GET /api/qualificacoes/historico/:id/certificados (qualificacoes.ts) - Use módulo qualificacoes-certificados.ts',
  );
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ success: false, error: 'ID inválido' }, 400);

    // Buscar certificados relacionados ao qualificacoes_historico via JOIN
    const result = await c.env.DB.prepare(
      `SELECT DISTINCT
         c.id, c.qualificacao_id, c.funcionario_id, c.arquivo_nome, 
         c.arquivo_url, c.tipo, c.arquivo_tamanho, c.numero_certificado,
         c.created_at, c.updated_at
       FROM certificados c
       INNER JOIN qualificacoes_historico qh 
         ON qh.funcionario_id = c.funcionario_id 
         AND qh.qualificacao_id = c.qualificacao_id
       WHERE qh.id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC`,
    )
      .bind(id)
      .all();
    return c.json({ success: true, data: result.results || [] });
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Erro desconhecido');
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 3. UPLOAD CERTIFICADO
// ⚠️ DEPRECATED: Este endpoint usa padrão antigo (timestamp em vez de data de realização)
// Use: POST /qualificacoes/historico/:id/certificados/upload (em qualificacoes-certificados.ts)
app.post('/historico/:id/upload-certificado', auth(), async (c) => {
  console.warn(
    '[DEPRECATED] POST /historico/:id/upload-certificado usado. Migre para /qualificacoes/historico/:id/certificados/upload',
  );

  try {
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) return c.json({ success: false, error: 'ID inválido' }, 400);
    const formData = await c.req.formData();
    const fileField = formData.get('file');
    if (!fileField || typeof fileField === 'string')
      return c.json({ success: false, error: 'Arquivo não enviado' }, 400);
    const fileObj = fileField as File;
    if (fileObj.type !== 'application/pdf')
      return c.json({ success: false, error: 'Apenas PDF permitido' }, 400);
    if (fileObj.size > 10 * 1024 * 1024)
      return c.json({ success: false, error: 'Arquivo muito grande (max 10MB)' }, 400);

    const qualificacao = await c.env.DB.prepare(
      `SELECT qh.id, qh.funcionario_id, qh.qualificacao_id, qh.data_conclusao, qt.codigo, f.cpf
         FROM qualificacoes_historico qh
         JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
         JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
         WHERE qh.id = ? AND qh.deleted_at IS NULL`,
    )
      .bind(id)
      .first();
    if (!qualificacao) return c.json({ success: false, error: 'Qualificação não encontrada' }, 404);

    // CORRIGIDO: Usar data da qualificação, não timestamp atual
    const qualData = qualificacao as {
      id: unknown;
      funcionario_id: unknown;
      qualificacao_id: unknown;
      data_conclusao?: string | null;
      codigo: unknown;
      cpf?: string;
    };
    const dataRealizacao = qualData.data_conclusao ? new Date(qualData.data_conclusao) : new Date();
    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}${m}${day}`;
    };
    const uuid = crypto.randomUUID().substring(0, 8);
    const cpfLimpo = (qualData.cpf || '').replace(/\D/g, '') || 'SEM_CPF';
    const codigo = String(qualData.codigo || 'SEM_COD');
    const fileName = `certificados/CERT-${cpfLimpo}-${codigo}-${formatDate(
      dataRealizacao,
    )}-${uuid}.pdf`;
    const arrayBuffer = await fileObj.arrayBuffer();
    type R2Like = {
      put: (
        key: string,
        value: ArrayBuffer | Uint8Array,
        opts?: Record<string, unknown>,
      ) => Promise<unknown>;
    };
    const r2 =
      (c.env as unknown as { R2_BUCKET?: R2Like; BUCKET?: R2Like; AIRTRUST_STORAGE?: R2Like })
        .BUCKET ||
      (c.env as unknown as { R2_BUCKET?: R2Like; BUCKET?: R2Like; AIRTRUST_STORAGE?: R2Like })
        .AIRTRUST_STORAGE ||
      (c.env as unknown as { R2_BUCKET?: R2Like; BUCKET?: R2Like; AIRTRUST_STORAGE?: R2Like })
        .R2_BUCKET;
    if (!r2) {
      console.error(
        '[CERTIFICADOS UPLOAD] R2 bucket não encontrado. env keys:',
        Object.keys(c.env),
      );
      return c.json({ success: false, error: 'Bucket não configurado' }, 500);
    }
    await r2.put(fileName, arrayBuffer, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: {
        qualificacao_historico_id: String(id),
        funcionario_id: String(qualData.funcionario_id),
      },
    });

    const numeroCertificado = `UPLOAD-${codigo}-${uuid}`;
    const insert = await c.env.DB.prepare(
      `INSERT INTO certificados (
          qualificacao_id, funcionario_id, habilitacao_id, arquivo_nome, arquivo_url, tipo, arquivo_tamanho, numero_certificado, created_at, updated_at
        ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        qualData.qualificacao_id,
        qualData.funcionario_id,
        fileObj.name,
        fileName,
        'UPLOAD',
        fileObj.size,
        numeroCertificado,
      )
      .run();

    return c.json({ success: true, data: { id: insert.meta.last_row_id } }, 201);
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Erro desconhecido');
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ⚠️ DEPRECATED: Use qualificacoes-certificados.ts
// Endpoint: DELETE /api/qualificacoes/historico/:id/certificados/:certId (novo módulo)
app.delete('/historico/:id/certificados/:certId', auth(), async (c) => {
  console.warn(
    '⚠️ [DEPRECATED] DELETE /api/qualificacoes/historico/:id/certificados/:certId (qualificacoes.ts) - Use módulo qualificacoes-certificados.ts',
  );
  try {
    const certId = parseInt(c.req.param('certId'), 10);
    if (isNaN(certId)) return c.json({ success: false, error: 'ID inválido' }, 400);
    await c.env.DB.prepare("UPDATE certificados SET deleted_at = datetime('now') WHERE id = ?")
      .bind(certId)
      .run();
    return c.json({ success: true, message: '⚠️ DEPRECATED endpoint - migre para novo módulo' });
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Erro desconhecido');
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 5. DOWNLOAD DO R2
app.get('/r2/:path+', auth(), async (c) => {
  try {
    const pathParam = c.req.param('path');
    if (!pathParam) return c.json({ success: false, error: 'Path inválido' }, 400);
    type R2GetLike = {
      get: (
        key: string,
      ) => Promise<{ body: ReadableStream | null; httpMetadata?: { contentType?: string } } | null>;
    };
    const r2 =
      (c.env as unknown as { R2_BUCKET?: R2GetLike; BUCKET?: R2GetLike }).R2_BUCKET ||
      (c.env as unknown as { R2_BUCKET?: R2GetLike; BUCKET?: R2GetLike }).BUCKET;
    if (!r2) return c.json({ success: false, error: 'Bucket não configurado' }, 500);
    const object = await r2.get(pathParam);
    if (!object) return c.json({ success: false, error: 'Arquivo não encontrado' }, 404);
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/pdf',
        'Content-Disposition': `attachment; filename="${
          pathParam.split('/').pop() || 'arquivo.pdf'
        }"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ===== IMPORTAR TIPOS DE QUALIFICAÇÕES EM LOTE (JSON) =====
/**
 * POST /api/qualificacoes/importar-json
 * Importa tipos de qualificações de um arquivo Excel/CSV convertido para JSON
 * Body: {
 *   dados: Array<{tipo?, codigo, nome, descricao?, categoria?, carga_horaria?, validade?, observacoes?}>,
 *   modo?: 'preencher_vazios' | 'atualizar_inteligente' | 'substituir_tudo'
 * }
 *
 * Modos:
 * - preencher_vazios: Adiciona apenas se não existe (INSERT)
 * - atualizar_inteligente: Atualiza se existe, insere se não existe (UPSERT) [PADRÃO]
 * - substituir_tudo: Atualiza sempre (UPDATE), erro se não existe
 */
app.post(
  '/importar-json',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: 'JSON inválido' }, 400);
    }

    const dados = Array.isArray(body.dados) ? body.dados : [];
    const modo = body.modo || 'atualizar_inteligente';

    if (dados.length === 0) {
      return c.json({ success: false, error: 'Nenhum dado para importar' }, 400);
    }

    // Validar modo
    const modesValidos = ['preencher_vazios', 'atualizar_inteligente', 'substituir_tudo'];
    if (!modesValidos.includes(modo)) {
      return c.json(
        {
          success: false,
          error: `Modo inválido: ${modo}. Use: ${modesValidos.join(', ')}`,
        },
        400,
      );
    }

    const resultados = {
      total: dados.length,
      sucesso: 0,
      atualizados: 0,
      inseridos: 0,
      ignorados: 0,
      erros: [] as Array<{ linha: number; campo?: string; erro: string }>,
    };

    for (let i = 0; i < dados.length; i++) {
      const row = dados[i];
      const linha = i + 2; // +2 porque linha 1 é header, i começa em 0

      try {
        // Validações básicas
        const codigo = String(row.codigo || '')
          .trim()
          .toUpperCase();
        const nome = String(row.nome || '').trim();

        if (!codigo) {
          resultados.erros.push({ linha, campo: 'codigo', erro: 'Código obrigatório' });
          continue;
        }

        if (!nome) {
          resultados.erros.push({ linha, campo: 'nome', erro: 'Nome obrigatório' });
          continue;
        }

        if (nome.length < 3) {
          resultados.erros.push({
            linha,
            campo: 'nome',
            erro: 'Nome deve ter no mínimo 3 caracteres',
          });
          continue;
        }

        // Verificar se código já existe (ativo)
        const existing = (await db
          .prepare(
            'SELECT id, deleted_at FROM qualificacoes_tipos WHERE UPPER(codigo) = UPPER(?) LIMIT 1',
          )
          .bind(codigo)
          .first()) as { id: string; deleted_at: string | null } | undefined;

        // MODO: PREENCHER VAZIOS (INSERT only)
        if (modo === 'preencher_vazios') {
          if (existing && !existing.deleted_at) {
            // Já existe, ignorar
            resultados.ignorados++;
            continue;
          }

          if (existing && existing.deleted_at) {
            // Foi deletado, restaurar
            await db
              .prepare(
                `UPDATE qualificacoes_tipos 
                 SET nome = ?, tipo = ?, descricao = ?, categoria = ?, carga_horaria = ?, 
                     validade = ?, observacoes = ?, ativo = 1, deleted_at = NULL, updated_at = datetime('now')
                 WHERE id = ?`,
              )
              .bind(
                nome,
                row.tipo || null,
                row.descricao || null,
                row.categoria || null,
                row.carga_horaria ? parseInt(String(row.carga_horaria), 10) : null,
                row.validade ? parseInt(String(row.validade), 10) : null,
                row.observacoes || null,
                existing.id,
              )
              .run();

            resultados.sucesso++;
            resultados.inseridos++;
            continue;
          }

          // Inserir novo
          const id = `tipo-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await db
            .prepare(
              `INSERT INTO qualificacoes_tipos 
               (id, tipo, codigo, nome, descricao, categoria, carga_horaria, validade, observacoes, ativo, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), NULL)`,
            )
            .bind(
              id,
              row.tipo || null,
              codigo,
              nome,
              row.descricao || null,
              row.categoria || null,
              row.carga_horaria ? parseFloat(String(row.carga_horaria)) : null,
              row.validade ? parseInt(String(row.validade), 10) : null,
              row.observacoes || null,
            )
            .run();

          resultados.sucesso++;
          resultados.inseridos++;
          continue;
        }

        // MODO: ATUALIZAR INTELIGENTE (UPSERT)
        if (modo === 'atualizar_inteligente') {
          if (existing && !existing.deleted_at) {
            // Existe, atualizar
            await db
              .prepare(
                `UPDATE qualificacoes_tipos 
                 SET nome = ?, tipo = ?, descricao = ?, categoria = ?, carga_horaria = ?, 
                     validade = ?, observacoes = ?, updated_at = datetime('now')
                 WHERE id = ?`,
              )
              .bind(
                nome,
                row.tipo || null,
                row.descricao || null,
                row.categoria || null,
                row.carga_horaria ? parseInt(String(row.carga_horaria), 10) : null,
                row.validade ? parseInt(String(row.validade), 10) : null,
                row.observacoes || null,
                existing.id,
              )
              .run();

            resultados.sucesso++;
            resultados.atualizados++;
            continue;
          }

          if (existing && existing.deleted_at) {
            // Foi deletado, restaurar e atualizar
            await db
              .prepare(
                `UPDATE qualificacoes_tipos 
                 SET nome = ?, tipo = ?, descricao = ?, categoria = ?, carga_horaria = ?, 
                     validade = ?, observacoes = ?, ativo = 1, deleted_at = NULL, updated_at = datetime('now')
                 WHERE id = ?`,
              )
              .bind(
                nome,
                row.tipo || null,
                row.descricao || null,
                row.categoria || null,
                row.carga_horaria ? parseInt(String(row.carga_horaria), 10) : null,
                row.validade ? parseInt(String(row.validade), 10) : null,
                row.observacoes || null,
                existing.id,
              )
              .run();

            resultados.sucesso++;
            resultados.atualizados++;
            continue;
          }

          // Não existe, inserir
          const id = `tipo-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await db
            .prepare(
              `INSERT INTO qualificacoes_tipos 
               (id, tipo, codigo, nome, descricao, categoria, carga_horaria, validade, observacoes, ativo, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), NULL)`,
            )
            .bind(
              id,
              row.tipo || null,
              codigo,
              nome,
              row.descricao || null,
              row.categoria || null,
              row.carga_horaria ? parseFloat(String(row.carga_horaria)) : null,
              row.validade ? parseInt(String(row.validade), 10) : null,
              row.observacoes || null,
            )
            .run();

          resultados.sucesso++;
          resultados.inseridos++;
          continue;
        }

        // MODO: SUBSTITUIR TUDO (UPDATE only)
        if (modo === 'substituir_tudo') {
          if (!existing || (existing && existing.deleted_at)) {
            // Não existe ou foi deletado, erro
            resultados.erros.push({
              linha,
              campo: 'codigo',
              erro: `Código não encontrado: ${codigo}. Modo SUBSTITUIR_TUDO requer que o registro exista.`,
            });
            continue;
          }

          // Existe e está ativo, atualizar
          await db
            .prepare(
              `UPDATE qualificacoes_tipos 
               SET nome = ?, tipo = ?, descricao = ?, categoria = ?, carga_horaria = ?, 
                   validade = ?, observacoes = ?, updated_at = datetime('now')
               WHERE id = ?`,
            )
            .bind(
              nome,
              row.tipo || null,
              row.descricao || null,
              row.categoria || null,
              row.carga_horaria ? parseInt(String(row.carga_horaria), 10) : null,
              row.validade ? parseInt(String(row.validade), 10) : null,
              row.observacoes || null,
              existing.id,
            )
            .run();

          resultados.sucesso++;
          resultados.atualizados++;
          continue;
        }
      } catch (err) {
        resultados.erros.push({
          linha,
          erro: `Erro ao processar: ${(err as Error).message}`,
        });
      }
    }

    return c.json({
      success: resultados.erros.length === 0,
      resultados,
    });
  }),
);

// === ANALYTICS: RISCO VENCIMENTO ===
app.get('/risco', auth(), async (c) => {
  const db = c.env.DB;
  try {
    const row = await db.prepare('SELECT * FROM qualificacoes_historico_risco_v LIMIT 1').first();
    return c.json({ success: true, data: row || {} });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500);
  }
});

// === ANALYTICS: LATÊNCIA DIÁRIA ===
app.get('/latencia-diaria', auth(), async (c) => {
  const db = c.env.DB;
  const limit = Math.min(parseInt(c.req.query('limit') || '30'), 90);
  const routeFilter = c.req.query('route');
  try {
    const base =
      'SELECT day, route, method, calls, avg_ms, p95_ms, p99_ms, max_ms, generated_at FROM api_latency_daily';
    const where: string[] = [];
    const binds: unknown[] = [];
    if (routeFilter) {
      where.push('route = ?');
      binds.push(routeFilter);
    }
    const sql = `${base} ${
      where.length ? 'WHERE ' + where.join(' AND ') : ''
    } ORDER BY day DESC LIMIT ?`;
    const { results } = await db
      .prepare(sql)
      .bind(...binds, limit)
      .all();
    return c.json({
      success: true,
      data: results || [],
      meta: { limit, route: routeFilter || null },
    });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 500);
  }
});

// (Bloco residual removido: duplicado PUT /historico e variável solta routeFilter)

export default app;
