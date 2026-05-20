/**
 * Integração AirTrust ↔ EdApp
 *
 * Módulo responsável por:
 * - Receber webhooks de conclusão de curso do EdApp
 * - Mapear cursos EdApp → qualificações AirTrust
 * - Gerar qualificações automaticamente no histórico
 * - Registrar auditoria de todas as operações
 *
 * @module integracoes/edapp
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';

// ========================
// Types
// ========================

interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  EDAPP_API_TOKEN: string;
  EDAPP_WEBHOOK_SECRET: string;
  ENVIRONMENT: string;
}

interface EdappUsuarioMap {
  funcionario_id: number;
  edapp_email: string | null;
}

interface EdappCursoMap {
  id: number;
  qualificacao_codigo: string;
  qualificacao_id: number | null;
  edapp_course_name: string | null;
  validade_meses: number;
}

// ========================
// Zod Schemas
// ========================

// Schema para webhook de conclusão de curso do EdApp
const edappWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    user_id: z.string(),
    user_email: z.string().email().optional(),
    user_name: z.string().optional(),
    course_id: z.string(),
    course_name: z.string().optional(),
    completed_at: z.string().optional(),
    score: z.number().optional().nullable(),
    passed: z.boolean().optional(),
    time_spent_seconds: z.number().optional(),
  }),
  timestamp: z.string().optional(),
});

// Schema para criar mapeamento de usuário
const criarUsuarioMapSchema = z.object({
  funcionario_id: z.number().int().positive(),
  edapp_user_id: z.string().min(1),
  edapp_email: z.string().email().optional(),
  edapp_username: z.string().optional(),
});

// Schema para criar mapeamento de curso
const criarCursoMapSchema = z.object({
  edapp_course_id: z.string().min(1),
  edapp_course_name: z.string().optional(),
  edapp_course_code: z.string().optional(),
  qualificacao_codigo: z.string().min(1),
  qualificacao_id: z.number().int().positive().optional(),
  validade_meses: z.number().int().positive().default(12),
});

// ========================
// Constants
// ========================

const EDAPP_SECRET_HEADER = 'X-EdApp-Secret';
const EVENTOS_CONCLUSAO = ['course.completed', 'course_completion', 'lesson.completed'];

// ========================
// Router
// ========================

const edappRouter = new Hono<{ Bindings: Env }>();

// ========================
// Helpers
// ========================

/**
 * Busca funcionário pelo ID do usuário EdApp
 */
async function findFuncionarioByEdappUserId(
  db: D1Database,
  edappUserId: string,
): Promise<EdappUsuarioMap | null> {
  const row = await db
    .prepare(
      `SELECT funcionario_id, edapp_email 
       FROM integracoes_edapp_usuarios 
       WHERE edapp_user_id = ? AND deleted_at IS NULL AND ativo = 1`,
    )
    .bind(edappUserId)
    .first<EdappUsuarioMap>();

  return row ?? null;
}

/**
 * Busca mapeamento de curso EdApp → qualificação AirTrust
 */
async function findQualificacaoByEdappCourseId(
  db: D1Database,
  edappCourseId: string,
): Promise<EdappCursoMap | null> {
  const row = await db
    .prepare(
      `SELECT id, qualificacao_codigo, qualificacao_id, edapp_course_name, validade_meses
       FROM integracoes_edapp_cursos 
       WHERE edapp_course_id = ? AND deleted_at IS NULL AND ativo = 1`,
    )
    .bind(edappCourseId)
    .first<EdappCursoMap>();

  return row ?? null;
}

/**
 * Busca dados do funcionário (para uso futuro)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getFuncionarioData(db: D1Database, funcionarioId: number) {
  return db
    .prepare(
      `SELECT id, nome, cpf, matricula 
       FROM funcionarios 
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(funcionarioId)
    .first<{ id: number; nome: string; cpf: string; matricula: string }>();
}

/**
 * Busca dados do tipo de qualificação pelo código
 */
async function getQualificacaoTipo(db: D1Database, codigo: string) {
  return db
    .prepare(
      `SELECT id, nome, codigo, validade 
       FROM qualificacoes_tipos 
       WHERE codigo = ? AND deleted_at IS NULL`,
    )
    .bind(codigo)
    .first<{ id: number; nome: string; codigo: string; validade: number | null }>();
}

