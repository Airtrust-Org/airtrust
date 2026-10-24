/**
 * Individual simulator checks — per fiche and employee.
 * Contract: Schema V2 0554 is present BEFORE enabling this draft runtime.
 * No legacy session-wide result is treated as individual approval.
 */
import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { hasSchemaTable, getSchemaTriggerNames } from '../utils/db-schema';
import { getTenantContext } from '../middleware/tenant';
import { requireOperationalAccess } from '../services/operational-domain-access';
import { gerarQualificacaoDaFicha } from './simuladores-fichas-helpers';
import { normalizeValidityMonths, calculateQualificationExpiry } from '../services/qualification-history-atomic';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use('*', auth());

type FichaCheckScope = {
  ficha_id: number;
  funcionario_id: number;
  instrutor_id: number | null;
  examinador_id: number | null;
  sessao_id: number;
  aprovado: number | null;
  status: string;
  assinatura_aluno_timestamp: string | null;
  assinatura_instrutor_timestamp: string | null;
  data_sessao: string | null;
};
type EvidenceRow = {
  id: number;
  aprovado: number | null;
  estado: string;
  observacoes: string | null;
  avaliador_funcionario_id: number;
  revisao_numero: number;
  revisao_de_id: number | null;
};

function positiveId(value: unknown): number | null {
  const id = typeof value === 'string' && value.trim() ? Number(value) : value;
  return Number.isSafeInteger(id) && Number(id) > 0 ? Number(id) : null;
}
const REQUIRED_CHECK_TRIGGERS = [
  'trg_checks_individuais_scope_insert',
  'trg_checks_individuais_immutable_scope',
  'trg_checks_individuais_confirm_insert',
  'trg_checks_individuais_confirm_update',
  'trg_checks_individuais_annulled_immutable',
  'trg_checks_individuais_confirmed_immutable',
  'trg_checks_individuais_delete_guard',
] as const;

async function schemaReady(db: D1Database): Promise<boolean> {
  // Shared schema metadata cache is scoped to the D1 binding. Never rely on
  // table name alone: six physical tenant/signature/immutability guards plus
  // the exact governed ledger entry must be present in this same database.
  try {
    if (!(await hasSchemaTable(db, 'sessoes_checks_resultados_individuais'))) return false;
    const triggers = await getSchemaTriggerNames(db, 'sessoes_checks_resultados_individuais');
    if (!REQUIRED_CHECK_TRIGGERS.every((name) => triggers.has(name))) return false;
    // Both reviewed schema changes are mandatory before any check evidence
    // API is available. A table with only 0554 lacks physical DELETE safety.
    const applied = await db.prepare(
      "SELECT COUNT(DISTINCT change_id) AS total FROM airtrust_schema_changes_v2 " +
      "WHERE baseline_id=? AND " +
      "((change_id=? AND file_hash=? AND plan_hash=?) OR " +
      "(change_id=? AND file_hash=? AND plan_hash=?))",
    ).bind('production-d1-baseline-v2-20260714',
      'simulator-individual-check-evidence-0554',
      'bcbdcf8bd78c3a3d6393624e62ae70e691190e3ae2d35c0951c0bc56470b4bf5',
      '47b79c542348749d865425a5487f72689444f30553187778f51366b89bbcd0b6',
      'simulator-individual-check-delete-guard-0560',
      '5fe67c81dda03681d9a73eec4cc51989bd92270e4eca6b41b1eb1028b58b9e56',
      'b00948f0821692fb322cd18dc795769d8f03b057db7af9c9b729747d9d2b1463')
      .first<{ total: number }>();
    return Number(applied?.total) === 2;
  } catch {
    return false;
  }
}
async function fichaScope(db: D1Database, empresaId: number, id: number): Promise<FichaCheckScope | null> {
  return db.prepare(`
    SELECT fs.id AS ficha_id, fs.colaborador_id_aluno AS funcionario_id,
           fs.instrutor_id, sa.examinador_id, sa.id AS sessao_id,
           fs.aprovado, fs.status, COALESCE(fs.data_sessao, sa.data) AS data_sessao,
           fs.assinatura_aluno_timestamp, fs.assinatura_instrutor_timestamp
      FROM fichas_sessao fs
      JOIN simulador_agendamentos sa ON sa.id=fs.agendamento_slot_id
       AND sa.empresa_id=fs.empresa_id AND sa.deleted_at IS NULL
     WHERE fs.id=? AND fs.empresa_id=? AND fs.deleted_at IS NULL
  `).bind(id, empresaId).first<FichaCheckScope>();
}
async function actorFuncionario(db: D1Database, empresaId: number, userId: number): Promise<number | null> {
  const row = await db.prepare(`
    SELECT f.id FROM usuarios u JOIN funcionarios f ON f.id=u.funcionario_id
     WHERE u.id=? AND f.empresa_id=? AND f.deleted_at IS NULL
       AND (u.deleted_at IS NULL OR u.deleted_at=0) LIMIT 1
  `).bind(userId, empresaId).first<{ id: number }>();
  return row ? Number(row.id) : null;
}
const privilegedReaders = new Set(['ADMIN', 'ADMINISTRADOR', 'COMPLIANCE', 'GESTOR']);
/**
 * Qualification history is derived only AFTER immutable, confirmed proof exists.
 * A failed downstream refresh is visible as pending and can be retried safely;
 * never roll back the signed evidence or fabricate success.
 */
