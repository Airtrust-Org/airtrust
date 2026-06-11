/**
 * QUALIFICACOES - MÓDULO TIPOS
 * Gestão de tipos de qualificações (CRUD)
 *
 * Endpoints:
 * - GET /tipos - Lista tipos
 * - POST /tipos - Cria tipo
 * - PUT /tipos/:id - Atualiza tipo
 * - DELETE /tipos/:id - Deleta tipo (soft delete)
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getTenantContext } from '../../middleware/tenant';
import { z } from 'zod';
import {
  buildHistoricoTipoSnapshot,
  shouldSyncHistoricoSnapshotsOnTipoUpdate,
  type QualificacaoTipoSnapshot,
} from '../../services/qualificacoes-tipos-sync';
import {
  isEadCategoria,
  reconcileImportedEdappHistory,
  softDeleteLmsCourseForQualificacaoTipo,
  syncLmsCourseFromQualificacaoTipo,
} from '../../services/lms-ead-ssot';

type TipoAtualizadoRow = {
  id: number;
  codigo: string | null;
  nome: string | null;
  categoria: string | null;
  validade: number | null;
  vencimento_fim_mes: number | null;
  carga_horaria: number | null;
  carga_horaria_inicial: number | null;
  carga_horaria_recorrente: number | null;
};

type HistoricoTipoSyncRow = {
  id: number;
  funcionario_id: number;
  data_conclusao: string | null;
  data_vencimento: string | null;
  tipo_treinamento: string | null;
  qualificacao_codigo: string | null;
  nascimento_funcionario: string | null;
  conflito_codigo: number;
};

type TipoExistenteRow = {
  id: number;
  deleted_at: string | null;
};

const router = new Hono<{ Bindings: Env }>();

let tiposHasIsCheckCache: boolean | null = null;

type TiposColumnsSupport = {
  hasIsCheck: boolean;
  hasConteudoProgramatico: boolean;
  hasCargaInicial: boolean;
  hasCargaRecorrente: boolean;
};

function deriveModeloTipo(validade: number | null | undefined, categoria?: string | null): string {
  if (Number(validade || 0) === 6) return 'SEMESTRAL';
  return String(categoria || '')
    .trim()
    .toUpperCase();
}

function normalizeTipoCodigo(value: string): string {
  return value.trim().toUpperCase();
}

function isTipoCodigoUniqueConstraintError(error: unknown): boolean {
  const message = (error as Error)?.message || String(error || '');
  return message.includes('UNIQUE constraint failed: qualificacoes_tipos.codigo');
}

async function qualificacoesTiposHasIsCheck(db: D1Database): Promise<boolean> {
  if (tiposHasIsCheckCache !== null) return tiposHasIsCheckCache;
  try {
    const info = await db.prepare("PRAGMA table_info('qualificacoes_tipos')").all();
    const cols = (info.results || []) as Array<{ name?: string }>;
    tiposHasIsCheckCache = cols.some((c) => c.name === 'is_check');
    return tiposHasIsCheckCache;
  } catch {
    tiposHasIsCheckCache = false;
    return false;
  }
}

async function loadQualificacoesTiposColumnsSupport(
  db: D1Database,
): Promise<TiposColumnsSupport> {
  const info = await db.prepare("PRAGMA table_info('qualificacoes_tipos')").all();
  const cols = (info.results || []) as Array<{ name?: string }>;
  const hasColumn = (columnName: string) => cols.some((c) => c.name === columnName);

  const hasCargaInicial = hasColumn('carga_horaria_inicial');
  const hasCargaRecorrente = hasColumn('carga_horaria_recorrente');
  const hasConteudoProgramatico = hasColumn('conteudo_programatico');
  const hasIsCheck = hasColumn('is_check');

  return {
    hasIsCheck,
    hasConteudoProgramatico,
    hasCargaInicial,
    hasCargaRecorrente,
  };
}

// ===== SCHEMAS VALIDAÇÃO =====
const createTipoSchema = z.object({
  nome: z.string().min(3, 'Nome obrigatório (mínimo 3 caracteres)'),
  codigo: z.string().min(1, 'Código obrigatório'),
  categoria: z.string().min(1, 'Categoria obrigatória'),
  descricao: z.string().optional(),
  conteudo_programatico: z.string().nullable().optional(),
  carga_horaria_inicial: z.number().nullable().optional(),
  carga_horaria_recorrente: z.number().nullable().optional(),
  validade: z.number().nullable().optional(),
  vencimento_fim_mes: z.number().optional().default(1),
  observacoes: z.string().nullable().optional(),
  ativo: z.union([z.boolean(), z.number()]).optional().default(true),
  is_check: z.union([z.boolean(), z.number()]).optional().default(false),
});

const updateTipoSchema = z.object({
  nome: z.string().min(3).optional(),
  codigo: z.string().min(1).optional().nullable(),
  categoria: z.string().min(1).optional().nullable(),
  descricao: z.string().optional().nullable(),
  conteudo_programatico: z.string().optional().nullable(),
  carga_horaria_inicial: z.number().nullable().optional(),
  carga_horaria_recorrente: z.number().nullable().optional(),
  validade: z.number().nullable().optional(),
  vencimento_fim_mes: z.number().optional().nullable(),
  observacoes: z.string().nullable().optional(),
  ativo: z.union([z.boolean(), z.number()]).optional(),
  is_check: z.union([z.boolean(), z.number()]).optional(),
});

// ===== HELPERS =====
function safe(fn: (c: any) => Promise<Response> | Response) {
  return async (c: any) => {
    try {
      return await fn(c);
    } catch (e) {
      const errorMessage = (e as Error).message || String(e);
      console.error('[TIPOS_ERROR]', errorMessage, (e as Error).stack);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  };
}

async function logAuditoria(db: D1Database, entidade: string, entidade_id: string, acao: string) {
  try {
    const auditTable = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_avancada_v2' LIMIT 1",
      )
      .first();
    if (auditTable) {
      await db
        .prepare(
          "INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, origem) VALUES (?, ?, ?, 'api')",
        )
        .bind(entidade, entidade_id, acao)
        .run();
    }
  } catch (e) {
    console.warn('[AUDITORIA] falha ao registrar:', (e as Error).message);
  }
}

// ===== ENDPOINTS =====

/**
 * GET /tipos
 * Lista tipos de qualificações
 */
