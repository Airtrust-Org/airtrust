/**
 * INTEGRACOES EDAPP — Eventos, Teste, Conclusões, Importar Histórico
 * Sub-router mounted at /api/integracoes/edapp via edappRouter.route('/', ...)
 *
 *   GET  /eventos
 *   POST /teste
 *   GET  /conclusoes
 *   POST /importar-historico
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { createLogger, toError } from '../utils/logger';
import { getEmpresaIdSafe } from './escalas-shared';
import {
  buildEdAppQualificacaoVencimentoExpr,
  createQualificacao,
  edappErrorResponse,
  findFuncionarioByEdappUser,
  findQualificacaoByCourse,
  parseEdAppCompletionPayload,
  renovarQualificacao,
} from './integracoes-edapp-helpers';

const app = new Hono<{ Bindings: Env }>();

const COMPLETION_EVENT_TYPES = [
  'CourseCompletedEvent',
  'course.completed',
  'analytics.courseprogress.completed',
] as const;

const COMPLETION_EVENT_TYPES_SQL = COMPLETION_EVENT_TYPES.map((value) => `'${value}'`).join(', ');

// ========================================
// ENDPOINT: EVENTOS (LOG)
// GET /api/integracoes/edapp/eventos
// ========================================

app.get('/eventos', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const eventos = await c.env.DB.prepare(
    `
    SELECT
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
      e.updated_at,
      -- Usuário
      u.edapp_username,
      u.edapp_email,
      f.nome  AS funcionario_nome,
      f.matricula AS funcionario_matricula,
      -- Curso: nome mapeado com fallback do payload (webhook: $.data.courseTitle, analytics: $.courseTitle)
      m.edapp_course_name,
      COALESCE(
        m.edapp_course_name,
        json_extract(e.payload_json, '$.data.courseTitle'),
        json_extract(e.payload_json, '$.courseTitle')
      ) AS curso_nome_display,
      -- Usuário: identificador legível com fallback do payload
      COALESCE(
        f.nome,
        u.edapp_email,
        u.edapp_username,
        json_extract(e.payload_json, '$.data.email'),
        json_extract(e.payload_json, '$.data.username')
      ) AS usuario_display,
      m.qualificacao_codigo,
      m.edapp_course_code,
      tq.nome AS qualificacao_nome,
      qh.status AS qualificacao_historico_status,
      qh.renovada AS qualificacao_historico_renovada,
      qh.data_conclusao AS qualificacao_historico_data_conclusao,
      qh.data_vencimento AS qualificacao_historico_data_vencimento
    FROM integracoes_edapp_eventos e
    LEFT JOIN integracoes_edapp_usuarios u ON e.edapp_user_id = u.edapp_user_id AND u.deleted_at IS NULL AND u.empresa_id = e.empresa_id
    LEFT JOIN funcionarios f ON COALESCE(u.funcionario_id, e.funcionario_id) = f.id AND f.deleted_at IS NULL AND f.empresa_id = e.empresa_id
    LEFT JOIN integracoes_edapp_cursos m ON m.deleted_at IS NULL AND m.empresa_id = e.empresa_id AND (
      m.edapp_course_id = e.edapp_course_id
      OR m.qualificacao_codigo = json_extract(e.payload_json, '$.data.courseExternalId')
    )
    LEFT JOIN qualificacoes_tipos tq ON m.qualificacao_codigo = tq.codigo AND tq.deleted_at IS NULL AND tq.empresa_id = e.empresa_id
    LEFT JOIN qualificacoes_historico qh ON e.qualificacao_historico_id = qh.id AND qh.deleted_at IS NULL AND qh.empresa_id = e.empresa_id
    WHERE e.deleted_at IS NULL
      AND e.empresa_id = ?
    ORDER BY e.created_at DESC
    LIMIT ?
  `,
  )
    .bind(empresaId, limit)
    .all();

  return c.json({ success: true, data: eventos.results });
});

// ========================================
// ENDPOINT: CRIAR EVENTO DE TESTE
// POST /api/integracoes/edapp/teste
// ========================================

app.post('/teste', async (c) => {
  const logger = createLogger(c, 'EdApp.testEvent');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const body = await c.req.json();
    const { edapp_user_id, edapp_course_id } = body;

    if (!edapp_user_id || !edapp_course_id) {
      return edappErrorResponse(
        c,
        400,
        'edapp_user_id e edapp_course_id são obrigatórios',
        'EDAPP_TEST_REQUIRED_FIELDS',
      );
    }

    const usuarioMapeado = await findFuncionarioByEdappUser(c.env.DB, edapp_user_id, empresaId);
    if (!usuarioMapeado?.funcionario_id) {
      return edappErrorResponse(
        c,
        400,
        `Usuário EdApp ${edapp_user_id} não está mapeado`,
        'EDAPP_TEST_USER_NOT_MAPPED',
      );
    }

    const cursoMapeado = await findQualificacaoByCourse(c.env.DB, edapp_course_id, empresaId);
    if (!cursoMapeado?.qualificacao_codigo) {
      return edappErrorResponse(
        c,
        400,
        `Curso EdApp ${edapp_course_id} não está mapeado`,
        'EDAPP_TEST_COURSE_NOT_MAPPED',
      );
    }

    const testPayload = {
      event: 'CourseCompletedEvent',
      data: {
        userId: edapp_user_id,
        courseId: edapp_course_id,
        completedAt: new Date().toISOString(),
        score: 100,
        username: 'TESTE_USER',
        email: 'teste@edapp.com',
      },
    };

    const eventoResult = await c.env.DB.prepare(
      `
      INSERT INTO integracoes_edapp_eventos (tipo_evento, edapp_user_id, edapp_course_id, payload_json, empresa_id)
      VALUES (?, ?, ?, ?, ?)
    `,
    )
      .bind(
        'CourseCompletedEvent',
        edapp_user_id,
        edapp_course_id,
        JSON.stringify(testPayload),
        empresaId,
      )
      .run();

    const eventoId = Number(eventoResult.meta.last_row_id || 0);

    const resultado = await createQualificacao(
      c.env.DB,
      usuarioMapeado.funcionario_id,
      cursoMapeado.qualificacao_codigo,
      `test_course:${edapp_course_id}`,
      testPayload.data.completedAt,
      empresaId,
    );

    await c.env.DB.prepare(
      `UPDATE integracoes_edapp_eventos
       SET processado = 1,
           qualificacao_historico_id = ?,
           funcionario_id = ?,
           erro_ultima = NULL,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(resultado.qualificacao_id || null, usuarioMapeado.funcionario_id, eventoId)
      .run();

    return c.json({
      success: true,
      message: 'Evento de teste criado e qualificação processada.',
      data: {
        evento_id: eventoId,
        funcionario_id: usuarioMapeado.funcionario_id,
        qualificacao_codigo: cursoMapeado.qualificacao_codigo,
        qualificacao_criada: resultado.created !== false,
        qualificacao_duplicada: resultado.duplicate === true,
        mensagem_qualificacao: resultado.message,
      },
    });
  } catch (error: unknown) {
    logger.error('Erro ao criar evento de teste EdApp', toError(error));
    return edappErrorResponse(
      c,
      500,
      error instanceof Error ? error.message : 'Erro ao criar evento de teste',
      'EDAPP_TEST_EVENT_ERROR',
    );
  }
});

// ========================================
// ENDPOINT: LISTAR CURSOS CONCLUÍDOS (READ-ONLY)
// GET /api/integracoes/edapp/conclusoes
// ========================================

app.get('/conclusoes', async (c) => {
  const logger = createLogger(c, 'EdApp.conclusions');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const conclusoes = await c.env.DB.prepare(
      `
      SELECT
        e.id,
        e.tipo_evento,
        e.edapp_user_id,
        e.edapp_course_id,
        e.payload_json,
        e.processado,
        e.created_at,
        e.qualificacao_historico_id,
        COALESCE(u.funcionario_id, e.funcionario_id) AS funcionario_id,
        f.matricula,
        f.nome as funcionario_nome,
        m.edapp_course_name,
        m.edapp_course_code,
        m.qualificacao_codigo,
        COALESCE(m.edapp_course_name, json_extract(e.payload_json, '$.data.courseTitle'), json_extract(e.payload_json, '$.courseTitle')) AS curso_nome_display,
        tq.nome as qualificacao_nome,
        qh.status as qualificacao_historico_status,
        qh.renovada as qualificacao_historico_renovada,
        qh.data_conclusao as qualificacao_historico_data_conclusao,
        qh.data_vencimento as qualificacao_historico_data_vencimento
      FROM integracoes_edapp_eventos e
      LEFT JOIN integracoes_edapp_usuarios u ON e.edapp_user_id = u.edapp_user_id AND u.deleted_at IS NULL AND u.empresa_id = e.empresa_id
      LEFT JOIN funcionarios f ON COALESCE(u.funcionario_id, e.funcionario_id) = f.id AND f.deleted_at IS NULL AND f.empresa_id = e.empresa_id
      LEFT JOIN integracoes_edapp_cursos m ON m.deleted_at IS NULL AND m.empresa_id = e.empresa_id AND (
        m.edapp_course_id = e.edapp_course_id
        OR m.qualificacao_codigo = json_extract(e.payload_json, '$.data.courseExternalId')
      )
      LEFT JOIN qualificacoes_tipos tq ON m.qualificacao_codigo = tq.codigo AND tq.deleted_at IS NULL AND tq.empresa_id = e.empresa_id
      LEFT JOIN qualificacoes_historico qh ON e.qualificacao_historico_id = qh.id AND qh.deleted_at IS NULL AND qh.empresa_id = e.empresa_id
      WHERE e.deleted_at IS NULL
        AND e.empresa_id = ?
        AND e.tipo_evento IN (${COMPLETION_EVENT_TYPES_SQL})
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
      .bind(empresaId, limit, offset)
      .all();

    const conclusoesComParsed = (conclusoes.results || []).map((evento: any) => {
      const payload = parseEdAppCompletionPayload(evento.payload_json);

      return {
        id: evento.id,
        tipo_evento: evento.tipo_evento,
        edapp_user_id: evento.edapp_user_id,
        edapp_course_id: evento.edapp_course_id,
        processado: evento.processado === 1,
        created_at: evento.created_at,
        completedAt: payload.completedAt || evento.created_at,
        score: payload.score,
        funcionario_id: evento.funcionario_id,
        funcionario_matricula: evento.matricula,
        funcionario_nome: evento.funcionario_nome,
        curso_nome: evento.curso_nome_display || evento.edapp_course_name || payload.courseTitle,
        curso_codigo: evento.edapp_course_code || evento.qualificacao_codigo || null,
        qualificacao_codigo: evento.qualificacao_codigo,
        qualificacao_nome: evento.qualificacao_nome,
        qualificacao_historico_id: evento.qualificacao_historico_id || null,
        qualificacao_historico_status: evento.qualificacao_historico_status || null,
        qualificacao_historico_renovada: evento.qualificacao_historico_renovada === 1,
        qualificacao_historico_data_conclusao: evento.qualificacao_historico_data_conclusao || null,
        qualificacao_historico_data_vencimento:
          evento.qualificacao_historico_data_vencimento || null,
        qualificacao_link: evento.qualificacao_historico_id
          ? `/qualificacoes?id=${evento.qualificacao_historico_id}`
          : null,
        mapeado: !!(evento.funcionario_id && evento.qualificacao_codigo),
      };
    });

    const total = await c.env.DB.prepare(
      `
      SELECT COUNT(*) as total
      FROM integracoes_edapp_eventos
      WHERE deleted_at IS NULL
        AND empresa_id = ?
        AND tipo_evento IN (${COMPLETION_EVENT_TYPES_SQL})
    `,
    )
      .bind(empresaId)
      .first<{ total: number }>();

    return c.json({
      success: true,
      data: conclusoesComParsed,
      pagination: {
        limit,
        offset,
        total: total?.total || 0,
      },
    });
  } catch (error: unknown) {
    logger.error('Erro ao buscar conclusões do EdApp', toError(error));
    return edappErrorResponse(
      c,
      500,
      error instanceof Error ? error.message : 'Erro ao buscar conclusões',
      'EDAPP_LIST_CONCLUSIONS_ERROR',
    );
  }
});

// ========================================
// POST /api/integracoes/edapp/importar-historico
// Reprocessa conclusões pendentes já armazenadas localmente
// ========================================

app.post('/importar-historico', async (c: Context<{ Bindings: Env }>) => {
  const logger = createLogger(c, 'EdApp.importHistory');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const dataVencimentoExpr = buildEdAppQualificacaoVencimentoExpr('qh');
  let novasCriadas = 0;
  let renovadas = 0;
  let ignoradas = 0;
  let erros = 0;
  const DETALHES_MAX = 50;
  const detalhes: Array<Record<string, unknown>> = [];

  try {
    const eventosResult = await db
      .prepare(
        `
      SELECT
        e.id as evento_id,
        e.tipo_evento,
        e.edapp_user_id,
        e.edapp_course_id,
        e.payload_json,
        e.created_at,
        f.nome as funcionario_nome,
        f.matricula,
        m.edapp_course_name
      FROM integracoes_edapp_eventos e
      LEFT JOIN integracoes_edapp_usuarios u ON e.edapp_user_id = u.edapp_user_id AND u.deleted_at IS NULL AND u.empresa_id = e.empresa_id
      LEFT JOIN funcionarios f ON COALESCE(u.funcionario_id, e.funcionario_id) = f.id AND f.deleted_at IS NULL AND f.empresa_id = e.empresa_id
      LEFT JOIN integracoes_edapp_cursos m ON m.deleted_at IS NULL AND m.empresa_id = e.empresa_id AND (
        m.edapp_course_id = e.edapp_course_id
        OR m.qualificacao_codigo = json_extract(e.payload_json, '$.data.courseExternalId')
      )
      WHERE e.deleted_at IS NULL
        AND e.empresa_id = ?
        AND e.processado = 0
        AND e.tipo_evento IN (${COMPLETION_EVENT_TYPES_SQL})
      ORDER BY e.created_at ASC
    `,
      )
      .bind(empresaId)
      .all<{
        evento_id: number;
        tipo_evento: string;
        edapp_user_id: string | null;
        edapp_course_id: string | null;
        payload_json: string | null;
        created_at: string;
        funcionario_nome: string | null;
        matricula: string | null;
        edapp_course_name: string | null;
      }>();

    const eventos = eventosResult.results || [];

    for (const evento of eventos) {
      try {
        const payload = parseEdAppCompletionPayload(evento.payload_json);

        const funcionario = await findFuncionarioByEdappUser(
          db,
          {
            edappUserId: evento.edapp_user_id || payload.edappUserId,
            userExternalId: payload.userExternalId,
          },
          empresaId,
        );

        if (!funcionario?.funcionario_id) {
          await db
            .prepare(
              `UPDATE integracoes_edapp_eventos
               SET erro_ultima = ?,
                   tentativas = tentativas + 1,
                   updated_at = datetime('now')
               WHERE id = ?`,
            )
            .bind('Usuário não mapeado', evento.evento_id)
            .run();

          detalhes.push({
            evento_id: evento.evento_id,
            curso: evento.edapp_course_name || payload.courseTitle || evento.edapp_course_id,
            status: 'erro',
            motivo: 'Usuário não mapeado',
          });
          erros++;
          continue;
        }

        const qualificacao = await findQualificacaoByCourse(
          db,
          {
            courseId: evento.edapp_course_id || payload.edappCourseId,
            courseExternalId: payload.courseExternalId,
            courseTitle: payload.courseTitle,
          },
          empresaId,
        );

        if (!qualificacao?.qualificacao_codigo) {
          await db
            .prepare(
              `UPDATE integracoes_edapp_eventos
               SET erro_ultima = ?,
                   tentativas = tentativas + 1,
                   updated_at = datetime('now')
               WHERE id = ?`,
            )
            .bind('Curso não mapeado', evento.evento_id)
            .run();

          detalhes.push({
            evento_id: evento.evento_id,
            funcionario: funcionario.funcionario_nome || evento.funcionario_nome,
            curso: payload.courseTitle || evento.edapp_course_name || evento.edapp_course_id,
            status: 'erro',
            motivo: 'Curso não mapeado',
          });
          erros++;
          continue;
        }

        const completedAt = payload.completedAt || evento.created_at;
        const dataConclusao = new Date(completedAt).toISOString().split('T')[0];

        const qualificacaoRenovavel = await db
          .prepare(
            `
            SELECT id, ${dataVencimentoExpr} as data_vencimento
            FROM qualificacoes_historico qh
            WHERE qh.funcionario_id = ?
              AND qh.empresa_id = ?
              AND qh.qualificacao_codigo = ?
              AND ${dataVencimentoExpr} >= date('now')
              AND qh.deleted_at IS NULL
            ORDER BY ${dataVencimentoExpr} DESC
            LIMIT 1
          `,
          )
          .bind(funcionario.funcionario_id, empresaId, qualificacao.qualificacao_codigo)
          .first<{ id: number; data_vencimento: string }>();

        const resultado = qualificacaoRenovavel
          ? await renovarQualificacao(
              db,
              funcionario.funcionario_id,
              qualificacao.qualificacao_codigo,
              `Renovação EdApp: ${qualificacao.edapp_course_name || payload.courseTitle || evento.edapp_course_id}`,
              completedAt,
              empresaId,
            )
          : await createQualificacao(
              db,
              funcionario.funcionario_id,
              qualificacao.qualificacao_codigo,
              `Importação histórico: ${qualificacao.edapp_course_name || payload.courseTitle || evento.edapp_course_id}`,
              completedAt,
              empresaId,
            );

        if (!resultado.success) {
          await db
            .prepare(
              `UPDATE integracoes_edapp_eventos
               SET erro_ultima = ?,
                   tentativas = tentativas + 1,
                   updated_at = datetime('now')
               WHERE id = ?`,
            )
            .bind(resultado.message, evento.evento_id)
            .run();

          detalhes.push({
            evento_id: evento.evento_id,
            funcionario: funcionario.funcionario_nome || evento.funcionario_nome,
            matricula: evento.matricula,
            curso: qualificacao.edapp_course_name || payload.courseTitle || evento.edapp_course_id,
            qualificacao: qualificacao.qualificacao_codigo,
            data_conclusao: dataConclusao,
            status: 'erro',
            motivo: resultado.message,
          });
          erros++;
          continue;
        }

        await db
          .prepare(
            `UPDATE integracoes_edapp_eventos
             SET processado = 1,
                 funcionario_id = ?,
                 qualificacao_historico_id = ?,
                 erro_ultima = NULL,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(funcionario.funcionario_id, resultado.qualificacao_id || null, evento.evento_id)
          .run();

        const detalheBase = {
          evento_id: evento.evento_id,
          funcionario: funcionario.funcionario_nome || evento.funcionario_nome,
          matricula: evento.matricula,
          curso: qualificacao.edapp_course_name || payload.courseTitle || evento.edapp_course_name,
          qualificacao: qualificacao.qualificacao_codigo,
          data_conclusao: dataConclusao,
          matched_by_usuario: funcionario.matched_by,
          matched_by_curso: qualificacao.matched_by,
        };

        if (resultado.created === false || resultado.duplicate === true) {
          ignoradas++;
          continue;
        }

        if (qualificacaoRenovavel) {
          if (detalhes.length < DETALHES_MAX) {
            detalhes.push({
              ...detalheBase,
              status: 'renovada',
              qualificacao_antiga_id: qualificacaoRenovavel.id,
              qualificacao_nova_id: resultado.qualificacao_id,
            });
          }
          renovadas++;
          continue;
        }

        if (detalhes.length < DETALHES_MAX) {
          detalhes.push({
            ...detalheBase,
            status: 'criada',
            qualificacao_id: resultado.qualificacao_id,
          });
        }
        novasCriadas++;
      } catch (eventoError: unknown) {
        logger.error('Erro ao processar evento do histórico EdApp', toError(eventoError), {
          eventoId: String(evento.evento_id),
        });

        await db
          .prepare(
            `UPDATE integracoes_edapp_eventos
             SET erro_ultima = ?,
                 tentativas = tentativas + 1,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(
            eventoError instanceof Error ? eventoError.message : 'Erro ao processar evento',
            evento.evento_id,
          )
          .run();

        erros++;
      }
    }

    return c.json({
      success: true,
      data: {
        resumo: {
          eventos_pendentes: eventos.length,
          novas_criadas: novasCriadas,
          renovadas,
          ignoradas,
          erros,
          total: novasCriadas + renovadas + ignoradas + erros,
        },
        detalhes,
        detalhes_truncated: detalhes.length >= DETALHES_MAX,
      },
    });
  } catch (error: unknown) {
    logger.error('Erro ao importar histórico EdApp', toError(error));
    return edappErrorResponse(
      c,
      500,
      error instanceof Error ? error.message : 'Erro ao importar histórico',
      'EDAPP_IMPORT_HISTORY_ERROR',
      {
        detalhes,
      },
    );
  }
});

export default app;