async function refreshQualification(db: D1Database, fichaId: number, approved: boolean, fichaApproved: boolean) {
  if (!approved || !fichaApproved) {
    if (fichaApproved) {
      await gerarQualificacaoDaFicha(db, fichaId).catch(() => null);
    }
    return { estado:'SEM_APROVACAO_DE_CHECK' };
  }
  try {
    const result = await gerarQualificacaoDaFicha(db, fichaId);
    return {
      estado:'SINCRONIZADA',
      qualificacoes_geradas:result.qualificacoes_geradas,
    };
  } catch {
    return { estado:'PENDENTE_RECONCILIACAO', mensagem:'Evidência confirmada; histórico exige revisão' };
  }
}

const sameEvaluator = (f: FichaCheckScope, id: number | null) =>
  id !== null && (id === Number(f.instrutor_id) || id === Number(f.examinador_id));

/** GET /fichas/:id/checks-individuais
 * A failed, absent, draft or annulled check NEVER appears as approved.
 */
app.get('/fichas/:id/checks-individuais', async (c) => {
  const fid = positiveId(c.req.param('id'));
  if (!fid) return c.json({ success:false, error:'Ficha inválida' }, 400);
  const { empresaId } = getTenantContext(c);
  const userId = positiveId(c.get('userId'));
  if (!userId) return c.json({ success:false, error:'Usuário inválido' }, 403);
  const ficha = await fichaScope(c.env.DB, empresaId, fid);
  if (!ficha) return c.json({ success:false, error:'Ficha não encontrada' }, 404);
  const actor = await actorFuncionario(c.env.DB, empresaId, userId);
  const role = String(c.get('userRole') || '').toUpperCase();
  if (actor !== Number(ficha.funcionario_id) &&
      !sameEvaluator(ficha, actor) && !privilegedReaders.has(role)) {
    return c.json({ success:false, error:'Acesso negado' }, 403);
  }
  if (!(await schemaReady(c.env.DB))) return c.json({
    success:false, code:'SCHEMA_0554_PENDING', error:'Evidência individual indisponível neste ambiente',
  }, 503);
  const rows = await c.env.DB.prepare(`
    SELECT sc.id AS sessao_check_id, sc.qualificacao_tipo_id, qt.codigo, qt.nome, qt.validade,
           ri.id AS evidencia_id, ri.aprovado, ri.estado, ri.observacoes,
           ri.registrado_em, ri.confirmado_em, ri.avaliador_funcionario_id,
           ri.revisao_numero, ri.revisao_de_id
    FROM sessoes_checks sc
    JOIN qualificacoes_tipos qt ON qt.id=sc.qualificacao_tipo_id
       AND qt.empresa_id=? AND qt.deleted_at IS NULL AND qt.ativo=1
    LEFT JOIN sessoes_checks_resultados_individuais ri
      ON ri.sessao_check_id=sc.id AND ri.ficha_id=? AND ri.funcionario_id=?
      AND ri.empresa_id=? AND ri.deleted_at IS NULL AND ri.estado<>'ANULADO'
    WHERE sc.sessao_id=? AND sc.deleted_at IS NULL
    ORDER BY qt.codigo, sc.id
  `).bind(empresaId, fid, ficha.funcionario_id, empresaId, ficha.sessao_id).all();
  return c.json({
    success:true, data:(rows.results || []).map((row: Record<string, unknown>) => {
      const approved = row.estado === 'CONFIRMADO' && Number(row.aprovado) === 1;
      const completionDate = String(ficha.data_sessao || '').slice(0, 10);
      const expiration = approved && /^\d{4}-\d{2}-\d{2}$/.test(completionDate)
        ? calculateQualificationExpiry({
            completionDate,
            validityMonths:normalizeValidityMonths(row.validade as number | string | null),
          })
        : null;
      return {
        ...row, aprovado_comprovado:approved,
        situacao: row.estado === 'CONFIRMADO'
          ? (approved ? 'APROVADO' : 'REPROVADO') : 'PENDENTE_AVALIACAO',
        data_conclusao:approved ? completionDate : null,
        data_vencimento:expiration,
      };
    }),
  });
});