router.get(
  '/',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const columnsSupport = await loadQualificacoesTiposColumnsSupport(db);
    const hasIsCheck = columnsSupport.hasIsCheck;
    const limitRaw = c.req.query('limit');
    const limitParsed = parseInt(limitRaw || '200', 10);
    const limitFinal = Math.min(Math.max(limitParsed, 1), 500);

    const { results } = await db
      .prepare(
        `SELECT id, tipo, codigo, nome, descricao, categoria, carga_horaria, ${
          columnsSupport.hasCargaInicial ? 'carga_horaria_inicial' : 'NULL as carga_horaria_inicial'
        }, ${
          columnsSupport.hasCargaRecorrente
            ? 'carga_horaria_recorrente'
            : 'NULL as carga_horaria_recorrente'
        }, ${
          columnsSupport.hasConteudoProgramatico
            ? 'conteudo_programatico'
            : 'NULL as conteudo_programatico'
        }, validade, vencimento_fim_mes, observacoes, ativo, ${
          hasIsCheck ? 'is_check' : '0 as is_check'
        }, created_at, updated_at,
        (SELECT COUNT(*) FROM qualificacoes_historico qh WHERE qh.qualificacao_id = qualificacoes_tipos.id AND qh.deleted_at IS NULL) AS total_no_historico
        FROM qualificacoes_tipos WHERE deleted_at IS NULL AND empresa_id = ? ORDER BY categoria, nome LIMIT ?`,
      )
      .bind(empresaId, limitFinal)
      .all();

    return c.json({
      success: true,
      data: results || [],
      meta: { count: (results || []).length, limit: limitFinal },
    });
  }),
);

router.get(
  '/:id',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const columnsSupport = await loadQualificacoesTiposColumnsSupport(db);
    const hasIsCheck = columnsSupport.hasIsCheck;
    const id = c.req.param('id');

    const tipo = await db
      .prepare(
        `SELECT id, tipo, codigo, nome, descricao, categoria, carga_horaria, ${
          columnsSupport.hasCargaInicial ? 'carga_horaria_inicial' : 'NULL as carga_horaria_inicial'
        }, ${
          columnsSupport.hasCargaRecorrente
            ? 'carga_horaria_recorrente'
            : 'NULL as carga_horaria_recorrente'
        }, ${
          columnsSupport.hasConteudoProgramatico
            ? 'conteudo_programatico'
            : 'NULL as conteudo_programatico'
        }, validade, vencimento_fim_mes, observacoes, ativo, ${
          hasIsCheck ? 'is_check' : '0 as is_check'
        }, created_at, updated_at
        FROM qualificacoes_tipos
        WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?
        LIMIT 1`,
      )
      .bind(id, empresaId)
      .first();

    if (!tipo) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    return c.json({ success: true, data: tipo });
  }),
);

