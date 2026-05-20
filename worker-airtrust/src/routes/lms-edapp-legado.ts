import { Hono } from 'hono';
import { z } from 'zod';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import type { Env } from '../types';
import { getEmpresaIdSafe } from './escalas-shared';
import {
  findFuncionarioByEdappUser,
  findQualificacaoByCourse,
  parseEdAppCompletionPayload,
  resolveEdAppCompletionDate,
} from './integracoes-edapp-helpers';
import { createLogger, toError } from '../utils/logger';
import { reconcileImportedEdappHistory } from '../services/lms-ead-ssot';

const app = new Hono<{ Bindings: Env }>();

const COMPLETION_EVENT_TYPES = [
  'CourseCompletedEvent',
  'course.completed',
  'analytics.courseprogress.completed',
] as const;

const COMPLETION_EVENT_TYPES_SQL = COMPLETION_EVENT_TYPES.map((value) => `'${value}'`).join(', ');
const DEFAULT_IMPORT_BATCH = 75;
const MAX_IMPORT_BATCH = 75;

const importSchema = z.object({
  limit: z.number().int().min(1).max(5000).optional(),
  reprocessar: z.boolean().optional(),
});

app.use('*', auth());

function inferEmailFromUserExternalId(userExternalId: string | null) {
  if (!userExternalId) return null;
  return userExternalId.includes('@') ? userExternalId : null;
}

function inferUsernameFromUserExternalId(userExternalId: string | null) {
  if (!userExternalId) return null;
  return userExternalId.includes('@') ? null : userExternalId;
}