/** POST /fichas/:id/checks-individuais
 * Only a linked authenticated instructor/examiner may confirm an individual
 * check on a separately signed fiche. Audit is in the same D1 batch.
 */
app.post(
  '/fichas/:id/checks-individuais',
  requireOperationalAccess({ domain:'OPERACOES', action:'complete', resourceType:'simulador_ficha' }),
  async (c) => {
    const fid = positiveId(c.req.param('id'));
    const userId = positiveId(c.get('userId'));
    if (!fid || !userId) return c.json({ success:false, error:'Identificador inválido' }, 400);
    const { empresaId } = getTenantContext(c);
    const ficha = await fichaScope(c.env.DB, empresaId, fid);
    if (!ficha) return c.json({ success:false, error:'Ficha não encontrada' }, 404);
    const actor = await actorFuncionario(c.env.DB, empresaId, userId);
    if (!sameEvaluator(ficha, actor)) {
      return c.json({ success:false, error:'Somente o instrutor/examinador vinculado pode confirmar' }, 403);
    }
    if (!ficha.assinatura_aluno_timestamp || !ficha.assinatura_instrutor_timestamp ||
        !['APROVADO', 'NAO_APROVADO', 'CONCLUIDA'].includes(ficha.status) ||
        ficha.aprovado === null || ![0, 1].includes(Number(ficha.aprovado))) {
      return c.json({ success:false, code:'FICHA_INDIVIDUAL_NAO_ASSINADA', error:'A ficha individual precisa estar assinada e finalizada' }, 409);
    }
    const body: unknown = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ success:false, error:'Payload inválido' }, 400);
    }
    const data = body as Record<string, unknown>;
    const checkId = positiveId(data.sessao_check_id);
    const approved = data.aprovado;
    const obs = data.observacoes == null ? '' : data.observacoes;
    const revisionId = data.revisao_de_id == null ? null : positiveId(data.revisao_de_id);
    if (!checkId || typeof approved !== 'boolean' || typeof obs !== 'string' ||
        obs.length > 2000 || (data.revisao_de_id != null && !revisionId)) {
      return c.json({ success:false, error:'Resultado individual inválido' }, 400);
    }
    if (!(await schemaReady(c.env.DB))) return c.json({
      success:false, code:'SCHEMA_0554_PENDING', error:'Schema V2 0554 não aplicado',
    }, 503);
    const check = await c.env.DB.prepare(`
      SELECT sc.id, sc.qualificacao_tipo_id
      FROM sessoes_checks sc
      JOIN qualificacoes_tipos qt ON qt.id=sc.qualificacao_tipo_id
        AND qt.empresa_id=? AND qt.deleted_at IS NULL AND qt.ativo=1
      WHERE sc.id=? AND sc.sessao_id=? AND sc.deleted_at IS NULL
    `).bind(empresaId, checkId, ficha.sessao_id)
      .first<{ id: number; qualificacao_tipo_id: number }>();
    if (!check) return c.json({ success:false, error:'Check não pertence à ficha' }, 404);

    const existing = await c.env.DB.prepare(`
      SELECT id, aprovado, estado, observacoes, avaliador_funcionario_id, revisao_numero, revisao_de_id
      FROM sessoes_checks_resultados_individuais
      WHERE empresa_id=? AND ficha_id=? AND sessao_check_id=?
        AND deleted_at IS NULL AND estado<>'ANULADO' LIMIT 1
    `).bind(empresaId, fid, checkId).first<EvidenceRow>();
    if (existing) {
      if (existing.estado === 'CONFIRMADO' &&
          existing.aprovado === Number(approved) &&
          (existing.observacoes || '') === obs && existing.avaliador_funcionario_id === actor &&
          (existing.revisao_de_id === revisionId)) {
        const qualificacao = await refreshQualification(c.env.DB, fid,
          approved, Number(ficha.aprovado) === 1);
        return c.json({ success:true, data:{ id:existing.id, idempotente:true, estado:'CONFIRMADO' }, qualificacao });
      }
      return c.json({ success:false, code:'CHECK_INDIVIDUAL_JA_REGISTRADO', error:'Evidência existente e imutável' }, 409);
    }
    let revision = 1;
    if (revisionId !== null) {
      const prior = await c.env.DB.prepare(`
        SELECT e.revisao_numero FROM sessoes_checks_resultados_individuais e
        JOIN sessoes_checks sc ON sc.id=e.sessao_check_id
        WHERE e.id=? AND e.empresa_id=? AND e.funcionario_id=?
          AND e.ficha_id<>? AND sc.qualificacao_tipo_id=?
          AND e.estado IN ('CONFIRMADO','ANULADO')
      `).bind(revisionId, empresaId, ficha.funcionario_id, fid, check.qualificacao_tipo_id)
        .first<{ revisao_numero: number }>();
      if (!prior) return c.json({ success:false, error:'Revisão incompatível com funcionário e qualificação' }, 409);
      revision = Number(prior.revisao_numero) + 1;
    }

    const payload = {
      empresa_id:empresaId, ficha_id:fid, sessao_check_id:checkId,
      funcionario_id:ficha.funcionario_id, avaliador_funcionario_id:actor,
      aprovado:approved, confirmado_por_usuario_id:userId,
      revisao_numero:revision, revisao_de_id:revisionId,
      origem:'FICHA_SIMULADOR_CHECK_INDIVIDUAL',
    };
    // Both statements execute atomically; an audit failure aborts evidence.
    // The trigger independently revalidates tenant, check and individual signatures.
    try {
      const result = await c.env.DB.batch([
        c.env.DB.prepare(`
          INSERT INTO sessoes_checks_resultados_individuais
            (empresa_id,ficha_id,sessao_check_id,funcionario_id,avaliador_funcionario_id,
             aprovado,estado,observacoes,revisao_numero,revisao_de_id,confirmado_em,confirmado_por_usuario_id)
          VALUES (?,?,?,?,?,?,'CONFIRMADO',?,?,?,datetime('now'),?)
        `).bind(empresaId, fid, checkId, ficha.funcionario_id, actor,
          approved ? 1 : 0, obs || null, revision, revisionId, userId),
        c.env.DB.prepare(`
          INSERT INTO auditoria_avancada_v2(tabela,acao,registro_id,dados_anteriores,dados_novos)
          VALUES ('sessoes_checks_resultados_individuais','INSERT',?,NULL,?)
        `).bind(`${fid}:${checkId}`, JSON.stringify(payload)),
      ]);
      if (result.length !== 2 || result.some((r) => !r.success || Number(r.meta.changes) !== 1)) {
        throw new Error('INDIVIDUAL_CHECK_TRANSACTION_FAILED');
      }
    } catch {
      return c.json({ success:false, code:'INDIVIDUAL_CHECK_WRITE_REJECTED',
        error:'Evidência não registrada: confira assinatura, revisão e unicidade' }, 409);
    }
    const written = await c.env.DB.prepare(`
      SELECT id, estado, aprovado, confirmado_em, revisao_numero
      FROM sessoes_checks_resultados_individuais
      WHERE empresa_id=? AND ficha_id=? AND sessao_check_id=?
        AND estado='CONFIRMADO' AND deleted_at IS NULL
    `).bind(empresaId, fid, checkId).first();
    const qualificacao = await refreshQualification(c.env.DB, fid,
      approved, Number(ficha.aprovado) === 1);
    return c.json({ success:true, data:written, qualificacao }, 201);
  },
);

export default app;