/**
 * POST /tipos
 * Cria novo tipo
 */
router.post(
  '/',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const columnsSupport = await loadQualificacoesTiposColumnsSupport(db);
    const hasIsCheck = columnsSupport.hasIsCheck;
    const body = await c.req.json();

    // Validar com Zod
    const parsed = createTipoSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return c.json(
        {
          success: false,
          error: 'Validação falhou',
          details: errors,
        },
        400,
      );
    }

    const data = parsed.data;
    const codigo = normalizeTipoCodigo(data.codigo);
    const nome = data.nome.trim();
    const categoria = data.categoria.trim();

    // Verificar duplicidade
    const existing = await db
      .prepare(
        `SELECT id, empresa_id, deleted_at
           FROM qualificacoes_tipos
         WHERE UPPER(TRIM(codigo)) = ?
           AND empresa_id = ?
          LIMIT 1`,
      )
      .bind(codigo, empresaId)
      .first();

    const existingRow = existing as TipoExistenteRow | null;

    if (existingRow && !existingRow.deleted_at) {
      return c.json({ success: false, error: 'Código já existe' }, 409);
    }

    const validade = data.validade == null ? null : Number(data.validade);
    const cargaHorariaInicial =
      data.carga_horaria_inicial == null ? null : Number(data.carga_horaria_inicial);
    const cargaHorariaRecorrente =
      data.carga_horaria_recorrente == null ? null : Number(data.carga_horaria_recorrente);
    const conteudoProgramatico = data.conteudo_programatico?.trim() || null;
    const vencimentoFimMes = data.vencimento_fim_mes ? 1 : 0;
    const ativo = data.ativo === false ? 0 : 1;
    const isCheck = data.is_check ? 1 : 0;

    // Inserir
    const insertSql = hasIsCheck
      ? `INSERT INTO qualificacoes_tipos 
         (tipo, codigo, nome, descricao, categoria, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente, conteudo_programatico, validade, vencimento_fim_mes, observacoes, ativo, is_check, empresa_id, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)`
      : `INSERT INTO qualificacoes_tipos 
         (tipo, codigo, nome, descricao, categoria, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente, conteudo_programatico, validade, vencimento_fim_mes, observacoes, ativo, empresa_id, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)`;

    const insertBinds: unknown[] = [
      deriveModeloTipo(validade, categoria),
      codigo,
      nome,
      data.descricao || null,
      categoria,
      cargaHorariaRecorrente,
      cargaHorariaInicial,
      cargaHorariaRecorrente,
      conteudoProgramatico,
      validade,
      vencimentoFimMes,
      data.observacoes || null,
      ativo,
    ];
    if (hasIsCheck) insertBinds.push(isCheck);
    insertBinds.push(empresaId);

    if (existing?.deleted_at) {
      const restoreSql = hasIsCheck
        ? `UPDATE qualificacoes_tipos
              SET tipo = ?,
                  codigo = ?,
                  nome = ?,
                  descricao = ?,
                  categoria = ?,
                  carga_horaria = ?,
                  carga_horaria_inicial = ?,
                  carga_horaria_recorrente = ?,
                  conteudo_programatico = ?,
                  validade = ?,
                  vencimento_fim_mes = ?,
                  observacoes = ?,
                  ativo = ?,
                  is_check = ?,
                  deleted_at = NULL,
                  updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ?`
        : `UPDATE qualificacoes_tipos
              SET tipo = ?,
                  codigo = ?,
                  nome = ?,
                  descricao = ?,
                  categoria = ?,
                  carga_horaria = ?,
                  carga_horaria_inicial = ?,
                  carga_horaria_recorrente = ?,
                  conteudo_programatico = ?,
                  validade = ?,
                  vencimento_fim_mes = ?,
                  observacoes = ?,
                  ativo = ?,
                  deleted_at = NULL,
                  updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ?`;

      const restoreBinds = [...insertBinds.slice(0, -1), existing.id, empresaId];

      await db
        .prepare(restoreSql)
        .bind(...restoreBinds)
        .run();

      const restored = await db
        .prepare(
          `SELECT id, empresa_id, tipo, codigo, nome, descricao, categoria, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente, conteudo_programatico, validade, vencimento_fim_mes, observacoes, ativo, ${
            hasIsCheck ? 'is_check' : '0 as is_check'
          }, created_at, updated_at FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? LIMIT 1`,
        )
        .bind(existing.id, empresaId)
        .first();

      await logAuditoria(db, 'qualificacoes_tipos', String(existing.id), 'RESTORE');

      if (isEadCategoria(categoria) && (restored as { empresa_id?: number | null })?.empresa_id) {
        await syncLmsCourseFromQualificacaoTipo(db, {
          empresaId: Number((restored as { empresa_id: number }).empresa_id),
          qualificacaoTipoId: existing.id,
        });
        await reconcileImportedEdappHistory(db, {
          empresaId: Number((restored as { empresa_id: number }).empresa_id),
          qualificacaoTipoId: existing.id,
        });
      }

      return c.json(
        {
          success: true,
          data: restored,
          message: 'Tipo reativado com sucesso',
        },
        200,
      );
    }

    let result;
    try {
      result = await db
        .prepare(insertSql)
        .bind(...insertBinds)
        .run();
    } catch (error) {
      if (isTipoCodigoUniqueConstraintError(error)) {
        return c.json({ success: false, error: 'Código já existe' }, 409);
      }
      throw error;
    }

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao criar tipo' }, 500);
    }

    const newId = result.meta.last_row_id;

    // Buscar registro criado
    const created = await db
      .prepare(
        `SELECT id, empresa_id, tipo, codigo, nome, descricao, categoria, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente, conteudo_programatico, validade, vencimento_fim_mes, observacoes, ativo, ${
          hasIsCheck ? 'is_check' : '0 as is_check'
        }, created_at, updated_at FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? LIMIT 1`,
      )
      .bind(newId, empresaId)
      .first();

    // Auditoria
    await logAuditoria(db, 'qualificacoes_tipos', String(newId), 'CREATE');

    if (isEadCategoria(categoria) && (created as { empresa_id?: number | null })?.empresa_id) {
      await syncLmsCourseFromQualificacaoTipo(db, {
        empresaId: Number((created as { empresa_id: number }).empresa_id),
        qualificacaoTipoId: Number(newId),
      });
      await reconcileImportedEdappHistory(db, {
        empresaId: Number((created as { empresa_id: number }).empresa_id),
        qualificacaoTipoId: Number(newId),
      });
    }

    return c.json({ success: true, data: created, message: 'Tipo criado com sucesso' }, 201);
  }),
);

