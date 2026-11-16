/**
 * SIMULADORES — Retificação formal de fichas já assinadas (schema V2 0587).
 * Sub-router montado em /api/simuladores via app.route('/', ...)
 *
 *   POST /fichas/:id/retificacoes        solicita (snapshot original + motivo + fundamento + evidência)
 *   GET  /fichas/:id/retificacoes        lista
 *   GET  /retificacoes/:id               detalhe com itens
 *   POST /retificacoes/:id/decisao       APROVAR | REJEITAR por responsável distinto do solicitante
 *   POST /retificacoes/:id/assinar       INSTRUTOR | ALUNO da ficha original (sem bypass de perfil)
 *   POST /retificacoes/:id/cancelar      solicitante ou administrador, antes da conclusão
 *
 * Invariantes: append-only; ficha e manobras originais NUNCA são alteradas; nenhuma nota
 * é inventada (cada item retificado exige valor explícito); NOTECHS não aceita NR; o
 * resultado retificado é recalculado com as mesmas regras de aprovação da ficha (nota
 * mínima 6 por item técnico e por NOTECHS, 15 NOTECHS completos).
 */
import { Hono, type MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { audit } from '../services/simuladores/shared';
import { requireOperationalAccess } from '../middleware/operational-domain-access';
import { evaluateNotechsApproval } from '../constants/notechs-approval';
import { assessRecordedTechnicalScores } from '../constants/recorded-technical-scores';

type Ctx = { get: (k: string) => unknown };

// Rotas /fichas/:id/...: o :id já é a ficha.
const guard = requireOperationalAccess({ domain: 'OPERACOES', action: 'update', resourceType: 'simulador_ficha' });

// Rotas /retificacoes/:id/...: o :id é a RETIFICAÇÃO, não a ficha. A autorização operacional
// (bypass pedagógico e setor) precisa ser aplicada sobre a ficha referenciada, resolvida
// no tenant do token antes do guard. Retificação inexistente/de outro tenant → 404.
const RET_FICHA_KEY = 'retificacaoFichaId';
const resolveRetificacaoFicha: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const get = c.get as (k: string) => unknown;
  const set = c.set as (k: string, v: unknown) => void;
  const row = await c.env.DB
    .prepare(`SELECT ficha_id FROM fichas_sessao_retificacoes WHERE id = ? AND empresa_id = ?`)
    .bind(c.req.param('id'), String(get('empresaId') || ''))
    .first<{ ficha_id: number }>();
  if (!row) return c.json({ success: false, error: 'Não encontrada' }, 404);
  set(RET_FICHA_KEY, Number(row.ficha_id));
  await next();
};
const guardRetificacao = [
  resolveRetificacaoFicha,
  requireOperationalAccess({
    domain: 'OPERACOES',
    action: 'update',
    resourceType: 'simulador_ficha',
    resolveResourceId: (c) => Number((c.get as (k: string) => unknown)(RET_FICHA_KEY)) || null,
  }),
] as const;

const app = new Hono<{ Bindings: Env }>();

const DECIDER_ROLES = ['ADMIN', 'ADMINISTRADOR', 'COMPLIANCE'];
const REQUESTER_ROLES = ['ADMIN', 'ADMINISTRADOR', 'COMPLIANCE', 'GESTOR'];
const SCORE_RE = /^(?:10|[1-9])$/;
const MIN_TEXT = { motivo: 20, fundamento_normativo: 10, evidencia_nova: 10 } as const;

