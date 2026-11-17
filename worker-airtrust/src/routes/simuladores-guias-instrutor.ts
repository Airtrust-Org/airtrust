/**
 * SIMULADORES — Biblioteca de Guias do Instrutor de Simulador
 *
 * Documento lógico versionado (HTML de consulta + PDF canônico) vinculado a
 * um modelo_sessao. NÃO é módulo LMS: sem matrícula, progresso, conclusão,
 * certificado ou controle de páginas lidas.
 *
 * Acesso de leitura:  simuladores.guias.visualizar (default: role >= instructor,
 *                      GRANT explícito, ou Platform Admin — ver
 *                      middleware/guias-instrutor-permissions.ts)
 * Acesso de gestão:   simuladores.guias.gerenciar (sem default de role — só
 *                      GRANT explícito ou Platform Admin)
 *
 * Rotas montadas sob /api/simuladores (ver simuladores-core.ts).
 */

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext, normalizeContextUserId } from '../middleware/tenant';
import {
  requireGuiaInstrutorRead,
  requireGuiaInstrutorManage,
  resolveGuiaInstrutorPermissions,
  hasGuiaInstrutorCapability,
  GUIAS_INSTRUTOR_CAPABILITIES,
} from '../middleware/guias-instrutor-permissions';
import { badRequest, forbidden, notFound } from '../middleware/error-handler';
import { getFuncId, isFullAccessRole } from '../services/simuladores/shared';
import { sanitizeGuiaHtml } from '../lib/guias-instrutor/html-sanitizer';
import {
  buildGuiaR2Key,
  buildDownloadFilename,
  contentDispositionAttachment,
  looksLikeHtml,
  looksLikePdf,
  sha256Hex,
} from '../lib/guias-instrutor/storage';
import { requireOperationalAccess } from '../middleware/operational-domain-access';
import {
  FUNCIONAL_AERONAVE_CODIGO,
  FUNCIONAL_AERONAVE_NOME,
  GUIAS_PROGRAMAS,
  isProgramaFuncional,
} from '../lib/guias-instrutor/programas';

// Guias de instrutor são fixed-domain OPERACOES — see
// docs/rbac/gestor-operational-autonomy.md. Additive to the existing
// requireGuiaInstrutorManage() capability check — never replaces it.
const requireOperacoesGuia = (action: 'create' | 'update' | 'publish' | 'unpublish') =>
  requireOperationalAccess({ domain: 'OPERACOES', action, resourceType: 'simulador_guia_instrutor' });

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

const GUIA_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, no-store',
} as const;

const GUIA_HTML_CSP =
  "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; script-src 'none'; connect-src 'none'; frame-src 'none'; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

const ProgramaEnum = z.enum(GUIAS_PROGRAMAS);

const CreateGuiaSchema = z
  .object({
    modelo_aeronave_id: z.coerce.number().int().positive().nullish(),
    programa: ProgramaEnum,
    ciclo: z.coerce.number().int().positive().nullish(),
    sessao_numero: z.coerce.number().int().positive().nullish(),
    sessao_total: z.coerce.number().int().positive().nullish(),
    codigo: z.string().min(1).max(40),
    titulo: z.string().min(1).max(200),
    descricao: z.string().max(1000).nullish(),
    versao: z.string().min(1).max(20),
  })
  .superRefine((val, ctx) => {
    if (!isProgramaFuncional(val.programa) && val.modelo_aeronave_id == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modelo_aeronave_id'],
        message: 'modelo_aeronave_id é obrigatório para programas de aeronave',
      });
    }
  });

const UpdateGuiaSchema = z.object({
  titulo: z.string().min(1).max(200).optional(),
  descricao: z.string().max(1000).nullish(),
  ciclo: z.coerce.number().int().positive().nullish(),
  sessao_numero: z.coerce.number().int().positive().nullish(),
  sessao_total: z.coerce.number().int().positive().nullish(),
  modelo_sessao_id: z.coerce.number().int().positive().nullish(),
  principal: z.coerce.number().int().min(0).max(1).optional(),
});

type GuiaRow = {
  id: number;
  empresa_id: number;
  modelo_aeronave_id: number | null;
  programa: string;
  ciclo: number | null;
  sessao_numero: number | null;
  sessao_total: number | null;
  codigo: string;
  titulo: string;
  descricao: string | null;
  versao: string;
  status: string;
  html_r2_key: string | null;
  html_nome: string | null;
  html_mime_type: string | null;
  html_tamanho_bytes: number | null;
  html_sha256: string | null;
  html_status_validacao: string;
  pdf_r2_key: string | null;
  pdf_nome: string | null;
  pdf_mime_type: string | null;
  pdf_tamanho_bytes: number | null;
  pdf_sha256: string | null;
  publicado_em: string | null;
  created_by: number;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  modelo_sessao_id?: number | null;
  nome_sessao?: string | null;
  descricao_sessao?: string | null;
};