/**
 * Calcula data de vencimento baseado na data de conclusão e validade em meses
 */
function calcularDataVencimento(dataConclusao: string, validadeMeses: number): string {
  const dt = new Date(dataConclusao);
  dt.setMonth(dt.getMonth() + validadeMeses);
  return dt.toISOString().split('T')[0];
}

/**
 * Gera qualificação no histórico a partir de conclusão de curso EdApp
 */
async function gerarQualificacaoEdapp(opts: {
  db: D1Database;
  funcionarioId: number;
  qualificacaoCodigo: string;
  qualificacaoId: number | null;
  validadeMeses: number;
  origem: string;
  dataConclusao?: string;
  score?: number | null;
  edappCourseId: string;
  edappUserId: string;
}): Promise<{ jaExistia: boolean; qualificacaoHistoricoId: number | null; mensagem: string }> {
  const {
    db,
    funcionarioId,
    qualificacaoCodigo,
    qualificacaoId,
    validadeMeses,
    origem,
    dataConclusao,
    score,
    edappCourseId,
    edappUserId,
  } = opts;

  // Data de conclusão (usa a do webhook ou hoje)
  const dtConclusao = dataConclusao
    ? dataConclusao.split('T')[0]
    : new Date().toISOString().split('T')[0];

  // Data de vencimento
  const dtVencimento = calcularDataVencimento(dtConclusao, validadeMeses);

  // Verificar se já existe qualificação vigente para este funcionário/código
  const existente = await db
    .prepare(
      `SELECT id, data_vencimento 
       FROM qualificacoes_historico 
       WHERE funcionario_id = ? 
         AND qualificacao_codigo = ? 
         AND data_vencimento >= date('now')
         AND deleted_at IS NULL
       ORDER BY data_vencimento DESC
       LIMIT 1`,
    )
    .bind(funcionarioId, qualificacaoCodigo)
    .first<{ id: number; data_vencimento: string }>();

  if (existente) {
    return {
      jaExistia: true,
      qualificacaoHistoricoId: existente.id,
      mensagem: `Qualificação vigente já existe (ID: ${existente.id}, vence em: ${existente.data_vencimento})`,
    };
  }

  // Buscar qualificacao_id se não foi fornecido
  let qualId = qualificacaoId;
  if (!qualId) {
    const tipo = await getQualificacaoTipo(db, qualificacaoCodigo);
    if (tipo) {
      qualId = tipo.id;
    }
  }

  // Montar observações
  const observacoes = [
    `Gerado automaticamente via EdApp`,
    `Curso: ${edappCourseId}`,
    `Usuário EdApp: ${edappUserId}`,
    score !== null && score !== undefined ? `Nota: ${score}` : null,
    `Origem: ${origem}`,
  ]
    .filter(Boolean)
    .join(' | ');

  // Inserir nova qualificação no histórico
  const result = await db
    .prepare(
      `INSERT INTO qualificacoes_historico (
        funcionario_id, 
        qualificacao_id,
        qualificacao_codigo, 
        data_conclusao,
        data_vencimento, 
        observacoes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(funcionarioId, qualId, qualificacaoCodigo, dtConclusao, dtVencimento, observacoes)
    .run();

  const qualificacaoHistoricoId = result.meta.last_row_id;

  return {
    jaExistia: false,
    qualificacaoHistoricoId: qualificacaoHistoricoId as number,
    mensagem: `Qualificação criada com sucesso (ID: ${qualificacaoHistoricoId})`,
  };
}

/**
 * Registra evento na tabela de log
 */
async function registrarEvento(
  db: D1Database,
  opts: {
    tipoEvento: string;
    edappUserId?: string;
    edappCourseId?: string;
    payload: string;
    erro?: string;
    funcionarioId?: number;
    qualificacaoHistoricoId?: number;
    processado?: boolean;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO integracoes_edapp_eventos (
        tipo_evento, 
        edapp_user_id, 
        edapp_course_id, 
        payload_json, 
        erro_ultima,
        funcionario_id,
        qualificacao_historico_id,
        processado,
        tentativas
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(
      opts.tipoEvento,
      opts.edappUserId ?? null,
      opts.edappCourseId ?? null,
      opts.payload,
      opts.erro ?? null,
      opts.funcionarioId ?? null,
      opts.qualificacaoHistoricoId ?? null,
      opts.processado ? 1 : 0,
    )
    .run();

  return result.meta.last_row_id as number;
}

/**
 * Atualiza evento com resultado do processamento
 */
async function atualizarEvento(
  db: D1Database,
  eventoId: number,
  opts: {
    processado?: boolean;
    erro?: string | null;
    funcionarioId?: number;
    qualificacaoHistoricoId?: number;
  },
): Promise<void> {
  const sets: string[] = ['tentativas = tentativas + 1'];
  const binds: (string | number | null)[] = [];

  if (opts.processado !== undefined) {
    sets.push('processado = ?');
    binds.push(opts.processado ? 1 : 0);
  }

  if (opts.erro !== undefined) {
    sets.push('erro_ultima = ?');
    binds.push(opts.erro);
  }

  if (opts.funcionarioId !== undefined) {
    sets.push('funcionario_id = ?');
    binds.push(opts.funcionarioId);
  }

  if (opts.qualificacaoHistoricoId !== undefined) {
    sets.push('qualificacao_historico_id = ?');
    binds.push(opts.qualificacaoHistoricoId);
  }

  binds.push(eventoId);

  await db
    .prepare(`UPDATE integracoes_edapp_eventos SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
}

/**
 * Registra auditoria
 */
async function auditEdapp(
  db: D1Database,
  opts: {
    tabela: string;
    acao: string;
    registroId: number;
    dadosNovos?: Record<string, unknown>;
    dadosAntigos?: Record<string, unknown>;
    usuarioId?: number;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO auditoria_avancada_v2 (
          tabela, acao, registro_id, dados_novos, dados_antigos, usuario_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        opts.tabela,
        opts.acao,
        opts.registroId,
        opts.dadosNovos ? JSON.stringify(opts.dadosNovos) : null,
        opts.dadosAntigos ? JSON.stringify(opts.dadosAntigos) : null,
        opts.usuarioId ?? null,
      )
      .run();
  } catch (e) {
    console.error('[EdApp Audit] Erro ao registrar auditoria:', e);
  }
}

// ========================
// ENDPOINTS
// ========================

/**
 * POST /webhook
 * Recebe webhooks de conclusão de curso do EdApp
 */
edappRouter.post('/webhook', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;
  let rawBody = '';

  try {
    // Validar secret do webhook
    const secretHeader = c.req.header(EDAPP_SECRET_HEADER);
    const expectedSecret = c.env.EDAPP_WEBHOOK_SECRET;

    if (!expectedSecret) {
      console.error('[EdApp Webhook] EDAPP_WEBHOOK_SECRET não configurado');
      return c.json({ success: false, error: 'Configuração inválida' }, 500);
    }

    if (secretHeader !== expectedSecret) {
      console.warn('[EdApp Webhook] Secret inválido recebido');
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    // Ler body
    rawBody = await c.req.text();
    console.log('[EdApp Webhook] Payload recebido:', rawBody.substring(0, 500));

    // Validar schema
    let parsed: z.infer<typeof edappWebhookSchema>;
    try {
      parsed = edappWebhookSchema.parse(JSON.parse(rawBody));
    } catch (err) {
      // Registrar evento inválido para análise
      const eventoId = await registrarEvento(db, {
        tipoEvento: 'INVALID_PAYLOAD',
        payload: rawBody,
        erro: `Falha ao validar schema: ${(err as Error).message}`,
      });

      console.error('[EdApp Webhook] Payload inválido:', err);
      return c.json({ success: false, error: 'Invalid payload', evento_id: eventoId }, 400);
    }

    const { event, data } = parsed;

    // Registrar evento bruto
    const eventoId = await registrarEvento(db, {
      tipoEvento: event,
      edappUserId: data.user_id,
      edappCourseId: data.course_id,
      payload: rawBody,
    });

    // Verificar se é evento de conclusão
    if (!EVENTOS_CONCLUSAO.includes(event)) {
      console.log(`[EdApp Webhook] Evento ignorado: ${event}`);
      return c.json({
        success: true,
        message: `Evento ignorado (tipo: ${event})`,
        evento_id: eventoId,
      });
    }

    // Buscar mapeamento de usuário
    const usuarioMap = await findFuncionarioByEdappUserId(db, data.user_id);

    if (!usuarioMap) {
      await atualizarEvento(db, eventoId, {
        erro: `Usuário EdApp não mapeado: ${data.user_id}`,
      });

      console.warn(`[EdApp Webhook] Usuário não mapeado: ${data.user_id}`);
      return c.json(
        {
          success: false,
          error: 'Usuário EdApp não mapeado para funcionário AirTrust',
          evento_id: eventoId,
          edapp_user_id: data.user_id,
        },
        400,
      );
    }

    // Buscar mapeamento de curso
    const cursoMap = await findQualificacaoByEdappCourseId(db, data.course_id);

    if (!cursoMap) {
      await atualizarEvento(db, eventoId, {
        funcionarioId: usuarioMap.funcionario_id,
        erro: `Curso EdApp não mapeado: ${data.course_id}`,
      });

      console.warn(`[EdApp Webhook] Curso não mapeado: ${data.course_id}`);
      return c.json(
        {
          success: false,
          error: 'Curso EdApp não mapeado para qualificação AirTrust',
          evento_id: eventoId,
          edapp_course_id: data.course_id,
          funcionario_id: usuarioMap.funcionario_id,
        },
        400,
      );
    }

    // Gerar qualificação
    const resultado = await gerarQualificacaoEdapp({
      db,
      funcionarioId: usuarioMap.funcionario_id,
      qualificacaoCodigo: cursoMap.qualificacao_codigo,
      qualificacaoId: cursoMap.qualificacao_id,
      validadeMeses: cursoMap.validade_meses || 12,
      origem: `EDAPP_WEBHOOK`,
      dataConclusao: data.completed_at,
      score: data.score,
      edappCourseId: data.course_id,
      edappUserId: data.user_id,
    });

    // Atualizar evento como processado
    await atualizarEvento(db, eventoId, {
      processado: true,
      erro: null,
      funcionarioId: usuarioMap.funcionario_id,
      qualificacaoHistoricoId: resultado.qualificacaoHistoricoId ?? undefined,
    });

    // Registrar auditoria
    await auditEdapp(db, {
      tabela: 'integracoes_edapp_eventos',
      acao: resultado.jaExistia ? 'PROCESSAR_DUPLICADO' : 'PROCESSAR_SUCESSO',
      registroId: eventoId,
      dadosNovos: {
        evento_id: eventoId,
        funcionario_id: usuarioMap.funcionario_id,
        edapp_user_id: data.user_id,
        edapp_course_id: data.course_id,
        qualificacao_codigo: cursoMap.qualificacao_codigo,
        qualificacao_historico_id: resultado.qualificacaoHistoricoId,
        ja_existia: resultado.jaExistia,
        score: data.score,
        completed_at: data.completed_at,
      },
    });

    console.log(
      `[EdApp Webhook] Processado com sucesso: evento=${eventoId}, func=${usuarioMap.funcionario_id}, qual=${cursoMap.qualificacao_codigo}, jaExistia=${resultado.jaExistia}`,
    );

    return c.json({
      success: true,
      data: {
        evento_id: eventoId,
        funcionario_id: usuarioMap.funcionario_id,
        qualificacao_codigo: cursoMap.qualificacao_codigo,
        qualificacao_historico_id: resultado.qualificacaoHistoricoId,
        ja_existia: resultado.jaExistia,
        mensagem: resultado.mensagem,
      },
    });
  } catch (error) {
    console.error('[EdApp Webhook] Erro:', error);

    // Tentar registrar erro
    try {
      await registrarEvento(db, {
        tipoEvento: 'ERROR',
        payload: rawBody || '{}',
        erro: (error as Error).message,
      });
    } catch (e) {
      console.error('[EdApp Webhook] Erro ao registrar erro:', e);
    }

    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * GET /cursos
 * Lista todos os mapeamentos de cursos EdApp → qualificações AirTrust
 */
edappRouter.get('/cursos', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;

  const rows = await db
    .prepare(
      `SELECT 
        c.id,
        c.edapp_course_id,
        c.edapp_course_name,
        c.edapp_course_code,
        c.qualificacao_codigo,
        c.qualificacao_id,
        c.validade_meses,
        c.ativo,
        c.created_at,
        qt.nome as qualificacao_nome
       FROM integracoes_edapp_cursos c
       LEFT JOIN qualificacoes_tipos qt ON qt.codigo = c.qualificacao_codigo AND qt.deleted_at IS NULL
       WHERE c.deleted_at IS NULL
       ORDER BY c.edapp_course_name`,
    )
    .all();

  return c.json({ success: true, data: rows.results });
});

/**
 * POST /cursos
 * Cria novo mapeamento de curso EdApp → qualificação AirTrust
 */
edappRouter.post('/cursos', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;

  try {
    const body = await c.req.json();
    const parsed = criarCursoMapSchema.parse(body);

    // Verificar se já existe
    const existente = await db
      .prepare(
        `SELECT id FROM integracoes_edapp_cursos WHERE edapp_course_id = ? AND deleted_at IS NULL`,
      )
      .bind(parsed.edapp_course_id)
      .first();

    if (existente) {
      return c.json({ success: false, error: 'Mapeamento já existe para este curso EdApp' }, 409);
    }

    // Verificar se qualificação existe
    const qualTipo = await getQualificacaoTipo(db, parsed.qualificacao_codigo);
    const qualId = parsed.qualificacao_id ?? qualTipo?.id ?? null;

    const result = await db
      .prepare(
        `INSERT INTO integracoes_edapp_cursos (
          edapp_course_id, edapp_course_name, edapp_course_code,
          qualificacao_codigo, qualificacao_id, validade_meses, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        parsed.edapp_course_id,
        parsed.edapp_course_name ?? null,
        parsed.edapp_course_code ?? null,
        parsed.qualificacao_codigo,
        qualId,
        parsed.validade_meses,
      )
      .run();

    const id = result.meta.last_row_id;

    await auditEdapp(db, {
      tabela: 'integracoes_edapp_cursos',
      acao: 'CRIAR',
      registroId: id as number,
      dadosNovos: { ...parsed, id },
    });

    return c.json({
      success: true,
      data: { id, ...parsed, qualificacao_id: qualId },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Dados inválidos', details: error.errors }, 400);
    }
    throw error;
  }
});

/**
 * DELETE /cursos/:id
 * Remove mapeamento de curso (soft delete)
 */
edappRouter.delete('/cursos/:id', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  const existente = await db
    .prepare(`SELECT * FROM integracoes_edapp_cursos WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first();

  if (!existente) {
    return c.json({ success: false, error: 'Mapeamento não encontrado' }, 404);
  }

  await db
    .prepare(`UPDATE integracoes_edapp_cursos SET deleted_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();

  await auditEdapp(db, {
    tabela: 'integracoes_edapp_cursos',
    acao: 'DELETAR',
    registroId: id,
    dadosAntigos: existente as Record<string, unknown>,
  });

  return c.json({ success: true, message: 'Mapeamento removido' });
});

/**
 * GET /usuarios
 * Lista todos os mapeamentos de usuários EdApp → funcionários AirTrust
 */
edappRouter.get('/usuarios', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;

  const rows = await db
    .prepare(
      `SELECT 
        u.id,
        u.funcionario_id,
        u.edapp_user_id,
        u.edapp_email,
        u.edapp_username,
        u.ativo,
        u.created_at,
        f.nome as funcionario_nome,
        f.matricula as funcionario_matricula
       FROM integracoes_edapp_usuarios u
       LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
       WHERE u.deleted_at IS NULL
       ORDER BY f.nome`,
    )
    .all();

  return c.json({ success: true, data: rows.results });
});

/**
 * POST /usuarios
 * Cria novo mapeamento de usuário EdApp → funcionário AirTrust
 */
edappRouter.post('/usuarios', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;

  try {
    const body = await c.req.json();
    const parsed = criarUsuarioMapSchema.parse(body);

    // Verificar se funcionário existe
    const funcionario = await db
      .prepare(`SELECT id, nome FROM funcionarios WHERE id = ? AND deleted_at IS NULL`)
      .bind(parsed.funcionario_id)
      .first();

    if (!funcionario) {
      return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
    }

    // Verificar se já existe mapeamento
    const existente = await db
      .prepare(
        `SELECT id FROM integracoes_edapp_usuarios 
         WHERE (funcionario_id = ? OR edapp_user_id = ?) AND deleted_at IS NULL`,
      )
      .bind(parsed.funcionario_id, parsed.edapp_user_id)
      .first();

    if (existente) {
      return c.json(
        { success: false, error: 'Mapeamento já existe para este funcionário ou usuário EdApp' },
        409,
      );
    }

    const result = await db
      .prepare(
        `INSERT INTO integracoes_edapp_usuarios (
          funcionario_id, edapp_user_id, edapp_email, edapp_username, ativo
        ) VALUES (?, ?, ?, ?, 1)`,
      )
      .bind(
        parsed.funcionario_id,
        parsed.edapp_user_id,
        parsed.edapp_email ?? null,
        parsed.edapp_username ?? null,
      )
      .run();

    const id = result.meta.last_row_id;

    await auditEdapp(db, {
      tabela: 'integracoes_edapp_usuarios',
      acao: 'CRIAR',
      registroId: id as number,
      dadosNovos: { ...parsed, id },
    });

    return c.json({ success: true, data: { id, ...parsed } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Dados inválidos', details: error.errors }, 400);
    }
    throw error;
  }
});

/**
 * DELETE /usuarios/:id
 * Remove mapeamento de usuário (soft delete)
 */
edappRouter.delete('/usuarios/:id', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  const existente = await db
    .prepare(`SELECT * FROM integracoes_edapp_usuarios WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first();

  if (!existente) {
    return c.json({ success: false, error: 'Mapeamento não encontrado' }, 404);
  }

  await db
    .prepare(`UPDATE integracoes_edapp_usuarios SET deleted_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();

  await auditEdapp(db, {
    tabela: 'integracoes_edapp_usuarios',
    acao: 'DELETAR',
    registroId: id,
    dadosAntigos: existente as Record<string, unknown>,
  });

  return c.json({ success: true, message: 'Mapeamento removido' });
});

/**
 * GET /eventos
 * Lista eventos recebidos do EdApp (webhooks)
 */
edappRouter.get('/eventos', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;
  const { limit = '50', page = '1', processado, tipo_evento } = c.req.query();

  const limitNum = Math.min(parseInt(limit) || 50, 200);
  const pageNum = Math.max(parseInt(page) || 1, 1);
  const offset = (pageNum - 1) * limitNum;

  const whereClauses: string[] = ['deleted_at IS NULL'];
  const binds: (string | number)[] = [];

  if (processado !== undefined) {
    whereClauses.push('processado = ?');
    binds.push(processado === 'true' || processado === '1' ? 1 : 0);
  }

  if (tipo_evento) {
    whereClauses.push('tipo_evento = ?');
    binds.push(tipo_evento);
  }

  const whereSQL = whereClauses.join(' AND ');

  // Count
  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM integracoes_edapp_eventos WHERE ${whereSQL}`)
    .bind(...binds)
    .first<{ total: number }>();

  const total = countResult?.total ?? 0;

  // Data
  const rows = await db
    .prepare(
      `SELECT 
        e.id,
        e.tipo_evento,
        e.edapp_user_id,
        e.edapp_course_id,
        e.processado,
        e.erro_ultima,
        e.tentativas,
        e.funcionario_id,
        e.qualificacao_historico_id,
        e.created_at,
        f.nome as funcionario_nome
       FROM integracoes_edapp_eventos e
       LEFT JOIN funcionarios f ON f.id = e.funcionario_id
       WHERE ${whereSQL}
       ORDER BY e.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limitNum, offset)
    .all();

  return c.json({
    success: true,
    data: rows.results,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * GET /eventos/:id
 * Detalhes de um evento específico (inclui payload completo)
 */
edappRouter.get('/eventos/:id', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  const evento = await db
    .prepare(
      `SELECT 
        e.*,
        f.nome as funcionario_nome,
        f.matricula as funcionario_matricula
       FROM integracoes_edapp_eventos e
       LEFT JOIN funcionarios f ON f.id = e.funcionario_id
       WHERE e.id = ? AND e.deleted_at IS NULL`,
    )
    .bind(id)
    .first();

  if (!evento) {
    return c.json({ success: false, error: 'Evento não encontrado' }, 404);
  }

  return c.json({ success: true, data: evento });
});

/**
 * POST /eventos/:id/reprocessar
 * Reprocessa um evento que falhou
 */
edappRouter.post('/eventos/:id/reprocessar', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  const evento = await db
    .prepare(`SELECT * FROM integracoes_edapp_eventos WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<{
      id: number;
      tipo_evento: string;
      edapp_user_id: string;
      edapp_course_id: string;
      payload_json: string;
      processado: number;
    }>();

  if (!evento) {
    return c.json({ success: false, error: 'Evento não encontrado' }, 404);
  }

  if (evento.processado === 1) {
    return c.json({ success: false, error: 'Evento já foi processado com sucesso' }, 400);
  }

  // Tentar reprocessar
  try {
    const payload = JSON.parse(evento.payload_json);
    const parsed = edappWebhookSchema.parse(payload);
    const { data } = parsed;

    // Buscar mapeamentos
    const usuarioMap = await findFuncionarioByEdappUserId(db, data.user_id);
    if (!usuarioMap) {
      await atualizarEvento(db, id, { erro: 'Usuário EdApp não mapeado' });
      return c.json({ success: false, error: 'Usuário EdApp não mapeado' }, 400);
    }

    const cursoMap = await findQualificacaoByEdappCourseId(db, data.course_id);
    if (!cursoMap) {
      await atualizarEvento(db, id, {
        funcionarioId: usuarioMap.funcionario_id,
        erro: 'Curso EdApp não mapeado',
      });
      return c.json({ success: false, error: 'Curso EdApp não mapeado' }, 400);
    }

    // Gerar qualificação
    const resultado = await gerarQualificacaoEdapp({
      db,
      funcionarioId: usuarioMap.funcionario_id,
      qualificacaoCodigo: cursoMap.qualificacao_codigo,
      qualificacaoId: cursoMap.qualificacao_id,
      validadeMeses: cursoMap.validade_meses || 12,
      origem: 'EDAPP_REPROCESSAMENTO',
      dataConclusao: data.completed_at,
      score: data.score,
      edappCourseId: data.course_id,
      edappUserId: data.user_id,
    });

    await atualizarEvento(db, id, {
      processado: true,
      erro: null,
      funcionarioId: usuarioMap.funcionario_id,
      qualificacaoHistoricoId: resultado.qualificacaoHistoricoId ?? undefined,
    });

    await auditEdapp(db, {
      tabela: 'integracoes_edapp_eventos',
      acao: 'REPROCESSAR',
      registroId: id,
      dadosNovos: {
        funcionario_id: usuarioMap.funcionario_id,
        qualificacao_historico_id: resultado.qualificacaoHistoricoId,
        ja_existia: resultado.jaExistia,
      },
    });

    return c.json({
      success: true,
      data: {
        evento_id: id,
        funcionario_id: usuarioMap.funcionario_id,
        qualificacao_codigo: cursoMap.qualificacao_codigo,
        qualificacao_historico_id: resultado.qualificacaoHistoricoId,
        ja_existia: resultado.jaExistia,
        mensagem: resultado.mensagem,
      },
    });
  } catch (error) {
    await atualizarEvento(db, id, { erro: (error as Error).message });
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

/**
 * GET /stats
 * Estatísticas da integração EdApp
 */
edappRouter.get('/stats', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;

  const [usuarios, cursos, eventosTotal, eventosProcessados, eventosPendentes, eventosErro] =
    await Promise.all([
      db
        .prepare(
          `SELECT COUNT(*) as count FROM integracoes_edapp_usuarios WHERE deleted_at IS NULL AND ativo = 1`,
        )
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) as count FROM integracoes_edapp_cursos WHERE deleted_at IS NULL AND ativo = 1`,
        )
        .first<{ count: number }>(),
      db
        .prepare(`SELECT COUNT(*) as count FROM integracoes_edapp_eventos WHERE deleted_at IS NULL`)
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) as count FROM integracoes_edapp_eventos WHERE deleted_at IS NULL AND processado = 1`,
        )
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) as count FROM integracoes_edapp_eventos WHERE deleted_at IS NULL AND processado = 0 AND erro_ultima IS NULL`,
        )
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) as count FROM integracoes_edapp_eventos WHERE deleted_at IS NULL AND processado = 0 AND erro_ultima IS NOT NULL`,
        )
        .first<{ count: number }>(),
    ]);

  return c.json({
    success: true,
    data: {
      usuarios_mapeados: usuarios?.count ?? 0,
      cursos_mapeados: cursos?.count ?? 0,
      eventos: {
        total: eventosTotal?.count ?? 0,
        processados: eventosProcessados?.count ?? 0,
        pendentes: eventosPendentes?.count ?? 0,
        com_erro: eventosErro?.count ?? 0,
      },
    },
  });
});

/**
 * GET /health
 * Health check da integração
 */
edappRouter.get('/health', async (c: Context<{ Bindings: Env }>) => {
  const hasSecret = !!c.env.EDAPP_WEBHOOK_SECRET;
  const hasToken = !!c.env.EDAPP_API_TOKEN;

  return c.json({
    success: true,
    data: {
      status: 'ok',
      webhook_secret_configured: hasSecret,
      api_token_configured: hasToken,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * POST /setup-webhook
 * Cria webhook automaticamente na EdApp API
 */
edappRouter.post('/setup-webhook', async (c: Context<{ Bindings: Env }>) => {
  const apiToken = c.env.EDAPP_API_TOKEN;
  const environment = c.env.ENVIRONMENT || 'production';

  if (!apiToken) {
    return c.json(
      {
        success: false,
        error: 'EDAPP_API_TOKEN não configurado nas variáveis de ambiente',
      },
      400,
    );
  }

  // URL do webhook baseado no ambiente
  const webhookUrl =
    environment === 'development'
      ? 'https://airtrust-api-development.airtrust.workers.dev/api/integracoes/edapp/webhook'
      : 'https://airtrust-api-production.airtrust.workers.dev/api/integracoes/edapp/webhook';

  try {
    // Criar webhook na API EdApp
    // Campos corretos conforme API EdApp: EventUrl, EventName
    const response = await fetch('https://api.edapp.com/v2/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        WebHookUrl: webhookUrl,
        EventName: 'CourseCompletedEvent',
        IsActive: true,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return c.json(
        {
          success: false,
          error: `EdApp API Error: ${response.status} - ${responseText}`,
          details: `Error: EdApp API Error: ${response.status} - ${responseText}`,
        },
        500,
      );
    }

    const webhookData = JSON.parse(responseText);

    return c.json({
      success: true,
      data: {
        webhook_id: webhookData.Id || webhookData.id || webhookData.WebHookId,
        webhook_url: webhookUrl,
        event_name: webhookData.EventName || 'CourseCompleted',
        active: webhookData.IsActive ?? true,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[EdApp Setup Webhook] Error:', error);
    return c.json(
      {
        success: false,
        error: (error as Error).message,
        details: error instanceof Error ? error.stack : String(error),
      },
      500,
    );
  }
});

/**
 * GET /debug/table-info
 * Debug: ver estrutura da tabela qualificacoes_historico
 */
edappRouter.get('/debug/table-info', async (c: Context<{ Bindings: Env }>) => {
  const db = c.env.DB;

  const pragmaResult = await db.prepare('PRAGMA table_info(qualificacoes_historico)').all<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>();

  return c.json({
    success: true,
    data: {
      columns: pragmaResult.results?.map((col) => ({
        name: col.name,
        type: col.type,
        notnull: col.notnull === 1,
        default_value: col.dflt_value,
        primary_key: col.pk === 1,
      })),
    },
  });
});

export default edappRouter;