const who = (c: unknown) => {
  const ctx = c as Ctx;
  return {
    userId: String(ctx.get('userId') || ''),
    role: String(ctx.get('userRole') || '').toUpperCase(),
    empresaId: String(ctx.get('empresaId') || ''),
  };
};

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type ManobraRow = {
  id: number; codigo: string | null; categoria: string | null; resultado: string | null;
  ordem: number | null; observacoes: string | null;
};
type FichaRow = {
  id: number; empresa_id: number; status: string | null; resultado_final: string | null;
  aprovado: number | null; instrutor_id: number | string | null; colaborador_id_aluno: number | string | null;
  assinatura_instrutor_timestamp: string | null; assinatura_instrutor: number | null;
  assinatura_aluno_timestamp: string | null; assinatura_tripulante: number | null;
};
type RetRow = {
  id: number; empresa_id: number; ficha_id: number; status: string; solicitante_usuario_id: string;
  decisao_usuario_id: string | null; assinatura_instrutor_usuario_id: string | null;
  assinatura_aluno_usuario_id: string | null; resultado_final_retificado: string | null;
};

async function loadFicha(db: D1Database, id: string, empresaId: string): Promise<FichaRow | null> {
  return db
    .prepare(
      `SELECT id, empresa_id, status, resultado_final, aprovado, instrutor_id, colaborador_id_aluno,
              assinatura_instrutor_timestamp, assinatura_instrutor, assinatura_aluno_timestamp, assinatura_tripulante
         FROM fichas_sessao WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, empresaId)
    .first<FichaRow>();
}

async function loadManobras(db: D1Database, fichaId: number | string): Promise<ManobraRow[]> {
  const r = await db
    .prepare(
      `SELECT id, codigo, categoria, resultado, ordem, observacoes FROM fichas_sessao_manobras
        WHERE ficha_id = ? AND deleted_at IS NULL ORDER BY id`,
    )
    .bind(fichaId)
    .all<ManobraRow>();
  return r.results || [];
}

async function funcionarioDoUsuario(db: D1Database, userId: string, empresaId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT f.id FROM usuarios u JOIN funcionarios f ON f.id = u.funcionario_id
        WHERE u.id = ? AND f.empresa_id = ? AND (u.deleted_at IS NULL OR u.deleted_at = 0) AND f.deleted_at IS NULL LIMIT 1`,
    )
    .bind(userId, empresaId)
    .first<{ id: number | string }>();
  return row ? String(row.id) : null;
}

async function loadRet(db: D1Database, id: string, empresaId: string): Promise<RetRow | null> {
  return db
    .prepare(`SELECT id, empresa_id, ficha_id, status, motivo, fundamento_normativo, evidencia_nova, snapshot_original_sha256, snapshot_original_json, solicitante_usuario_id, decisao_usuario_id, decisao_em, decisao_observacao, assinatura_instrutor_usuario_id, assinatura_instrutor_em, assinatura_instrutor_ip, assinatura_aluno_usuario_id, assinatura_aluno_em, assinatura_aluno_ip, resultado_final_retificado, concluida_em, created_at, updated_at FROM fichas_sessao_retificacoes WHERE id = ? AND empresa_id = ?`)
    .bind(id, empresaId)
    .first<RetRow>();
}