async function resolveAeronaveMeta(
  db: D1Database,
  modeloAeronaveId: number | null,
): Promise<{ nome: string; codigo: string }> {
  if (modeloAeronaveId == null) {
    return { nome: FUNCIONAL_AERONAVE_NOME, codigo: FUNCIONAL_AERONAVE_CODIGO };
  }
  const aeronave = await db
    .prepare('SELECT nome, codigo FROM modelos_aeronave WHERE id = ?')
    .bind(modeloAeronaveId)
    .first<{ nome: string; codigo: string }>();
  return {
    nome: aeronave?.nome || '',
    codigo: aeronave?.codigo || '',
  };
}

async function loadGuia(
  db: D1Database,
  empresaId: number,
  id: number,
  opts: { anyStatus?: boolean } = {},
): Promise<GuiaRow | null> {
  const statusClause = opts.anyStatus ? '' : "AND g.status = 'ATIVO'";
  const row = await db
    .prepare(
      `SELECT g.id, g.empresa_id, g.modelo_aeronave_id, g.programa, g.ciclo, g.sessao_numero, g.sessao_total,
              g.codigo, g.titulo, g.descricao, g.versao, g.status,
              g.html_r2_key, g.html_nome, g.html_mime_type, g.html_tamanho_bytes, g.html_sha256,
              g.html_status_validacao,
              g.pdf_r2_key, g.pdf_nome, g.pdf_mime_type, g.pdf_tamanho_bytes, g.pdf_sha256,
              g.substituido_por_id, g.publicado_em, g.created_by, g.updated_by,
              g.created_at, g.updated_at, g.deleted_at,
              msg.modelo_sessao_id, ms.nome as nome_sessao, ms.descricao as descricao_sessao
       FROM simuladores_guias_instrutor_v2 g
       LEFT JOIN simuladores_modelos_sessao_guias_v2 msg 
         ON msg.guia_id = g.id AND msg.empresa_id = g.empresa_id AND msg.deleted_at IS NULL AND msg.principal = 1
       LEFT JOIN modelos_sessao ms ON ms.id = msg.modelo_sessao_id
       WHERE g.id = ? AND g.empresa_id = ? AND g.deleted_at IS NULL ${statusClause}
       LIMIT 1`,
    )
    .bind(id, empresaId)
    .first<GuiaRow>();
  return row ?? null;
}

async function registrarAuditoria(
  db: D1Database,
  params: {
    empresaId: number;
    guiaId: number;
    usuarioId: number;
    acao: string;
    anterior?: unknown;
    novo?: unknown;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO simuladores_guias_instrutor_auditoria_v2
           (empresa_id, guia_id, usuario_id, acao, valores_anteriores, valores_novos)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        params.empresaId,
        params.guiaId,
        params.usuarioId,
        params.acao,
        params.anterior ? JSON.stringify(params.anterior) : null,
        params.novo ? JSON.stringify(params.novo) : null,
      )
      .run();
  } catch (e) {
    console.error('[guias-instrutor] audit failed:', e);
  }
}