/**
 * PUT /tipos/:id
 * Atualiza tipo
 */
router.put(
  '/:id',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const columnsSupport = await loadQualificacoesTiposColumnsSupport(db);
    const hasIsCheck = columnsSupport.hasIsCheck;
    const id = c.req.param('id');
    const body = await c.req.json();

    // Validar com Zod
    const parsed = updateTipoSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return c.json(
        {
          success: false,
          error: 'Validação falhou',
          details: errors,
        },
        400,
      );
    }

    const data = parsed.data;

    // Verificar se tipo existe
    const existing = await db
      .prepare(
        'SELECT id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(id, empresaId)
      .first();

    if (!existing) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    // Se atualizando código, verificar duplicidade
    if (data.codigo) {
      const codigoExistente = await db
        .prepare(
          'SELECT id FROM qualificacoes_tipos WHERE UPPER(codigo) = UPPER(?) AND id != ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
        )
        .bind(normalizeTipoCodigo(data.codigo), id, empresaId)
        .first();

      if (codigoExistente) {
        return c.json({ success: false, error: 'Código já existe' }, 409);
      }
    }

    const rowAtual = (await db
      .prepare(
        'SELECT empresa_id, categoria, validade FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(id, empresaId)
      .first()) as { empresa_id: number; categoria: string | null; validade: number | null } | null;

    const categoriaFinal =
      data.categoria !== undefined
        ? (data.categoria || '').trim()
        : String(rowAtual?.categoria || '');
    const validadeFinal =
      data.validade !== undefined
        ? data.validade == null
          ? null
          : Number(data.validade)
        : (rowAtual?.validade ?? null);

    // Construir UPDATE dinâmico
    const updateParts: string[] = [];
    const binds: unknown[] = [];

    if (data.nome) {
      updateParts.push('nome = ?');
      binds.push(data.nome.trim());
    }
    if (data.codigo) {
      updateParts.push('codigo = ?');
      binds.push(normalizeTipoCodigo(data.codigo));
    }
    if (data.categoria) {
      updateParts.push('categoria = ?');
      binds.push(data.categoria.trim());
    }
    if (data.descricao !== undefined) {
      updateParts.push('descricao = ?');
      binds.push(data.descricao || null);
    }
    if (data.conteudo_programatico !== undefined) {
      updateParts.push('conteudo_programatico = ?');
      binds.push(data.conteudo_programatico || null);
    }
    if (data.carga_horaria_inicial !== undefined) {
      updateParts.push('carga_horaria_inicial = ?');
      binds.push(data.carga_horaria_inicial == null ? null : Number(data.carga_horaria_inicial));
    }
    if (data.carga_horaria_recorrente !== undefined) {
      updateParts.push('carga_horaria_recorrente = ?');
      binds.push(
        data.carga_horaria_recorrente == null ? null : Number(data.carga_horaria_recorrente),
      );
      updateParts.push('carga_horaria = ?');
      binds.push(
        data.carga_horaria_recorrente == null ? null : Number(data.carga_horaria_recorrente),
      );
    }
    if (data.validade !== undefined) {
      updateParts.push('validade = ?');
      binds.push(data.validade == null ? null : Number(data.validade));
    }
    if (data.categoria !== undefined || data.validade !== undefined) {
      updateParts.push('tipo = ?');
      binds.push(deriveModeloTipo(validadeFinal, categoriaFinal));
    }
    if (data.vencimento_fim_mes !== undefined) {
      updateParts.push('vencimento_fim_mes = ?');
      binds.push(data.vencimento_fim_mes ? 1 : 0);
    }
    if (data.observacoes !== undefined) {
      updateParts.push('observacoes = ?');
      binds.push(data.observacoes || null);
    }
    if (data.ativo !== undefined) {
      updateParts.push('ativo = ?');
      binds.push(data.ativo ? 1 : 0);
    }

    if (hasIsCheck && data.is_check !== undefined) {
      updateParts.push('is_check = ?');
      binds.push(data.is_check ? 1 : 0);
    }

    if (updateParts.length === 0) {
      return c.json({ success: false, error: 'Nada para atualizar' }, 400);
    }

    updateParts.push("updated_at = datetime('now')");
    const sql = `UPDATE qualificacoes_tipos SET ${updateParts.join(
      ', ',
    )} WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`;
    binds.push(id, empresaId);

    let result;
    try {
      result = await db
        .prepare(sql)
        .bind(...binds)
        .run();
    } catch (error) {
      if (isTipoCodigoUniqueConstraintError(error)) {
        return c.json({ success: false, error: 'Código já existe' }, 409);
      }
      throw error;
    }

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao atualizar tipo' }, 500);
    }

    let historicosSincronizados = 0;

    if (shouldSyncHistoricoSnapshotsOnTipoUpdate(data)) {
      const tipoAtualizado = (await db
        .prepare(
          `SELECT id, codigo, nome, categoria, validade, vencimento_fim_mes,
                  carga_horaria, carga_horaria_inicial, carga_horaria_recorrente
             FROM qualificacoes_tipos
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(id, empresaId)
        .first()) as TipoAtualizadoRow | null;

      if (tipoAtualizado) {
        const historicos = (await db
          .prepare(
            `SELECT qh.id,
                    qh.funcionario_id,
                    qh.data_conclusao,
                    qh.data_vencimento,
                    qh.tipo_treinamento,
                    qh.qualificacao_codigo,
                    CASE
                      WHEN EXISTS(
                        SELECT 1
                          FROM qualificacoes_historico qh_conf
                         WHERE qh_conf.id != qh.id
                           AND qh_conf.deleted_at IS NULL
                           AND qh_conf.funcionario_id = qh.funcionario_id
                           AND COALESCE(qh_conf.data_conclusao, '') = COALESCE(qh.data_conclusao, '')
                           AND COALESCE(qh_conf.qualificacao_codigo, ?) = ?
                      ) THEN 1
                      ELSE 0
                    END AS conflito_codigo,
                    f.nascimento AS nascimento_funcionario
               FROM qualificacoes_historico qh
               LEFT JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
              WHERE qh.qualificacao_id = ?
                AND qh.empresa_id = ?
                AND qh.deleted_at IS NULL`,
          )
          .bind(tipoAtualizado.codigo, tipoAtualizado.codigo, id, empresaId)
          .all()) as { results?: HistoricoTipoSyncRow[] };

        const tipoSnapshot: QualificacaoTipoSnapshot = {
          codigo: tipoAtualizado.codigo,
          nome: tipoAtualizado.nome,
          categoria: tipoAtualizado.categoria,
          validade: tipoAtualizado.validade,
          vencimentoFimMes: tipoAtualizado.vencimento_fim_mes,
          cargaHoraria: tipoAtualizado.carga_horaria,
          cargaHorariaInicial: tipoAtualizado.carga_horaria_inicial,
          cargaHorariaRecorrente: tipoAtualizado.carga_horaria_recorrente,
        };

        const statements = (historicos.results || []).map((historico: HistoricoTipoSyncRow) => {
          const snapshot = buildHistoricoTipoSnapshot(tipoSnapshot, {
            dataConclusao: historico.data_conclusao,
            dataVencimentoAtual: historico.data_vencimento,
            tipoTreinamento: historico.tipo_treinamento,
            nascimentoFuncionario: historico.nascimento_funcionario,
          });
          const qualificacaoCodigoFinal =
            historico.conflito_codigo === 1 &&
            snapshot.qualificacaoCodigo !== historico.qualificacao_codigo
              ? historico.qualificacao_codigo
              : snapshot.qualificacaoCodigo;

          return db
            .prepare(
              `UPDATE qualificacoes_historico
                  SET qualificacao_codigo = ?,
                      tipo = ?,
                      categoria = ?,
                      validade_meses = ?,
                      data_vencimento = ?,
                      carga_horaria = ?,
                      updated_at = datetime('now')
                WHERE id = ?
                  AND empresa_id = ?
                  AND deleted_at IS NULL`,
            )
            .bind(
              qualificacaoCodigoFinal,
              snapshot.tipo,
              snapshot.categoria,
              snapshot.validadeMeses,
              snapshot.dataVencimento,
              snapshot.cargaHoraria,
              historico.id,
              empresaId,
            );
        });

        if (statements.length > 0) {
          await db.batch(statements);
          historicosSincronizados = statements.length;
          console.log(
            `[TIPOS_SYNC] ${historicosSincronizados} historicos sincronizados para tipo_id=${id}`,
          );
        }
      }
    }

    // Auditoria
    await logAuditoria(db, 'qualificacoes_tipos', id, 'UPDATE');

    const categoriaEraEad = isEadCategoria(rowAtual?.categoria);
    const categoriaEhEad = isEadCategoria(categoriaFinal);

    // ⚠️ qualificacoes_tipos.id é TEXT (UUID desde migration 0031) — usar string diretamente
    const qualificacaoTipoId = String(id);

    if (rowAtual?.empresa_id && categoriaEhEad) {
      console.log(
        `[TIPOS_EAD] Sync EAD/LMS para tipo_id=${qualificacaoTipoId}, empresa=${rowAtual.empresa_id}`,
      );
      await syncLmsCourseFromQualificacaoTipo(db, {
        empresaId: rowAtual.empresa_id,
        qualificacaoTipoId,
      });
      await reconcileImportedEdappHistory(db, {
        empresaId: rowAtual.empresa_id,
        qualificacaoTipoId,
      });
    } else if (rowAtual?.empresa_id && categoriaEraEad && !categoriaEhEad) {
      console.log(
        `[TIPOS_EAD] Soft-delete LMS para tipo_id=${qualificacaoTipoId} (não é mais EAD)`,
      );
      await softDeleteLmsCourseForQualificacaoTipo(db, {
        empresaId: rowAtual.empresa_id,
        qualificacaoTipoId,
      });
    }

    return c.json({
      success: true,
      data: { id, historicos_sincronizados: historicosSincronizados },
      message: 'Tipo atualizado',
    });
  }),
);

/**
 * DELETE /tipos/:id
 * Deleta tipo (soft delete)
 */
router.delete(
  '/:id',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');

    if (!id || id.trim() === '') {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const existing = await db
      .prepare(
        'SELECT id, nome, empresa_id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(id, empresaId)
      .first();

    if (!existing) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    // Soft delete
    const result = await db
      .prepare(
        "UPDATE qualificacoes_tipos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL",
      )
      .bind(id, empresaId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao deletar tipo' }, 500);
    }

    // Auditoria
    await logAuditoria(db, 'qualificacoes_tipos', id, 'DELETE');
    await softDeleteLmsCourseForQualificacaoTipo(db, {
      empresaId: Number((existing as { empresa_id: number }).empresa_id),
      qualificacaoTipoId: String(id),
    });

    return c.json({ success: true, message: 'Tipo deletado com sucesso' });
  }),
);

export default router;