// ── POST /fichas/:id/retificacoes ───────────────────────────────────────────
app.post('/fichas/:id/retificacoes', guard, async (c) => {
  const { userId, role, empresaId } = who(c);
  const fichaId = c.req.param('id');
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return c.json({ success: false, code: 'INVALID_JSON', error: 'Corpo inválido' }, 400);

  const texts: Record<string, string> = {};
  for (const [k, min] of Object.entries(MIN_TEXT)) {
    const v = typeof body[k] === 'string' ? (body[k] as string).trim() : '';
    if (v.length < min) {
      return c.json({ success: false, code: 'RETIFICACAO_CAMPO_OBRIGATORIO', error: `${k} exige ao menos ${min} caracteres` }, 400);
    }
    texts[k] = v;
  }
  const itens = Array.isArray(body.itens) ? (body.itens as Array<Record<string, unknown>>) : [];
  if (itens.length === 0 || itens.length > 60) {
    return c.json({ success: false, code: 'RETIFICACAO_ITENS_INVALIDOS', error: 'Informe de 1 a 60 itens' }, 400);
  }

  const ficha = await loadFicha(c.env.DB, fichaId, empresaId);
  if (!ficha) return c.json({ success: false, error: 'Não encontrada' }, 404);
  if (!(ficha.assinatura_instrutor_timestamp || Number(ficha.assinatura_instrutor) === 1)) {
    return c.json({ success: false, code: 'FICHA_NAO_ASSINADA', error: 'Ficha ainda não assinada: edite-a pelo fluxo normal.' }, 409);
  }
  if (!REQUESTER_ROLES.includes(role)) {
    const func = await funcionarioDoUsuario(c.env.DB, userId, empresaId);
    if (!func || String(ficha.instrutor_id) !== func) {
      return c.json({ success: false, code: 'RETIFICACAO_SOLICITANTE_NAO_AUTORIZADO', error: 'Sem permissão para solicitar retificação desta ficha' }, 403);
    }
  }

  const manobras = await loadManobras(c.env.DB, fichaId);
  const byId = new Map(manobras.map((m) => [String(m.id), m]));
  const seen = new Set<string>();
  const normalized: Array<{ m: ManobraRow; novo: string; obs: string | null }> = [];
  for (const it of itens) {
    const mid = String(it.ficha_manobra_id ?? '');
    const m = byId.get(mid);
    if (!m) return c.json({ success: false, code: 'RETIFICACAO_ITEM_DE_OUTRA_FICHA', error: `Item ${mid} não pertence à ficha` }, 400);
    if (seen.has(mid)) return c.json({ success: false, code: 'RETIFICACAO_ITEM_DUPLICADO', error: `Item ${mid} repetido` }, 400);
    seen.add(mid);
    const novo = String(it.resultado_retificado ?? '').trim().toUpperCase();
    const isNotechs = String(m.categoria || '').toUpperCase() === 'NOTECHS';
    const valid = SCORE_RE.test(novo) || (!isNotechs && novo === 'NR');
    if (!valid) {
      return c.json({ success: false, code: 'RETIFICACAO_NOTA_INVALIDA',
        error: isNotechs ? 'NOTECHS exige nota inteira de 1 a 10 (NR não é admitido)' : 'Nota deve ser inteira de 1 a 10 ou NR' }, 400);
    }
    if (novo === String(m.resultado ?? '').trim().toUpperCase()) {
      return c.json({ success: false, code: 'RETIFICACAO_SEM_MUDANCA', error: `Item ${mid} não altera o valor original` }, 400);
    }
    const obs = typeof it.observacao === 'string' && it.observacao.trim() ? it.observacao.trim().slice(0, 1000) : null;
    normalized.push({ m, novo, obs });
  }

  const snapshot = JSON.stringify({
    ficha: { id: ficha.id, status: ficha.status, resultado_final: ficha.resultado_final, aprovado: ficha.aprovado },
    manobras: manobras.map((m) => ({ id: m.id, codigo: m.codigo, categoria: m.categoria, resultado: m.resultado, ordem: m.ordem })),
  });
  const snapshotSha = await sha256Hex(snapshot);

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO fichas_sessao_retificacoes
           (empresa_id, ficha_id, motivo, fundamento_normativo, evidencia_nova,
            snapshot_original_sha256, snapshot_original_json, solicitante_usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(empresaId, ficha.id, texts.motivo, texts.fundamento_normativo, texts.evidencia_nova, snapshotSha, snapshot, userId),
      ...normalized.map(({ m, novo, obs }) =>
        c.env.DB.prepare(
          `INSERT INTO fichas_sessao_retificacoes_itens
             (retificacao_id, empresa_id, ficha_manobra_id, codigo, categoria, resultado_original, resultado_retificado, observacao)
           VALUES ((SELECT id FROM fichas_sessao_retificacoes WHERE ficha_id = ? AND status = 'SOLICITADA'), ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(ficha.id, empresaId, m.id, m.codigo, m.categoria, m.resultado, novo, obs),
      ),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE|uq_fichas_retificacoes_aberta/i.test(msg)) {
      return c.json({ success: false, code: 'RETIFICACAO_JA_EM_ANDAMENTO', error: 'Já existe retificação em andamento para esta ficha' }, 409);
    }
    throw err;
  }
  const created = await c.env.DB
    .prepare(`SELECT id, status FROM fichas_sessao_retificacoes WHERE ficha_id = ? AND status = 'SOLICITADA'`)
    .bind(ficha.id).first<{ id: number; status: string }>();
  await audit(c.env.DB, { tabela: 'fichas_sessao_retificacoes', acao: 'RETIFICACAO_SOLICITADA', registro_id: created?.id, dados_novos: { ficha_id: ficha.id, itens: normalized.length, snapshot_sha256: snapshotSha, usuario_id: userId } });
  return c.json({ success: true, data: { id: created?.id, status: 'SOLICITADA', snapshot_original_sha256: snapshotSha } }, 201);
});

// ── GET ─────────────────────────────────────────────────────────────────────
app.get('/fichas/:id/retificacoes', guard, async (c) => {
  const { empresaId } = who(c);
  const r = await c.env.DB
    .prepare(
      `SELECT id, ficha_id, status, motivo, fundamento_normativo, snapshot_original_sha256, solicitante_usuario_id,
              decisao_usuario_id, decisao_em, resultado_final_retificado, concluida_em, created_at
         FROM fichas_sessao_retificacoes WHERE ficha_id = ? AND empresa_id = ? ORDER BY id DESC`,
    )
    .bind(c.req.param('id'), empresaId).all();
  return c.json({ success: true, data: r.results || [] });
});

app.get('/retificacoes/:id', ...guardRetificacao, async (c) => {
  const { empresaId } = who(c);
  const ret = await c.env.DB
    .prepare(`SELECT id, empresa_id, ficha_id, status, motivo, fundamento_normativo, evidencia_nova, snapshot_original_sha256, snapshot_original_json, solicitante_usuario_id, decisao_usuario_id, decisao_em, decisao_observacao, assinatura_instrutor_usuario_id, assinatura_instrutor_em, assinatura_instrutor_ip, assinatura_aluno_usuario_id, assinatura_aluno_em, assinatura_aluno_ip, resultado_final_retificado, concluida_em, created_at, updated_at FROM fichas_sessao_retificacoes WHERE id = ? AND empresa_id = ?`)
    .bind(c.req.param('id'), empresaId).first();
  if (!ret) return c.json({ success: false, error: 'Não encontrada' }, 404);
  const itens = await c.env.DB
    .prepare(`SELECT id, retificacao_id, empresa_id, ficha_manobra_id, codigo, categoria, resultado_original, resultado_retificado, observacao, created_at FROM fichas_sessao_retificacoes_itens WHERE retificacao_id = ? AND empresa_id = ? ORDER BY id`)
    .bind(c.req.param('id'), empresaId).all();
  return c.json({ success: true, data: { ...ret, itens: itens.results || [] } });
});

// ── POST /retificacoes/:id/decisao ──────────────────────────────────────────
app.post('/retificacoes/:id/decisao', ...guardRetificacao, async (c) => {
  const { userId, role, empresaId } = who(c);
  if (!DECIDER_ROLES.includes(role)) {
    return c.json({ success: false, code: 'RETIFICACAO_DECISOR_NAO_AUTORIZADO', error: 'Apenas ADMIN/COMPLIANCE decidem retificações' }, 403);
  }
  const b = await c.req.json().catch(() => ({})) as { decisao?: string; observacao?: string };
  if (b.decisao !== 'APROVAR' && b.decisao !== 'REJEITAR') {
    return c.json({ success: false, error: 'decisao: APROVAR ou REJEITAR' }, 400);
  }
  const obs = (b.observacao || '').trim();
  if (obs.length < 10) return c.json({ success: false, code: 'RETIFICACAO_CAMPO_OBRIGATORIO', error: 'observacao exige ao menos 10 caracteres' }, 400);
  const ret = await loadRet(c.env.DB, c.req.param('id'), empresaId);
  if (!ret) return c.json({ success: false, error: 'Não encontrada' }, 404);
  if (ret.status !== 'SOLICITADA') return c.json({ success: false, code: 'RETIFICACAO_ESTADO_INVALIDO', error: `Estado ${ret.status}` }, 409);
  if (ret.solicitante_usuario_id === userId) {
    return c.json({ success: false, code: 'RETIFICACAO_DECISOR_IGUAL_SOLICITANTE', error: 'O decisor deve ser distinto do solicitante' }, 403);
  }
  const novo = b.decisao === 'APROVAR' ? 'APROVADA' : 'REJEITADA';
  const w = await c.env.DB
    .prepare(
      `UPDATE fichas_sessao_retificacoes SET status = ?, decisao_usuario_id = ?, decisao_em = ?, decisao_observacao = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND empresa_id = ? AND status = 'SOLICITADA'`,
    )
    .bind(novo, userId, new Date().toISOString(), obs, ret.id, empresaId).run();
  if (Number(w.meta?.changes ?? 0) !== 1) return c.json({ success: false, code: 'RETIFICACAO_CONFLITO', error: 'Estado mudou' }, 409);
  await audit(c.env.DB, { tabela: 'fichas_sessao_retificacoes', acao: `RETIFICACAO_${novo}`, registro_id: ret.id, dados_novos: { usuario_id: userId } });
  return c.json({ success: true, data: { id: ret.id, status: novo } });
});

// ── POST /retificacoes/:id/assinar ──────────────────────────────────────────
app.post('/retificacoes/:id/assinar', ...guardRetificacao, async (c) => {
  const { userId, empresaId } = who(c);
  const b = await c.req.json().catch(() => ({})) as { tipo?: string };
  if (b.tipo !== 'INSTRUTOR' && b.tipo !== 'ALUNO') return c.json({ success: false, error: 'tipo: INSTRUTOR ou ALUNO' }, 400);
  const ret = await loadRet(c.env.DB, c.req.param('id'), empresaId);
  if (!ret) return c.json({ success: false, error: 'Não encontrada' }, 404);
  if (ret.status !== 'APROVADA') return c.json({ success: false, code: 'RETIFICACAO_ESTADO_INVALIDO', error: `Estado ${ret.status}: assinatura só após decisão APROVADA` }, 409);

  const ficha = await loadFicha(c.env.DB, String(ret.ficha_id), empresaId);
  if (!ficha) return c.json({ success: false, error: 'Ficha não encontrada' }, 404);
  const func = await funcionarioDoUsuario(c.env.DB, userId, empresaId);
  const esperado = b.tipo === 'INSTRUTOR' ? ficha.instrutor_id : ficha.colaborador_id_aluno;
  // Sem bypass por perfil: a assinatura é pessoal.
  if (!func || esperado == null || String(esperado) !== func) {
    return c.json({ success: false, code: 'RETIFICACAO_ASSINANTE_INVALIDO',
      error: b.tipo === 'INSTRUTOR' ? 'Apenas o instrutor da ficha pode assinar' : 'Apenas o aluno avaliado pode assinar' }, 403);
  }
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const ts = new Date().toISOString();
  const sql = b.tipo === 'INSTRUTOR'
    ? `UPDATE fichas_sessao_retificacoes SET assinatura_instrutor_usuario_id = ?, assinatura_instrutor_em = ?, assinatura_instrutor_ip = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND empresa_id = ? AND status = 'APROVADA' AND assinatura_instrutor_usuario_id IS NULL`
    : `UPDATE fichas_sessao_retificacoes SET assinatura_aluno_usuario_id = ?, assinatura_aluno_em = ?, assinatura_aluno_ip = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND empresa_id = ? AND status = 'APROVADA' AND assinatura_aluno_usuario_id IS NULL`;

  // O resultado depende só das manobras originais e dos itens retificados (imutáveis), não das
  // assinaturas: calcula antes e persiste assinatura + conclusão num único batch (transação D1).
  // Assim nunca fica uma retificação APROVADA com as duas assinaturas e sem conclusão, e duas
  // assinaturas concorrentes convergem (o UPDATE de conclusão só casa com as duas presentes).
  const originais = await loadManobras(c.env.DB, ret.ficha_id);
  const ov = await c.env.DB
    .prepare(`SELECT ficha_manobra_id, resultado_retificado FROM fichas_sessao_retificacoes_itens WHERE retificacao_id = ? AND empresa_id = ?`)
    .bind(ret.id, empresaId).all<{ ficha_manobra_id: number; resultado_retificado: string }>();
  const map = new Map((ov.results || []).map((r) => [String(r.ficha_manobra_id), r.resultado_retificado]));
  const efetivas = originais.map((m) => ({ ...m, resultado: map.get(String(m.id)) ?? m.resultado }));
  const calculado = assessRecordedTechnicalScores(efetivas).eligible && evaluateNotechsApproval(efetivas).eligible
    ? 'APROVADO' : 'REPROVADO';

  const [sig, fin] = await c.env.DB.batch([
    c.env.DB.prepare(sql).bind(userId, ts, ip, ret.id, empresaId),
    c.env.DB
      .prepare(
        `UPDATE fichas_sessao_retificacoes SET status = 'CONCLUIDA', resultado_final_retificado = ?, concluida_em = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND empresa_id = ? AND status = 'APROVADA'
            AND assinatura_instrutor_usuario_id IS NOT NULL AND assinatura_aluno_usuario_id IS NOT NULL`,
      )
      .bind(calculado, ts, ret.id, empresaId),
  ]);
  if (Number(sig.meta?.changes ?? 0) !== 1) return c.json({ success: false, code: 'RETIFICACAO_JA_ASSINADA', error: 'Assinatura já registrada' }, 409);
  const concluida = Number(fin.meta?.changes ?? 0) === 1;
  const resultado = concluida ? calculado : null;
  await audit(c.env.DB, { tabela: 'fichas_sessao_retificacoes', acao: `RETIFICACAO_ASSINADA_${b.tipo}`, registro_id: ret.id, dados_novos: { usuario_id: userId, concluida, resultado } });
  return c.json({ success: true, data: { id: ret.id, status: concluida ? 'CONCLUIDA' : 'APROVADA', resultado_final_retificado: resultado } });
});

// ── POST /retificacoes/:id/cancelar ─────────────────────────────────────────
app.post('/retificacoes/:id/cancelar', ...guardRetificacao, async (c) => {
  const { userId, role, empresaId } = who(c);
  const ret = await loadRet(c.env.DB, c.req.param('id'), empresaId);
  if (!ret) return c.json({ success: false, error: 'Não encontrada' }, 404);
  if (!(ret.solicitante_usuario_id === userId || DECIDER_ROLES.includes(role))) {
    return c.json({ success: false, error: 'Sem permissão para cancelar' }, 403);
  }
  if (ret.status !== 'SOLICITADA' && ret.status !== 'APROVADA') {
    return c.json({ success: false, code: 'RETIFICACAO_ESTADO_INVALIDO', error: `Estado ${ret.status}` }, 409);
  }
  const w = await c.env.DB
    .prepare(`UPDATE fichas_sessao_retificacoes SET status = 'CANCELADA', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND empresa_id = ? AND status IN ('SOLICITADA','APROVADA')`)
    .bind(ret.id, empresaId).run();
  if (Number(w.meta?.changes ?? 0) !== 1) return c.json({ success: false, code: 'RETIFICACAO_CONFLITO', error: 'Estado mudou' }, 409);
  await audit(c.env.DB, { tabela: 'fichas_sessao_retificacoes', acao: 'RETIFICACAO_CANCELADA', registro_id: ret.id, dados_novos: { usuario_id: userId } });
  return c.json({ success: true, data: { id: ret.id, status: 'CANCELADA' } });
});

export default app;