function publicGuiaShape(row: GuiaRow, aeronaveNome: string, aeronaveCodigo: string) {
  return {
    id: row.id,
    modelo_aeronave_id: row.modelo_aeronave_id,
    aeronave_nome: aeronaveNome,
    aeronave_codigo: aeronaveCodigo,
    programa: row.programa,
    ciclo: row.ciclo,
    sessao_numero: row.sessao_numero,
    sessao_total: row.sessao_total,
    codigo: row.codigo,
    titulo: row.titulo,
    descricao: row.descricao,
    versao: row.versao,
    status: row.status,
    html_disponivel: row.html_status_validacao === 'VALIDO',
    html_status_validacao: row.html_status_validacao,
    pdf_disponivel: Boolean(row.pdf_r2_key),
    pdf_tamanho_bytes: row.pdf_tamanho_bytes,
    publicado_em: row.publicado_em,
    updated_at: row.updated_at,
    modelo_sessao_id: row.modelo_sessao_id ?? null,
    nome_sessao: row.nome_sessao ?? null,
    descricao_sessao: row.descricao_sessao ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// CAPABILITIES — única fonte de autorização real para o frontend consumir
// (nunca inferir a partir de texto de role/perfil cacheado no JWT).
// ─────────────────────────────────────────────────────────────────────────

app.get('/guias-instrutor/minhas-permissoes', auth(), async (c) => {
  const result = await resolveGuiaInstrutorPermissions(c);
  return c.json({ success: true, data: result });
});

// ─────────────────────────────────────────────────────────────────────────
// LEITURA — instrutor autorizado da empresa ativa
// ─────────────────────────────────────────────────────────────────────────

app.get('/guias-instrutor', requireGuiaInstrutorRead(), async (c) => {
  const { empresaId } = getTenantContext(c);
  const isManage = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.gerenciar);

  const aeronave = c.req.query('aeronave');
  const programa = c.req.query('programa');
  const q = c.req.query('q');
  const statusParam = c.req.query('status');
  const admin = c.req.query('admin') === '1' && isManage;

  let sql = `
    SELECT g.*,
           COALESCE(ma.nome, '${FUNCIONAL_AERONAVE_NOME}') as aeronave_nome,
           COALESCE(ma.codigo, '${FUNCIONAL_AERONAVE_CODIGO}') as aeronave_codigo,
           msg.modelo_sessao_id, ms.nome as nome_sessao, ms.descricao as descricao_sessao
    FROM simuladores_guias_instrutor_v2 g
    LEFT JOIN modelos_aeronave ma ON ma.id = g.modelo_aeronave_id
    LEFT JOIN simuladores_modelos_sessao_guias_v2 msg 
      ON msg.guia_id = g.id AND msg.empresa_id = g.empresa_id AND msg.deleted_at IS NULL AND msg.principal = 1
    LEFT JOIN modelos_sessao ms ON ms.id = msg.modelo_sessao_id
    WHERE g.empresa_id = ? AND g.deleted_at IS NULL
  `;
  const params: unknown[] = [empresaId];

  if (admin && statusParam) {
    sql += ' AND g.status = ?';
    params.push(statusParam);
  } else if (!admin) {
    sql += " AND g.status = 'ATIVO'";
  }

  // Costa do Sol: instructor-facing library displays only the guide linked
  // to the CURRENT curricular version. The 51 historical guides remain
  // active and accessible through the administrative archive and direct
  // authorized links; no R2/D1 mutation is performed by this filter.
  // Other tenants retain their existing catalog contract.
  if (!admin && empresaId === 6) {
    sql += ` AND EXISTS (
      SELECT 1 FROM simuladores_modelos_sessao_guias_v2 current_link
      JOIN modelos_sessao_versionamento current_version
        ON current_version.modelo_id = current_link.modelo_sessao_id
       AND current_version.empresa_id = g.empresa_id
       AND current_version.is_current = 1
      WHERE current_link.guia_id = g.id
        AND current_link.empresa_id = g.empresa_id
        AND current_link.deleted_at IS NULL
        AND current_link.principal = 1
    )`;
  }

  if (aeronave === FUNCIONAL_AERONAVE_CODIGO) {
    sql += " AND (g.modelo_aeronave_id IS NULL OR g.programa IN ('INSTRUTOR', 'EXAMINADOR'))";
  } else if (aeronave) {
    sql += ' AND (ma.codigo = ? OR CAST(g.modelo_aeronave_id AS TEXT) = ?)';
    params.push(aeronave, aeronave);
  }
  if (programa) {
    sql += ' AND g.programa = ?';
    params.push(programa);
  }
  if (q) {
    sql += ' AND (g.titulo LIKE ? OR g.codigo LIKE ? OR ms.nome LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += " ORDER BY COALESCE(ma.nome, 'ZZZ'), g.programa, g.ciclo, g.sessao_numero, g.codigo";

  const result = await c.env.DB.prepare(sql)
    .bind(...params)
    .all<GuiaRow & { aeronave_nome: string; aeronave_codigo: string; modelo_sessao_id: number | null; nome_sessao: string | null; descricao_sessao: string | null }>();

  const data = (result.results || []).map((row) =>
    admin
      ? { ...publicGuiaShape(row, row.aeronave_nome, row.aeronave_codigo), _admin: { html_r2_key_present: Boolean(row.html_r2_key) } }
      : publicGuiaShape(row, row.aeronave_nome, row.aeronave_codigo),
  );

  return c.json({ success: true, data });
});

app.get('/guias-instrutor/proximas-sessoes', requireGuiaInstrutorRead(), async (c) => {
  const { empresaId } = getTenantContext(c);
  const userId = String(c.get('userId') || '');
  const role = String(c.get('userRole') || '');
  const limit = Math.min(Number(c.req.query('limit') || 10) || 10, 50);

  const funcId = isFullAccessRole(role) ? null : await getFuncId(c.env.DB, userId, empresaId);
  if (!isFullAccessRole(role) && !funcId) {
    return c.json({ success: true, data: [] });
  }

  let sql = `
    SELECT
      sa.id as sessao_id, sa.data, sa.hora_inicio, sa.hora_fim, sa.tipo_sessao,
      sa.nome as tema_sessao, sa.template_id as modelo_sessao_id,
      s.nome as simulador_nome,
      g.id as guia_id
    FROM simulador_agendamentos sa
    LEFT JOIN simuladores s ON sa.simulador_id = s.id
    LEFT JOIN simuladores_modelos_sessao_guias_v2 msg
      ON msg.modelo_sessao_id = sa.template_id AND msg.empresa_id = sa.empresa_id
      AND msg.deleted_at IS NULL AND msg.principal = 1
    LEFT JOIN simuladores_guias_instrutor_v2 g
      ON g.id = msg.guia_id AND g.status = 'ATIVO' AND g.deleted_at IS NULL
    WHERE sa.deleted_at IS NULL AND sa.empresa_id = ? AND sa.data >= date('now')
  `;
  const params: unknown[] = [empresaId];

  if (!isFullAccessRole(role)) {
    sql +=
      ' AND (sa.instrutor_id = ? OR EXISTS (SELECT 1 FROM sessoes_participantes sp WHERE sp.sessao_id = sa.id AND sp.funcionario_id = ? AND sp.deleted_at IS NULL))';
    params.push(funcId, funcId);
  }

  sql += ' ORDER BY sa.data, sa.hora_inicio LIMIT ?';
  params.push(limit);

  const result = await c.env.DB.prepare(sql)
    .bind(...params)
    .all();

  return c.json({ success: true, data: result.results || [] });
});

app.get('/sessoes/:sessaoId/guias-instrutor', requireGuiaInstrutorRead(), async (c) => {
  const { empresaId } = getTenantContext(c);
  const sessaoId = Number(c.req.param('sessaoId'));
  if (!Number.isInteger(sessaoId) || sessaoId <= 0) {
    return badRequest('sessaoId inválido');
  }

  const sessao = await c.env.DB.prepare(
    `SELECT id, template_id as modelo_sessao_id FROM simulador_agendamentos
     WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(sessaoId, empresaId)
    .first<{ id: number; modelo_sessao_id: number | null }>();

  if (!sessao || !sessao.modelo_sessao_id) {
    return c.json({ success: true, data: null });
  }

  const row = await c.env.DB.prepare(
    `SELECT g.*,
            COALESCE(ma.nome, '${FUNCIONAL_AERONAVE_NOME}') as aeronave_nome,
            COALESCE(ma.codigo, '${FUNCIONAL_AERONAVE_CODIGO}') as aeronave_codigo,
            msg.modelo_sessao_id, ms.nome as nome_sessao, ms.descricao as descricao_sessao
     FROM simuladores_modelos_sessao_guias_v2 msg
     JOIN simuladores_guias_instrutor_v2 g ON g.id = msg.guia_id
     LEFT JOIN modelos_aeronave ma ON ma.id = g.modelo_aeronave_id
     LEFT JOIN modelos_sessao ms ON ms.id = msg.modelo_sessao_id
     WHERE msg.modelo_sessao_id = ? AND msg.empresa_id = ? AND msg.deleted_at IS NULL
       AND g.status = 'ATIVO' AND g.deleted_at IS NULL
     ORDER BY msg.principal DESC, msg.ordem ASC
     LIMIT 1`,
  )
    .bind(sessao.modelo_sessao_id, empresaId)
    .first<GuiaRow & { aeronave_nome: string; aeronave_codigo: string; modelo_sessao_id: number | null; nome_sessao: string | null; descricao_sessao: string | null }>();

  if (!row) {
    return c.json({ success: true, data: null });
  }

  return c.json({ success: true, data: publicGuiaShape(row, row.aeronave_nome, row.aeronave_codigo) });
});

app.get('/guias-instrutor/:id', requireGuiaInstrutorRead(), async (c) => {
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const isManage = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.gerenciar);

  const row = await loadGuia(c.env.DB, empresaId, id, { anyStatus: isManage });
  if (!row) return notFound('Guia não encontrado');

  const aeronave = await resolveAeronaveMeta(c.env.DB, row.modelo_aeronave_id);

  return c.json({
    success: true,
    data: publicGuiaShape(row, aeronave.nome, aeronave.codigo),
  });
});

app.get('/guias-instrutor/:id/html', requireGuiaInstrutorRead(), async (c) => {
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));

  const row = await loadGuia(c.env.DB, empresaId, id);
  if (!row || row.html_status_validacao !== 'VALIDO' || !row.html_r2_key) {
    return notFound('HTML não disponível para este guia');
  }

  const object = await c.env.BUCKET.get(row.html_r2_key);
  if (!object) {
    return notFound('Arquivo não encontrado');
  }

  // IMPORTANTE: usar c.newResponse() em vez de new Response() para que o
  // Hono mescle os headers CORS já injetados pelo middleware cors() com os
  // headers desta resposta binária. new Response() nativo ignora c.header().
  return c.newResponse(object.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': GUIA_HTML_CSP,
      ...GUIA_SECURITY_HEADERS,
    },
  });
});

async function servePdf(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  disposition: 'inline' | 'attachment',
) {
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));

  const row = await loadGuia(c.env.DB, empresaId, id);
  if (!row || !row.pdf_r2_key) {
    return notFound('PDF não disponível para este guia');
  }

  const object = await c.env.BUCKET.get(row.pdf_r2_key);
  if (!object) {
    return notFound('Arquivo não encontrado');
  }

  const aeronave = await resolveAeronaveMeta(c.env.DB, row.modelo_aeronave_id);

  const filename = buildDownloadFilename({
    aeronaveNome: aeronave.nome || 'Aeronave',
    programa: row.programa,
    ciclo: row.ciclo,
    sessaoNumero: row.sessao_numero,
    codigo: row.codigo,
    versao: row.versao,
    extensao: 'pdf',
  });

  const contentDisposition =
    disposition === 'attachment'
      ? contentDispositionAttachment(filename)
      : `inline; filename="${filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')}"`;

  // IMPORTANTE: usar c.newResponse() em vez de new Response() para que o
  // Hono mescle os headers CORS já injetados pelo middleware cors() com os
  // headers desta resposta binária. new Response() nativo ignora c.header().
  // Access-Control-Expose-Headers é obrigatório para que o navegador
  // exponha Content-Disposition ao JavaScript do frontend.
  return c.newResponse(object.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition,
      'Access-Control-Expose-Headers': 'Content-Disposition, Content-Type, Content-Length, ETag',
      ...GUIA_SECURITY_HEADERS,
    },
  });
}

app.get('/guias-instrutor/:id/pdf', requireGuiaInstrutorRead(), (c) => servePdf(c, 'inline'));
app.get('/guias-instrutor/:id/download', requireGuiaInstrutorRead(), (c) =>
  servePdf(c, 'attachment'),
);

// ─────────────────────────────────────────────────────────────────────────
// ADMINISTRAÇÃO — gestor/admin autorizado da empresa ativa
// ─────────────────────────────────────────────────────────────────────────

app.post('/guias-instrutor', requireGuiaInstrutorManage(), requireOperacoesGuia('create'), async (c) => {
  const { empresaId } = getTenantContext(c);
  const userId = normalizeContextUserId(c.get('userId'));

  const body = CreateGuiaSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return badRequest(body.error.errors.map((e) => e.message).join('; '));
  }
  const input = body.data;

  const result = await c.env.DB.prepare(
    `INSERT INTO simuladores_guias_instrutor_v2
       (empresa_id, modelo_aeronave_id, programa, ciclo, sessao_numero, sessao_total,
        codigo, titulo, descricao, versao, status, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RASCUNHO', ?, ?)`,
  )
    .bind(
      empresaId,
      input.modelo_aeronave_id ?? null,
      input.programa,
      input.ciclo ?? null,
      input.sessao_numero ?? null,
      input.sessao_total ?? null,
      input.codigo,
      input.titulo,
      input.descricao ?? null,
      input.versao,
      userId,
      userId,
    )
    .run();

  const guiaId = Number(result.meta.last_row_id);
  await registrarAuditoria(c.env.DB, {
    empresaId,
    guiaId,
    usuarioId: userId,
    acao: 'CRIACAO',
    novo: input,
  });

  return c.json({ success: true, data: { id: guiaId } }, 201);
});

app.put('/guias-instrutor/:id', requireGuiaInstrutorManage(), requireOperacoesGuia('update'), async (c) => {
  const { empresaId } = getTenantContext(c);
  const userId = normalizeContextUserId(c.get('userId'));
  const id = Number(c.req.param('id'));

  const row = await loadGuia(c.env.DB, empresaId, id, { anyStatus: true });
  if (!row) return notFound('Guia não encontrado');
  if (row.status === 'ATIVO' || row.status === 'SUBSTITUIDO') {
    return forbidden(
      'Versão publicada não pode ser editada — publique uma nova versão',
      'GUIA_VERSAO_IMUTAVEL',
    );
  }

  const body = UpdateGuiaSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return badRequest(body.error.errors.map((e) => e.message).join('; '));
  }
  const input = body.data;

  await c.env.DB.prepare(
    `UPDATE simuladores_guias_instrutor_v2
     SET titulo = COALESCE(?, titulo),
         descricao = COALESCE(?, descricao),
         ciclo = COALESCE(?, ciclo),
         sessao_numero = COALESCE(?, sessao_numero),
         sessao_total = COALESCE(?, sessao_total),
         updated_by = ?, updated_at = datetime('now')
     WHERE id = ? AND empresa_id = ?`,
  )
    .bind(
      input.titulo ?? null,
      input.descricao ?? null,
      input.ciclo ?? null,
      input.sessao_numero ?? null,
      input.sessao_total ?? null,
      userId,
      id,
      empresaId,
    )
    .run();

  if (input.modelo_sessao_id) {
    const modeloSessao = await c.env.DB.prepare(
      'SELECT id FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(input.modelo_sessao_id)
      .first<{ id: number }>();
    if (!modeloSessao) return badRequest('modelo_sessao_id inválido');

    await c.env.DB.prepare(
      `INSERT INTO simuladores_modelos_sessao_guias_v2
         (empresa_id, modelo_sessao_id, guia_id, principal, ordem)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(modelo_sessao_id, guia_id) WHERE deleted_at IS NULL DO UPDATE SET
         principal = excluded.principal, updated_at = datetime('now'), deleted_at = NULL`,
    )
      .bind(empresaId, input.modelo_sessao_id, id, input.principal ?? 1)
      .run();
  }

  await registrarAuditoria(c.env.DB, {
    empresaId,
    guiaId: id,
    usuarioId: userId,
    acao: 'ATUALIZACAO_METADADOS',
    anterior: row,
    novo: input,
  });

  return c.json({ success: true, data: { id } });
});

/**
 * Publicação em duas fases (não é uma transação cross-system: D1 e R2 são
 * sistemas separados, sem 2PC entre eles).
 *
 * Fase 1 (abaixo): TODA validação — PDF, HTML, sanitização — roda ANTES de
 * qualquer escrita em D1 ou R2. Isso elimina a classe de falha mais comum
 * (entrada inválida) sem deixar nada órfão, porque nada foi escrito ainda.
 *
 * Fase 2: cria o registro D1 em RASCUNHO, sobe PDF/HTML para chaves R2
 * determinísticas (empresa+aeronave+programa+código+versão), e só então
 * marca o registro como VALIDACAO. Se qualquer passo da Fase 2 falhar
 * depois de já ter escrito algo, o `catch` abaixo tenta compensar
 * (best-effort): apaga os objetos R2 já enviados e remove o registro
 * RASCUNHO. Compensação best-effort não é atomicidade — numa falha dupla
 * (ex: a própria compensação falha), pode sobrar um objeto R2 órfão ou uma
 * linha RASCUNHO travada. Ambos os casos são seguros (nunca ficam
 * alcançáveis como ATIVO — `ativar()` exige pdf_r2_key preenchido, e o
 * registro nunca aparece na biblioteca fora de RASCUNHO/VALIDACAO) e
 * autocorrigem numa nova tentativa, já que a chave R2 é determinística
 * (mesma versão ⇒ mesma chave ⇒ sobrescreve o objeto órfão).
 */
app.post(
  '/guias-instrutor/:id/versoes',
  requireGuiaInstrutorManage(),
  requireOperacoesGuia('create'),
  async (c) => {
  const { empresaId } = getTenantContext(c);
  const userId = normalizeContextUserId(c.get('userId'));
  const baseId = Number(c.req.param('id'));

  const base = await loadGuia(c.env.DB, empresaId, baseId, { anyStatus: true });
  if (!base) return notFound('Guia base não encontrado');

  const formData = await c.req.formData();
  const versao = String(formData.get('versao') || '').trim();
  if (!versao) return badRequest('versao é obrigatória');

  const pdfFile = formData.get('pdf') as File | null;
  const htmlFile = formData.get('html') as File | null;
  const assetFiles: unknown[] = formData.getAll('assets');
  if (!pdfFile) return badRequest('arquivo PDF é obrigatório');

  // ── Fase 1: validação completa, nenhuma escrita ainda ──────────────────
  const assets: Record<string, { bytes: Uint8Array; mimeType: string }> = {};
  for (const assetFile of assetFiles) {
    if (!(assetFile instanceof File)) continue;
    assets[assetFile.name] = {
      bytes: new Uint8Array(await assetFile.arrayBuffer()),
      mimeType: assetFile.type || 'application/octet-stream',
    };
  }

  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
  if (pdfBytes.length === 0) return badRequest('PDF vazio rejeitado');
  if (!looksLikePdf(pdfBytes)) return badRequest('arquivo enviado no campo PDF não é um PDF válido');

  let sanitizedHtml: string | null = null;
  let sanitizeAlertas: string[] = [];
  let htmlStatus = 'NAO_DISPONIVEL';

  if (htmlFile) {
    const rawHtml = await htmlFile.text();
    if (!rawHtml || !looksLikeHtml(rawHtml)) {
      return badRequest('arquivo enviado no campo HTML não parece ser um HTML válido');
    }
    const sanitized = sanitizeGuiaHtml(rawHtml, assets);
    sanitizedHtml = sanitized.html;
    sanitizeAlertas = sanitized.alertas;
    htmlStatus = sanitized.aprovado ? 'VALIDO' : 'REJEITADO';
  }

  const aeronave = await resolveAeronaveMeta(c.env.DB, base.modelo_aeronave_id);

  const pdfKey = buildGuiaR2Key({
    empresaId,
    aeronaveCodigo: aeronave.codigo || 'AERONAVE',
    programa: base.programa,
    codigo: base.codigo,
    versao,
    arquivo: 'guia.pdf',
  });
  const htmlKey = htmlFile
    ? buildGuiaR2Key({
        empresaId,
        aeronaveCodigo: aeronave.codigo || 'AERONAVE',
        programa: base.programa,
        codigo: base.codigo,
        versao,
        arquivo: 'index.html',
      })
    : null;

  // ── Fase 2: escrita, com compensação best-effort em caso de falha ──────
  let newId: number | null = null;
  const uploadedKeys: string[] = [];

  try {
    const insertResult = await c.env.DB.prepare(
      `INSERT INTO simuladores_guias_instrutor_v2
         (empresa_id, modelo_aeronave_id, programa, ciclo, sessao_numero, sessao_total,
          codigo, titulo, descricao, versao, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RASCUNHO', ?, ?)`,
    )
      .bind(
        empresaId,
        base.modelo_aeronave_id,
        base.programa,
        base.ciclo,
        base.sessao_numero,
        base.sessao_total,
        base.codigo,
        base.titulo,
        base.descricao,
        versao,
        userId,
        userId,
      )
      .run();

    newId = Number(insertResult.meta.last_row_id);

    await c.env.BUCKET.put(pdfKey, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } });
    uploadedKeys.push(pdfKey);
    const pdfHash = await sha256Hex(pdfBytes.buffer as ArrayBuffer);

    let htmlHash: string | null = null;
    let htmlSize: number | null = null;

    if (htmlFile && htmlKey && sanitizedHtml !== null) {
      const htmlBytes = new TextEncoder().encode(sanitizedHtml);
      await c.env.BUCKET.put(htmlKey, htmlBytes, {
        httpMetadata: { contentType: 'text/html; charset=utf-8' },
      });
      uploadedKeys.push(htmlKey);
      htmlHash = await sha256Hex(htmlBytes.buffer as ArrayBuffer);
      htmlSize = htmlBytes.length;
    }

    await c.env.DB.prepare(
      `UPDATE simuladores_guias_instrutor_v2
       SET pdf_r2_key = ?, pdf_nome = ?, pdf_mime_type = 'application/pdf',
           pdf_tamanho_bytes = ?, pdf_sha256 = ?,
           html_r2_key = ?, html_nome = ?, html_mime_type = ?, html_tamanho_bytes = ?,
           html_sha256 = ?, html_status_validacao = ?,
           status = 'VALIDACAO', updated_by = ?, updated_at = datetime('now')
       WHERE id = ? AND empresa_id = ?`,
    )
      .bind(
        pdfKey,
        pdfFile.name,
        pdfBytes.length,
        pdfHash,
        htmlKey,
        htmlFile?.name ?? null,
        htmlFile ? 'text/html' : null,
        htmlSize,
        htmlHash,
        htmlStatus,
        userId,
        newId,
        empresaId,
      )
      .run();

    await registrarAuditoria(c.env.DB, {
      empresaId,
      guiaId: newId,
      usuarioId: userId,
      acao: 'UPLOAD_VERSAO',
      novo: { versao, pdf_sha256: pdfHash, html_sha256: htmlHash, html_status_validacao: htmlStatus, sanitizeAlertas },
    });

    return c.json(
      { success: true, data: { id: newId, versao, html_status_validacao: htmlStatus, sanitizeAlertas } },
      201,
    );
  } catch (err) {
    for (const key of uploadedKeys) {
      await c.env.BUCKET.delete(key).catch((cleanupErr) =>
        console.error('[guias-instrutor] compensação: falha ao apagar objeto R2 órfão', key, cleanupErr),
      );
    }
    if (newId !== null) {
      await c.env.DB.prepare('DELETE FROM simuladores_guias_instrutor_v2 WHERE id = ? AND empresa_id = ?')
        .bind(newId, empresaId)
        .run()
        .catch((cleanupErr) =>
          console.error('[guias-instrutor] compensação: falha ao remover rascunho órfão', newId, cleanupErr),
        );
    }
    throw err;
  }
});

app.post(
  '/guias-instrutor/:id/validar-html',
  requireGuiaInstrutorManage(),
  requireOperacoesGuia('update'),
  async (c) => {
  const { empresaId } = getTenantContext(c);
  const userId = normalizeContextUserId(c.get('userId'));
  const id = Number(c.req.param('id'));

  const row = await loadGuia(c.env.DB, empresaId, id, { anyStatus: true });
  if (!row) return notFound('Guia não encontrado');
  if (!row.html_r2_key) return badRequest('Guia não possui HTML enviado');

  const object = await c.env.BUCKET.get(row.html_r2_key);
  if (!object) return notFound('Arquivo HTML não encontrado no storage');

  const rawHtml = await object.text();
  const sanitized = sanitizeGuiaHtml(rawHtml);
  const htmlStatus = sanitized.aprovado ? 'VALIDO' : 'REJEITADO';
  const htmlBytes = new TextEncoder().encode(sanitized.html);
  await c.env.BUCKET.put(row.html_r2_key, htmlBytes, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
  });
  const htmlHash = await sha256Hex(htmlBytes.buffer as ArrayBuffer);

  await c.env.DB.prepare(
    `UPDATE simuladores_guias_instrutor_v2
     SET html_status_validacao = ?, html_sha256 = ?, html_tamanho_bytes = ?,
         updated_by = ?, updated_at = datetime('now')
     WHERE id = ? AND empresa_id = ?`,
  )
    .bind(htmlStatus, htmlHash, htmlBytes.length, userId, id, empresaId)
    .run();

  await registrarAuditoria(c.env.DB, {
    empresaId,
    guiaId: id,
    usuarioId: userId,
    acao: 'VALIDACAO_HTML',
    anterior: { html_status_validacao: row.html_status_validacao },
    novo: { html_status_validacao: htmlStatus, alertas: sanitized.alertas },
  });

  return c.json({
    success: true,
    data: { html_status_validacao: htmlStatus, alertas: sanitized.alertas },
  });
});