async function upsertEdappUserMapping(
  db: D1Database,
  params: {
    funcionarioId: number;
    edappUserId: string | null;
    userExternalId: string | null;
  },
) {
  if (!params.edappUserId) {
    return false;
  }

  const email = inferEmailFromUserExternalId(params.userExternalId);
  const username = inferUsernameFromUserExternalId(params.userExternalId);
  const existing = await db
    .prepare(
      `SELECT id
       FROM integracoes_edapp_usuarios
       WHERE edapp_user_id = ?
       LIMIT 1`,
    )
    .bind(params.edappUserId)
    .first<{ id: number }>();

  if (existing?.id) {
    await db
      .prepare(
        `UPDATE integracoes_edapp_usuarios
         SET funcionario_id = ?,
             edapp_email = COALESCE(?, edapp_email),
             edapp_username = COALESCE(?, edapp_username),
             ativo = 1,
             deleted_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(params.funcionarioId, email, username, existing.id)
      .run();
    return true;
  }

  await db
    .prepare(
      `INSERT INTO integracoes_edapp_usuarios (
         funcionario_id,
         edapp_user_id,
         edapp_email,
         edapp_username,
         ativo,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'), NULL)`,
    )
    .bind(params.funcionarioId, params.edappUserId, email, username)
    .run();

  return true;
}

async function upsertEdappCourseMapping(
  db: D1Database,
  params: {
    edappCourseId: string | null;
    courseTitle: string | null;
    courseExternalId: string | null;
    qualificacaoCodigo: string | null;
  },
) {
  if (!params.edappCourseId || !params.qualificacaoCodigo) {
    return false;
  }

  const existing = await db
    .prepare(
      `SELECT id
       FROM integracoes_edapp_cursos
       WHERE edapp_course_id = ?
       LIMIT 1`,
    )
    .bind(params.edappCourseId)
    .first<{ id: number }>();

  if (existing?.id) {
    await db
      .prepare(
        `UPDATE integracoes_edapp_cursos
         SET edapp_course_name = COALESCE(?, edapp_course_name),
             edapp_course_code = COALESCE(?, edapp_course_code),
             qualificacao_codigo = ?,
             ativo = 1,
             deleted_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(params.courseTitle, params.courseExternalId, params.qualificacaoCodigo, existing.id)
      .run();
    return true;
  }

  await db
    .prepare(
      `INSERT INTO integracoes_edapp_cursos (
         edapp_course_id,
         edapp_course_name,
         edapp_course_code,
         qualificacao_codigo,
         ativo,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'), NULL)`,
    )
    .bind(
      params.edappCourseId,
      params.courseTitle,
      params.courseExternalId,
      params.qualificacaoCodigo,
    )
    .run();

  return true;
}

function isLikelyTestEvent(params: {
  edappUserId: string | null;
  edappCourseId: string | null;
  courseTitle: string | null;
}) {
  const values = [params.edappUserId, params.edappCourseId, params.courseTitle]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase());

  return values.some((value) => value.startsWith('test-') || value.startsWith('teste-'));
}

async function resolveFuncionarioEmpresa(
  db: D1Database,
  empresaId: number,
  evento: {
    funcionario_id: number | null;
    edapp_user_id: string | null;
    payload_json: string;
  },
) {
  const payload = parseEdAppCompletionPayload(evento.payload_json);

  const candidates: Array<number> = [];
  if (typeof evento.funcionario_id === 'number' && Number.isFinite(evento.funcionario_id)) {
    candidates.push(evento.funcionario_id);
  }

  const mapped = await findFuncionarioByEdappUser(
    db,
    {
      edappUserId: evento.edapp_user_id,
      userExternalId: payload.userExternalId,
      edappEmail: payload.userExternalId,
      edappUsername: payload.userExternalId,
    },
    empresaId,
  );

  if (mapped?.funcionario_id && !candidates.includes(mapped.funcionario_id)) {
    candidates.push(mapped.funcionario_id);
  }

  for (const funcionarioId of candidates) {
    const funcionario = await db
      .prepare(
        `SELECT id, nome
         FROM funcionarios
         WHERE id = ?
           AND deleted_at IS NULL
           AND (empresa_id = ? OR ? IS NULL)
         LIMIT 1`,
      )
      .bind(funcionarioId, empresaId, empresaId)
      .first<{ id: number; nome: string }>();

    if (funcionario?.id) {
      return {
        id: funcionario.id,
        nome: funcionario.nome,
        matchType: mapped?.funcionario_id === funcionario.id ? mapped.matched_by : 'evento',
      };
    }
  }

  return null;
}

async function resolveCursoLms(
  db: D1Database,
  empresaId: number,
  qualificacaoCodigo: string | null,
  courseTitle: string | null,
) {
  const normalizedCodigo = qualificacaoCodigo?.trim().toLowerCase() || null;
  const normalizedTitle = courseTitle?.trim().toLowerCase() || null;

  return db
    .prepare(
      `SELECT
         c.id,
         c.titulo,
         c.categoria,
         c.tipo_conteudo,
         qt.codigo AS qualificacao_codigo,
         CASE
           WHEN lower(trim(COALESCE(qt.codigo, ''))) = ? THEN 'qualificacao_codigo'
           WHEN lower(trim(COALESCE(c.titulo, ''))) = ? THEN 'course_title'
           ELSE 'catalogo'
         END AS matched_by
       FROM lms_cursos c
       LEFT JOIN qualificacoes_tipos qt
         ON qt.id = c.qualificacao_tipo_id
        AND qt.deleted_at IS NULL
       WHERE c.empresa_id = ?
         AND c.deleted_at IS NULL
         AND (
           (? IS NOT NULL AND lower(trim(COALESCE(qt.codigo, ''))) = ?)
           OR (? IS NOT NULL AND lower(trim(COALESCE(c.titulo, ''))) = ?)
         )
       ORDER BY
         CASE
           WHEN lower(trim(COALESCE(qt.codigo, ''))) = ? THEN 0
           WHEN c.publicado = 1 THEN 1
           WHEN lower(trim(COALESCE(c.titulo, ''))) = ? THEN 2
           ELSE 3
         END,
         datetime(c.updated_at) DESC,
         c.id DESC
       LIMIT 1`,
    )
    .bind(
      normalizedCodigo,
      normalizedTitle,
      empresaId,
      normalizedCodigo,
      normalizedCodigo,
      normalizedTitle,
      normalizedTitle,
      normalizedCodigo,
      normalizedTitle,
    )
    .first<{
      id: number;
      titulo: string;
      categoria: string | null;
      tipo_conteudo: string | null;
      qualificacao_codigo: string | null;
      matched_by: string;
    }>();
}

async function resolveQualificacaoHistoricoId(
  db: D1Database,
  params: {
    eventoQualificacaoHistoricoId: number | null;
    funcionarioId: number | null;
    qualificacaoCodigo: string | null;
    dataConclusao: string | null;
  },
) {
  if (params.eventoQualificacaoHistoricoId) {
    return params.eventoQualificacaoHistoricoId;
  }

  if (!params.funcionarioId || !params.qualificacaoCodigo || !params.dataConclusao) {
    return null;
  }

  const row = await db
    .prepare(
      `SELECT id
       FROM qualificacoes_historico
       WHERE funcionario_id = ?
         AND qualificacao_codigo = ?
         AND deleted_at IS NULL
         AND date(COALESCE(data_conclusao, '1900-01-01')) = date(?)
       ORDER BY id DESC
       LIMIT 1`,
    )
    .bind(params.funcionarioId, params.qualificacaoCodigo, params.dataConclusao)
    .first<{ id: number }>();

  return row?.id ?? null;
}

async function countPendingLegacyImports(db: D1Database, empresaId: number) {
  const pendentes = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM integracoes_edapp_eventos e
       LEFT JOIN integracoes_edapp_usuarios u
         ON u.edapp_user_id = e.edapp_user_id
        AND u.deleted_at IS NULL
        AND u.ativo = 1
       LEFT JOIN funcionarios f
         ON f.id = COALESCE(e.funcionario_id, u.funcionario_id)
        AND f.deleted_at IS NULL
       LEFT JOIN lms_historico_importado h
         ON h.integracao_evento_id = e.id
        AND h.empresa_id = ?
        AND h.fonte = 'EDAPP'
        AND h.deleted_at IS NULL
       WHERE e.deleted_at IS NULL
         AND e.tipo_evento IN (${COMPLETION_EVENT_TYPES_SQL})
         AND f.empresa_id = ?
         AND h.id IS NULL`,
    )
    .bind(empresaId, empresaId)
    .first<{ total: number | null }>();

  return Number(pendentes?.total || 0);
}

app.get('/legado/edapp/resumo', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  if (!empresaId) {
    return c.json(
      { success: false, error: 'Empresa não identificada', code: 'LMS_EDAPP_EMPRESA_REQUIRED' },
      400,
    );
  }

  const summary = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total_importado,
       COUNT(DISTINCT funcionario_id) AS total_funcionarios,
       COUNT(DISTINCT COALESCE(CAST(curso_id AS TEXT), curso_titulo)) AS total_cursos,
       SUM(CASE WHEN funcionario_id IS NULL OR status = 'PENDENTE_VINCULO' THEN 1 ELSE 0 END) AS total_pendentes_vinculo,
       SUM(CASE WHEN curso_id IS NULL THEN 1 ELSE 0 END) AS total_sem_curso_lms,
       SUM(CASE WHEN qualificacao_historico_id IS NOT NULL THEN 1 ELSE 0 END) AS total_com_qualificacao,
       MAX(updated_at) AS ultima_importacao_em,
       MAX(data_conclusao) AS ultima_conclusao_em
     FROM lms_historico_importado
     WHERE empresa_id = ?
       AND fonte = 'EDAPP'
       AND (funcionario_id IS NULL OR funcionario_id IN (
         SELECT id
         FROM funcionarios
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND COALESCE(ativo, 1) = 1
           AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
       ))
       AND deleted_at IS NULL`,
  )
    .bind(empresaId, empresaId)
    .first<{
      total_importado: number | null;
      total_funcionarios: number | null;
      total_cursos: number | null;
      total_pendentes_vinculo: number | null;
      total_sem_curso_lms: number | null;
      total_com_qualificacao: number | null;
      ultima_importacao_em: string | null;
      ultima_conclusao_em: string | null;
    }>();

  const pendentes = await countPendingLegacyImports(c.env.DB, empresaId);

  return c.json({
    success: true,
    data: {
      total_importado: Number(summary?.total_importado || 0),
      total_funcionarios: Number(summary?.total_funcionarios || 0),
      total_cursos: Number(summary?.total_cursos || 0),
      total_pendentes_vinculo: Number(summary?.total_pendentes_vinculo || 0),
      total_sem_curso_lms: Number(summary?.total_sem_curso_lms || 0),
      total_com_qualificacao: Number(summary?.total_com_qualificacao || 0),
      pendentes_importacao: pendentes,
      ultima_importacao_em: summary?.ultima_importacao_em ?? null,
      ultima_conclusao_em: summary?.ultima_conclusao_em ?? null,
    },
  });
});

// GET /legado/edapp/historico — lista paginada de todo o histórico importado do EdApp
app.get('/legado/edapp/historico', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  if (!empresaId) {
    return c.json({ success: false, error: 'Empresa não identificada' }, 400);
  }

  const q = c.req.query('q') ?? '';
  const status = c.req.query('status') ?? '';
  const funcionarioId = c.req.query('funcionario_id')
    ? Number(c.req.query('funcionario_id'))
    : null;
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 50)));
  const offset = (page - 1) * limit;

  const conditions: string[] = [
    'h.empresa_id = ?',
    "h.fonte = 'EDAPP'",
    'h.deleted_at IS NULL',
    `(h.funcionario_id IS NULL OR EXISTS (
      SELECT 1
        FROM funcionarios fx
       WHERE fx.id = h.funcionario_id
         AND fx.empresa_id = h.empresa_id
         AND fx.deleted_at IS NULL
         AND COALESCE(fx.ativo, 1) = 1
         AND UPPER(COALESCE(NULLIF(TRIM(fx.status), ''), 'ATIVO')) = 'ATIVO'
    ))`,
  ];
  const bindings: (string | number)[] = [empresaId];

  if (q) {
    conditions.push(
      "(LOWER(COALESCE(h.funcionario_nome, f.nome, '')) LIKE ? OR LOWER(COALESCE(h.edapp_course_title, h.curso_titulo, '')) LIKE ?)",
    );
    const like = `%${q.toLowerCase()}%`;
    bindings.push(like, like);
  }
  if (status) {
    conditions.push('h.status = ?');
    bindings.push(status);
  }
  if (funcionarioId) {
    conditions.push('h.funcionario_id = ?');
    bindings.push(funcionarioId);
  }

  const where = conditions.join(' AND ');

  const [countRow, rows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total
         FROM lms_historico_importado h
         LEFT JOIN funcionarios f
           ON f.id = h.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        WHERE ${where}`,
    )
      .bind(...bindings)
      .first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT
         h.id,
         h.funcionario_id,
         COALESCE(h.funcionario_nome, f.nome) AS funcionario_nome,
         f.matricula AS funcionario_matricula,
         f.funcao AS funcionario_funcao,
         h.curso_id,
         COALESCE(h.edapp_course_title, h.curso_titulo) AS curso_titulo,
         h.curso_categoria,
         h.edapp_course_id,
         h.edapp_course_external_id,
         h.edapp_user_id,
         h.status,
         h.progresso_pct,
         h.score_final,
         h.qualificacao_codigo,
         h.qualificacao_historico_id,
         h.data_conclusao,
         h.completed_at,
         h.funcionario_match_type,
         h.curso_match_type,
         h.created_at,
         h.updated_at
       FROM lms_historico_importado h
       LEFT JOIN funcionarios f
         ON f.id = h.funcionario_id
        AND f.deleted_at IS NULL
        AND COALESCE(f.ativo, 1) = 1
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
       WHERE ${where}
       ORDER BY h.data_conclusao DESC, h.id DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...bindings, limit, offset)
      .all<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: rows.results ?? [],
    pagination: {
      total: Number(countRow?.total ?? 0),
      page,
      limit,
      pages: Math.ceil(Number(countRow?.total ?? 0) / limit),
    },
  });
});

app.post('/legado/edapp/importar', requireRole('admin', 'manager'), async (c) => {
  const logger = createLogger(c, 'LmsEdappLegacy.import');
  const empresaId = getEmpresaIdSafe(c);
  if (!empresaId) {
    return c.json(
      { success: false, error: 'Empresa não identificada', code: 'LMS_EDAPP_EMPRESA_REQUIRED' },
      400,
    );
  }

  try {
    const rawBody = c.req.header('content-length') ? await c.req.json() : {};
    const body = importSchema.parse(rawBody);
    const limit = Math.min(body.limit ?? DEFAULT_IMPORT_BATCH, MAX_IMPORT_BATCH);
    const reprocessar = body.reprocessar === true;

    const eventos = await c.env.DB.prepare(
      `SELECT
         e.id,
         e.tipo_evento,
         e.edapp_user_id,
         e.edapp_course_id,
         e.funcionario_id,
         e.qualificacao_historico_id,
         e.payload_json,
         e.created_at,
         h.id AS historico_id
       FROM integracoes_edapp_eventos e
       LEFT JOIN lms_historico_importado h
         ON h.integracao_evento_id = e.id
        AND h.empresa_id = ?
        AND h.fonte = 'EDAPP'
        AND h.deleted_at IS NULL
       WHERE e.deleted_at IS NULL
         AND e.tipo_evento IN (${COMPLETION_EVENT_TYPES_SQL})
         AND (? = 1 OR h.id IS NULL)
       ORDER BY datetime(e.created_at) ASC, e.id ASC
       LIMIT ?`,
    )
      .bind(empresaId, reprocessar ? 1 : 0, limit)
      .all<{
        id: number;
        tipo_evento: string;
        edapp_user_id: string | null;
        edapp_course_id: string | null;
        funcionario_id: number | null;
        qualificacao_historico_id: number | null;
        payload_json: string;
        created_at: string;
        historico_id: number | null;
      }>();

    const resultado = {
      analisados: 0,
      inseridos: 0,
      atualizados: 0,
      vinculados_lms: 0,
      vinculados_qualificacao: 0,
      mapeamentos_usuario_atualizados: 0,
      mapeamentos_curso_atualizados: 0,
      pendentes_vinculo: 0,
      ignorados_teste: 0,
      ignorados_sem_funcionario: 0,
      erros: 0,
      exemplos_erros: [] as string[],
      limit_aplicado: limit,
      pendentes_importacao_restantes: 0,
    };

    for (const evento of eventos.results) {
      resultado.analisados++;

      try {
        const payload = parseEdAppCompletionPayload(evento.payload_json);
        const qualificacao = await findQualificacaoByCourse(
          c.env.DB,
          {
            courseId: evento.edapp_course_id,
            courseExternalId: payload.courseExternalId,
            courseTitle: payload.courseTitle,
          },
          empresaId,
        );

        const curso = await resolveCursoLms(
          c.env.DB,
          empresaId,
          qualificacao?.qualificacao_codigo ?? null,
          payload.courseTitle ?? qualificacao?.edapp_course_name ?? null,
        );

        if (
          isLikelyTestEvent({
            edappUserId: evento.edapp_user_id,
            edappCourseId: evento.edapp_course_id,
            courseTitle: payload.courseTitle ?? qualificacao?.edapp_course_name ?? null,
          })
        ) {
          resultado.ignorados_teste++;
          continue;
        }

        const funcionario = await resolveFuncionarioEmpresa(c.env.DB, empresaId, evento);

        const dataConclusao = resolveEdAppCompletionDate(payload.completedAt || evento.created_at);

        if (!funcionario?.id) {
          await c.env.DB.prepare(
            `INSERT INTO lms_historico_importado (
               empresa_id,
               fonte,
               integracao_evento_id,
               funcionario_id,
               funcionario_nome,
               curso_id,
               curso_titulo,
               curso_categoria,
               tipo_conteudo,
               status,
               progresso_pct,
               score_final,
               qualificacao_codigo,
               qualificacao_historico_id,
               edapp_user_id,
               edapp_course_id,
               edapp_course_external_id,
               edapp_course_title,
               completed_at,
               data_conclusao,
               funcionario_match_type,
               curso_match_type,
               payload_json,
               updated_at,
               deleted_at
             ) VALUES (?, 'EDAPP', ?, NULL, NULL, ?, ?, ?, ?, 'PENDENTE_VINCULO', 100, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, datetime('now'), NULL)
             ON CONFLICT(empresa_id, fonte, integracao_evento_id) DO UPDATE SET
               curso_id = excluded.curso_id,
               curso_titulo = excluded.curso_titulo,
               curso_categoria = excluded.curso_categoria,
               tipo_conteudo = excluded.tipo_conteudo,
               status = excluded.status,
               progresso_pct = excluded.progresso_pct,
               score_final = excluded.score_final,
               qualificacao_codigo = excluded.qualificacao_codigo,
               qualificacao_historico_id = NULL,
               edapp_user_id = excluded.edapp_user_id,
               edapp_course_id = excluded.edapp_course_id,
               edapp_course_external_id = excluded.edapp_course_external_id,
               edapp_course_title = excluded.edapp_course_title,
               completed_at = excluded.completed_at,
               data_conclusao = excluded.data_conclusao,
               funcionario_match_type = NULL,
               curso_match_type = excluded.curso_match_type,
               payload_json = excluded.payload_json,
               updated_at = datetime('now'),
               deleted_at = NULL`,
          )
            .bind(
              empresaId,
              evento.id,
              curso?.id ?? null,
              curso?.titulo ??
                payload.courseTitle ??
                qualificacao?.edapp_course_name ??
                evento.edapp_course_id ??
                'Curso EdApp sem título',
              curso?.categoria ?? null,
              curso?.tipo_conteudo ?? null,
              typeof payload.score === 'number' ? payload.score : null,
              qualificacao?.qualificacao_codigo ?? curso?.qualificacao_codigo ?? null,
              evento.edapp_user_id,
              evento.edapp_course_id,
              payload.courseExternalId ?? null,
              payload.courseTitle ?? qualificacao?.edapp_course_name ?? null,
              payload.completedAt ?? null,
              dataConclusao,
              curso?.matched_by ?? qualificacao?.matched_by ?? null,
              evento.payload_json,
            )
            .run();

          if (
            await upsertEdappCourseMapping(c.env.DB, {
              edappCourseId: evento.edapp_course_id,
              courseTitle:
                payload.courseTitle ?? qualificacao?.edapp_course_name ?? curso?.titulo ?? null,
              courseExternalId: payload.courseExternalId,
              qualificacaoCodigo:
                qualificacao?.qualificacao_codigo ?? curso?.qualificacao_codigo ?? null,
            })
          ) {
            resultado.mapeamentos_curso_atualizados++;
          }

          resultado.pendentes_vinculo++;
          resultado.ignorados_sem_funcionario++;
          continue;
        }

        const qualificacaoHistoricoId = await resolveQualificacaoHistoricoId(c.env.DB, {
          eventoQualificacaoHistoricoId: evento.qualificacao_historico_id,
          funcionarioId: funcionario.id,
          qualificacaoCodigo:
            qualificacao?.qualificacao_codigo ?? curso?.qualificacao_codigo ?? null,
          dataConclusao,
        });

        if (
          await upsertEdappUserMapping(c.env.DB, {
            funcionarioId: funcionario.id,
            edappUserId: evento.edapp_user_id,
            userExternalId: payload.userExternalId,
          })
        ) {
          resultado.mapeamentos_usuario_atualizados++;
        }

        if (
          await upsertEdappCourseMapping(c.env.DB, {
            edappCourseId: evento.edapp_course_id,
            courseTitle:
              payload.courseTitle ?? qualificacao?.edapp_course_name ?? curso?.titulo ?? null,
            courseExternalId: payload.courseExternalId,
            qualificacaoCodigo:
              qualificacao?.qualificacao_codigo ?? curso?.qualificacao_codigo ?? null,
          })
        ) {
          resultado.mapeamentos_curso_atualizados++;
        }

        await c.env.DB.prepare(
          `INSERT INTO lms_historico_importado (
             empresa_id,
             fonte,
             integracao_evento_id,
             funcionario_id,
             funcionario_nome,
             curso_id,
             curso_titulo,
             curso_categoria,
             tipo_conteudo,
             status,
             progresso_pct,
             score_final,
             qualificacao_codigo,
             qualificacao_historico_id,
             edapp_user_id,
             edapp_course_id,
             edapp_course_external_id,
             edapp_course_title,
             completed_at,
             data_conclusao,
             funcionario_match_type,
             curso_match_type,
             payload_json,
             updated_at,
             deleted_at
           ) VALUES (?, 'EDAPP', ?, ?, ?, ?, ?, ?, ?, 'CONCLUIDO', 100, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), NULL)
           ON CONFLICT(empresa_id, fonte, integracao_evento_id) DO UPDATE SET
             funcionario_id = excluded.funcionario_id,
             funcionario_nome = excluded.funcionario_nome,
             curso_id = excluded.curso_id,
             curso_titulo = excluded.curso_titulo,
             curso_categoria = excluded.curso_categoria,
             tipo_conteudo = excluded.tipo_conteudo,
             status = excluded.status,
             progresso_pct = excluded.progresso_pct,
             score_final = excluded.score_final,
             qualificacao_codigo = excluded.qualificacao_codigo,
             qualificacao_historico_id = excluded.qualificacao_historico_id,
             edapp_user_id = excluded.edapp_user_id,
             edapp_course_id = excluded.edapp_course_id,
             edapp_course_external_id = excluded.edapp_course_external_id,
             edapp_course_title = excluded.edapp_course_title,
             completed_at = excluded.completed_at,
             data_conclusao = excluded.data_conclusao,
             funcionario_match_type = excluded.funcionario_match_type,
             curso_match_type = excluded.curso_match_type,
             payload_json = excluded.payload_json,
             updated_at = datetime('now'),
             deleted_at = NULL`,
        )
          .bind(
            empresaId,
            evento.id,
            funcionario.id,
            funcionario.nome,
            curso?.id ?? null,
            curso?.titulo ??
              payload.courseTitle ??
              qualificacao?.edapp_course_name ??
              evento.edapp_course_id ??
              'Curso EdApp sem título',
            curso?.categoria ?? null,
            curso?.tipo_conteudo ?? null,
            typeof payload.score === 'number' ? payload.score : null,
            qualificacao?.qualificacao_codigo ?? curso?.qualificacao_codigo ?? null,
            qualificacaoHistoricoId,
            evento.edapp_user_id,
            evento.edapp_course_id,
            payload.courseExternalId ?? null,
            payload.courseTitle ?? qualificacao?.edapp_course_name ?? null,
            payload.completedAt ?? null,
            dataConclusao,
            funcionario.matchType ?? null,
            curso?.matched_by ?? qualificacao?.matched_by ?? null,
            evento.payload_json,
          )
          .run();
        await reconcileImportedEdappHistory(c.env.DB, {
          empresaId,
          integracaoEventoId: evento.id,
        });

        if (evento.historico_id) {
          resultado.atualizados++;
        } else {
          resultado.inseridos++;
        }

        if (curso?.id) {
          resultado.vinculados_lms++;
        }
        if (qualificacaoHistoricoId) {
          resultado.vinculados_qualificacao++;
        }
      } catch (error) {
        resultado.erros++;
        logger.error('Falha ao importar histórico legado do EdApp para LMS', toError(error), {
          eventoId: String(evento.id),
        });
        if (resultado.exemplos_erros.length < 10) {
          resultado.exemplos_erros.push(
            `Evento ${evento.id}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
          );
        }
      }
    }

    resultado.pendentes_importacao_restantes = await countPendingLegacyImports(c.env.DB, empresaId);

    return c.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao iniciar importação legada do EdApp para LMS', toError(error));
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao importar histórico legado',
        code: 'LMS_EDAPP_IMPORT_ERROR',
      },
      400,
    );
  }
});

export default app;