app.post(
  '/guias-instrutor/:id/ativar',
  requireGuiaInstrutorManage(),
  requireOperacoesGuia('publish'),
  async (c) => {
  const { empresaId } = getTenantContext(c);
  const userId = normalizeContextUserId(c.get('userId'));
  const id = Number(c.req.param('id'));

  const row = await loadGuia(c.env.DB, empresaId, id, { anyStatus: true });
  if (!row) return notFound('Guia não encontrado');
  if (row.status === 'ATIVO') return badRequest('Versão já está ativa');
  if (row.status === 'SUBSTITUIDO') return badRequest('Versão substituída não pode ser reativada diretamente');
  if (!row.pdf_r2_key || !row.pdf_sha256) {
    return badRequest('PDF válido é obrigatório para ativar uma versão');
  }
  if (row.html_r2_key && row.html_status_validacao === 'REJEITADO') {
    return badRequest('HTML rejeitado impede ativação — corrija ou remova o HTML antes de ativar');
  }

  const vinculo = await c.env.DB.prepare(
    `SELECT 1 FROM simuladores_modelos_sessao_guias_v2
     WHERE guia_id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(id, empresaId)
    .first();
  if (!vinculo) {
    return badRequest('Guia precisa estar vinculado a um modelo de sessão antes de ativar');
  }

  const outrasAtivas = await c.env.DB.prepare(
    `SELECT id FROM simuladores_guias_instrutor_v2
     WHERE empresa_id = ? AND (modelo_aeronave_id IS ? OR modelo_aeronave_id = ?) AND programa = ?
       AND (ciclo IS ? OR ciclo = ?) AND (sessao_numero IS ? OR sessao_numero = ?)
       AND codigo = ? AND status = 'ATIVO' AND deleted_at IS NULL AND id != ?`,
  )
    .bind(
      empresaId,
      row.modelo_aeronave_id,
      row.modelo_aeronave_id,
      row.programa,
      row.ciclo,
      row.ciclo,
      row.sessao_numero,
      row.sessao_numero,
      row.codigo,
      id,
    )
    .all<{ id: number }>();

  const statements = [];
  for (const antiga of outrasAtivas.results || []) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE simuladores_guias_instrutor_v2
         SET status = 'SUBSTITUIDO', substituido_por_id = ?, updated_by = ?, updated_at = datetime('now')
         WHERE id = ? AND empresa_id = ?`,
      ).bind(id, userId, antiga.id, empresaId),
    );
  }
  statements.push(
    c.env.DB.prepare(
      `UPDATE simuladores_guias_instrutor_v2
       SET status = 'ATIVO', publicado_em = datetime('now'), updated_by = ?, updated_at = datetime('now')
       WHERE id = ? AND empresa_id = ?`,
    ).bind(userId, id, empresaId),
  );

  await c.env.DB.batch(statements);

  await registrarAuditoria(c.env.DB, {
    empresaId,
    guiaId: id,
    usuarioId: userId,
    acao: 'ATIVACAO',
    anterior: { status: row.status, substituidas: (outrasAtivas.results || []).map((r) => r.id) },
    novo: { status: 'ATIVO' },
  });

  return c.json({ success: true, data: { id, status: 'ATIVO' } });
});

app.post(
  '/guias-instrutor/:id/desativar',
  requireGuiaInstrutorManage(),
  requireOperacoesGuia('unpublish'),
  async (c) => {
  const { empresaId } = getTenantContext(c);
  const userId = normalizeContextUserId(c.get('userId'));
  const id = Number(c.req.param('id'));

  const row = await loadGuia(c.env.DB, empresaId, id, { anyStatus: true });
  if (!row) return notFound('Guia não encontrado');
  if (row.status !== 'ATIVO') return badRequest('Apenas versões ativas podem ser desativadas');

  await c.env.DB.prepare(
    `UPDATE simuladores_guias_instrutor_v2
     SET status = 'INATIVO', updated_by = ?, updated_at = datetime('now')
     WHERE id = ? AND empresa_id = ?`,
  )
    .bind(userId, id, empresaId)
    .run();

  await registrarAuditoria(c.env.DB, {
    empresaId,
    guiaId: id,
    usuarioId: userId,
    acao: 'DESATIVACAO',
    anterior: { status: 'ATIVO' },
    novo: { status: 'INATIVO' },
  });

  return c.json({ success: true, data: { id, status: 'INATIVO' } });
});

app.get('/guias-instrutor/:id/versoes', requireGuiaInstrutorManage(), async (c) => {
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));

  const row = await loadGuia(c.env.DB, empresaId, id, { anyStatus: true });
  if (!row) return notFound('Guia não encontrado');

  const result = await c.env.DB.prepare(
    `SELECT id, versao, status, html_status_validacao, publicado_em, created_at, updated_at
     FROM simuladores_guias_instrutor_v2
     WHERE empresa_id = ? AND (modelo_aeronave_id IS ? OR modelo_aeronave_id = ?) AND programa = ?
       AND (ciclo IS ? OR ciclo = ?) AND (sessao_numero IS ? OR sessao_numero = ?)
       AND codigo = ? AND deleted_at IS NULL
     ORDER BY created_at DESC`,
  )
    .bind(
      empresaId,
      row.modelo_aeronave_id,
      row.modelo_aeronave_id,
      row.programa,
      row.ciclo,
      row.ciclo,
      row.sessao_numero,
      row.sessao_numero,
      row.codigo,
    )
    .all();

  return c.json({ success: true, data: result.results || [] });
});

app.get('/guias-instrutor/:id/auditoria', requireGuiaInstrutorManage(), async (c) => {
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));

  const row = await loadGuia(c.env.DB, empresaId, id, { anyStatus: true });
  if (!row) return notFound('Guia não encontrado');

  const result = await c.env.DB.prepare(
    `SELECT id, usuario_id, acao, valores_anteriores, valores_novos, created_at
     FROM simuladores_guias_instrutor_auditoria_v2
     WHERE empresa_id = ? AND guia_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(empresaId, id)
    .all();

  return c.json({ success: true, data: result.results || [] });
});

export default app;
