/**
 * Closed incident executor: reconciliation of legacy EAD format residues for
 * Costa do Sol (empresa 6). It is deliberately not a generic SQL endpoint.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';

const ALLOWED_EMPRESA_ID = 6;
const CANONICAL_CATEGORY_ID = 13;
const CANONICAL_COLOR = '#EABA0C';
const ROMULO_HISTORY_IDS = [5305, 5307, 5308, 5321, 5323, 5373, 5374, 5375, 5440];
const APPLY_CONFIRMATION = 'APPLY_EAD_CATEGORY_RECONCILIATION';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth(), requireRole('admin'));

class ExecutorError extends Error {}
function fail(message: string): never {
  throw new ExecutorError(message);
}

type Row = Record<string, unknown>;
type Operation = {
  table:
    'qualificacoes_categorias' | 'qualificacoes_tipos' | 'qualificacoes_historico' | 'lms_cursos';
  id: string | number;
  before: Row;
  after: Row;
  reason: string;
};
type Plan = {
  empresa_id: number;
  migration_0450: { rollback_table_exists: boolean; rollback_rows: number };
  canonical_category: Row;
  legacy_ead_format_ids: number[];
  operations: Operation[];
  ambiguous_ids: number[];
  romulo_history_ids: number[];
  total_operations: number;
  plan_sha256: string;
};

function requireEnabled(env: Env) {
  if (env.ENABLE_EAD_CATEGORY_RECONCILIATION_EXECUTOR !== 'true')
    fail('Executor EAD encerrado ou desabilitado');
}
function requireTenant(empresaId: number) {
  if (empresaId !== ALLOWED_EMPRESA_ID) fail('Executor autorizado somente para empresa 6');
}
function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(obj[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
function version(env: Env) {
  return String(env.CF_VERSION_METADATA?.id || env.CF_DEPLOYMENT_ID || 'unknown');
}
function sourceSha(env: Env) {
  return String(env.AIRTRUST_SOURCE_SHA || 'unknown');
}
function equal(a: unknown, b: unknown) {
  return (a ?? null) === (b ?? null);
}

async function assertSchema(db: D1Database) {
  const tables = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('qualificacoes_category_only_0450_rollback','ead_category_reconciliation_runs')",
    )
    .all<{ name: string }>();
  const names = new Set((tables.results || []).map((row) => row.name));
  if (!names.has('ead_category_reconciliation_runs')) fail('migration 0453 não aplicada');
  return names.has('qualificacoes_category_only_0450_rollback');
}

async function computePlan(db: D1Database): Promise<Plan> {
  const rollbackTableExists = await assertSchema(db);
  const rollbackRows = rollbackTableExists
    ? Number(
        (
          await db
            .prepare(
              'SELECT COUNT(*) AS count FROM qualificacoes_category_only_0450_rollback WHERE empresa_id=?',
            )
            .bind(ALLOWED_EMPRESA_ID)
            .first<{ count: number }>()
        )?.count || 0,
      )
    : 0;
  const categories =
    (
      await db
        .prepare(
          `SELECT id,nome,cor,ativo,deleted_at FROM qualificacoes_categorias WHERE empresa_id=? AND UPPER(TRIM(nome))='EAD' ORDER BY id`,
        )
        .bind(ALLOWED_EMPRESA_ID)
        .all<Row>()
    ).results || [];
  const canonical = categories.find((row) => Number(row.id) === CANONICAL_CATEGORY_ID);
  if (!canonical || canonical.deleted_at != null)
    fail('Categoria EAD canônica id=13 ausente ou removida');
  const canonicalCategory: Row = canonical!;
  if (
    categories.some(
      (row) =>
        Number(row.id) !== CANONICAL_CATEGORY_ID &&
        Number(row.ativo) === 1 &&
        row.deleted_at == null,
    )
  )
    fail('Há categoria EAD ativa duplicada');

  const formats =
    (
      await db
        .prepare(
          `SELECT id FROM qualificacoes_formatos WHERE empresa_id=? AND deleted_at IS NULL AND UPPER(TRIM(codigo))='EAD'`,
        )
        .bind(ALLOWED_EMPRESA_ID)
        .all<{ id: number }>()
    ).results || [];
  const formatIds = formats.map((row) => Number(row.id));
  const operations: Operation[] = [];
  if (
    Number(canonicalCategory.ativo) !== 1 ||
    String(canonicalCategory.cor || '').toUpperCase() !== CANONICAL_COLOR
  ) {
    operations.push({
      table: 'qualificacoes_categorias',
      id: CANONICAL_CATEGORY_ID,
      before: canonicalCategory,
      after: { ativo: 1, cor: CANONICAL_COLOR },
      reason: 'canonical EAD category',
    });
  }

  const tipos =
    (
      await db
        .prepare(
          `SELECT qt.id,qt.categoria_id,qt.categoria,qt.formato_id,qt.deleted_at,
      CASE WHEN UPPER(TRIM(COALESCE(qf.codigo,'')))='EAD' THEN 1 ELSE 0 END AS legacy_format
      FROM qualificacoes_tipos qt LEFT JOIN qualificacoes_formatos qf ON qf.id=qt.formato_id AND qf.empresa_id=qt.empresa_id
      WHERE qt.empresa_id=? AND qt.deleted_at IS NULL AND (UPPER(TRIM(COALESCE(qt.categoria,''))) IN ('EAD','TREINAMENTO EAD') OR UPPER(TRIM(COALESCE(qf.codigo,'')))='EAD') ORDER BY qt.id`,
        )
        .bind(ALLOWED_EMPRESA_ID)
        .all<Row>()
    ).results || [];
  const tipoIds = new Set(tipos.map((row) => String(row.id)));
  for (const row of tipos) {
    if (
      !equal(Number(row.categoria_id), CANONICAL_CATEGORY_ID) ||
      normalize(row.categoria) !== 'EAD' ||
      row.formato_id != null
    ) {
      operations.push({
        table: 'qualificacoes_tipos',
        id: String(row.id),
        before: row,
        after: { categoria_id: CANONICAL_CATEGORY_ID, categoria: 'EAD', formato_id: null },
        reason: 'strict EAD type evidence',
      });
    }
  }

  const histories =
    (
      await db
        .prepare(
          `SELECT qh.id,qh.qualificacao_id,qh.categoria_id,qh.categoria,qh.formato_id,qh.formato_codigo,qh.deleted_at,
      qt.id AS tipo_id, qt.categoria AS tipo_categoria,
      CASE WHEN UPPER(TRIM(COALESCE(qf.codigo,'')))='EAD' THEN 1 ELSE 0 END AS legacy_format
      FROM qualificacoes_historico qh
      LEFT JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id AND qt.deleted_at IS NULL
      LEFT JOIN qualificacoes_formatos qf ON qf.id=qh.formato_id AND qf.empresa_id=qh.empresa_id
      WHERE qh.empresa_id=? AND qh.deleted_at IS NULL AND (
        UPPER(TRIM(COALESCE(qh.categoria,''))) IN ('EAD','TREINAMENTO EAD') OR UPPER(TRIM(COALESCE(qh.formato_codigo,'')))='EAD' OR
        UPPER(TRIM(COALESCE(qf.codigo,'')))='EAD' OR UPPER(TRIM(COALESCE(qt.categoria,''))) IN ('EAD','TREINAMENTO EAD') OR
        UPPER(TRIM(COALESCE((SELECT f.codigo FROM qualificacoes_formatos f WHERE f.id=qt.formato_id AND f.empresa_id=qt.empresa_id),''))='EAD'
      ) ORDER BY qh.id`,
        )
        .bind(ALLOWED_EMPRESA_ID)
        .all<Row>()
    ).results || [];
  const historyIds = new Set(histories.map((row) => Number(row.id)));
  for (const row of histories) {
    if (
      !equal(Number(row.categoria_id), CANONICAL_CATEGORY_ID) ||
      normalize(row.categoria) !== 'EAD'
    ) {
      operations.push({
        table: 'qualificacoes_historico',
        id: Number(row.id),
        before: row,
        after: { categoria_id: CANONICAL_CATEGORY_ID, categoria: 'EAD' },
        reason: 'strict EAD history evidence',
      });
    }
  }

  const courses =
    (
      await db
        .prepare(
          `SELECT c.id,c.qualificacao_tipo_id,c.categoria,c.formato_id,c.gerar_qualificacao_ao_concluir,c.deleted_at,
      qt.categoria AS tipo_categoria, CASE WHEN UPPER(TRIM(COALESCE(qf.codigo,'')))='EAD' THEN 1 ELSE 0 END AS legacy_format
      FROM lms_cursos c LEFT JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id AND qt.deleted_at IS NULL
      LEFT JOIN qualificacoes_formatos qf ON qf.id=c.formato_id AND qf.empresa_id=c.empresa_id
      WHERE c.empresa_id=? AND c.deleted_at IS NULL AND (UPPER(TRIM(COALESCE(c.categoria,''))) IN ('EAD','TREINAMENTO EAD') OR UPPER(TRIM(COALESCE(qt.categoria,''))) IN ('EAD','TREINAMENTO EAD') OR UPPER(TRIM(COALESCE(qf.codigo,'')))='EAD') ORDER BY c.id`,
        )
        .bind(ALLOWED_EMPRESA_ID)
        .all<Row>()
    ).results || [];
  const ambiguousIds = courses
    .filter((row) => !row.qualificacao_tipo_id || !tipoIds.has(String(row.qualificacao_tipo_id)))
    .map((row) => Number(row.id));
  for (const row of courses) {
    if (
      !ambiguousIds.includes(Number(row.id)) &&
      (normalize(row.categoria) !== 'EAD' ||
        row.formato_id != null ||
        Number(row.gerar_qualificacao_ao_concluir) !== 1)
    ) {
      operations.push({
        table: 'lms_cursos',
        id: Number(row.id),
        before: row,
        after: { categoria: 'EAD', formato_id: null, gerar_qualificacao_ao_concluir: 1 },
        reason: 'strict EAD LMS-course evidence',
      });
    }
  }
  if (ROMULO_HISTORY_IDS.some((id) => !historyIds.has(id)))
    fail('Os nove históricos de Rômulo não foram provados como EAD');
  const draft = {
    empresa_id: ALLOWED_EMPRESA_ID,
    migration_0450: { rollback_table_exists: rollbackTableExists, rollback_rows: rollbackRows },
    canonical_category: canonicalCategory,
    legacy_ead_format_ids: formatIds,
    operations,
    ambiguous_ids: ambiguousIds,
    romulo_history_ids: ROMULO_HISTORY_IDS,
    total_operations: operations.length,
  };
  return { ...draft, plan_sha256: await sha256(stable(draft)) };
}

function statement(db: D1Database, op: Operation) {
  if (op.table === 'qualificacoes_categorias')
    return db
      .prepare(
        `UPDATE qualificacoes_categorias SET ativo=?,cor=?,updated_at=datetime('now') WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND ativo IS ? AND cor IS ?`,
      )
      .bind(
        op.after.ativo,
        op.after.cor,
        op.id,
        ALLOWED_EMPRESA_ID,
        op.before.ativo,
        op.before.cor,
      );
  if (op.table === 'qualificacoes_tipos')
    return db
      .prepare(
        `UPDATE qualificacoes_tipos SET categoria_id=?,categoria=?,formato_id=NULL,updated_at=datetime('now') WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND categoria_id IS ? AND categoria IS ? AND formato_id IS ?`,
      )
      .bind(
        op.after.categoria_id,
        op.after.categoria,
        op.id,
        ALLOWED_EMPRESA_ID,
        op.before.categoria_id,
        op.before.categoria,
        op.before.formato_id,
      );
  if (op.table === 'qualificacoes_historico')
    return db
      .prepare(
        `UPDATE qualificacoes_historico SET categoria_id=?,categoria=?,updated_at=datetime('now') WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND categoria_id IS ? AND categoria IS ?`,
      )
      .bind(
        op.after.categoria_id,
        op.after.categoria,
        op.id,
        ALLOWED_EMPRESA_ID,
        op.before.categoria_id,
        op.before.categoria,
      );
  return db
    .prepare(
      `UPDATE lms_cursos SET categoria=?,formato_id=NULL,gerar_qualificacao_ao_concluir=?,updated_at=datetime('now') WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND categoria IS ? AND formato_id IS ? AND gerar_qualificacao_ao_concluir IS ?`,
    )
    .bind(
      op.after.categoria,
      op.after.gerar_qualificacao_ao_concluir,
      op.id,
      ALLOWED_EMPRESA_ID,
      op.before.categoria,
      op.before.formato_id,
      op.before.gerar_qualificacao_ao_concluir,
    );
}

async function storeSnapshot(env: Env, runUuid: string, plan: Plan) {
  if (!env.BUCKET) fail('R2 indisponível; nenhuma escrita D1 será feita');
  const snapshot = {
    version: 1,
    run_uuid: runUuid,
    empresa_id: ALLOWED_EMPRESA_ID,
    plan_sha256: plan.plan_sha256,
    operations: plan.operations,
  };
  const body = stable(snapshot);
  const hash = await sha256(body);
  const key = `incident-evidence/ead-category-reconciliation/${runUuid}.json`;
  await env.BUCKET.put(key, body, { httpMetadata: { contentType: 'application/json' } });
  const read = await env.BUCKET.get(key);
  if (!read || (await sha256(await read.text())) !== hash)
    fail('Snapshot R2 não pôde ser verificado');
  return { key, hash };
}

function publicPlan(plan: Plan) {
  return {
    ...plan,
    operations: plan.operations.map(({ table, id, reason, before, after }) => ({
      table,
      id,
      reason,
      before,
      after,
    })),
  };
}

app.post('/dry-run', async (c) => {
  try {
    requireEnabled(c.env);
    requireTenant(getTenantContext(c).empresaId);
    const plan = await computePlan(c.env.DB);
    if (plan.ambiguous_ids.length) fail('Cursos EAD ambíguos exigem análise antes do apply');
    return c.json({
      success: true,
      mode: 'DRY_RUN',
      source_sha: sourceSha(c.env),
      worker_version: version(c.env),
      plan: publicPlan(plan),
    });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'falha' }, 400);
  }
});

app.post('/apply', async (c) => {
  try {
    requireEnabled(c.env);
    requireTenant(getTenantContext(c).empresaId);
    const body = await c.req.json<{
      run_uuid?: string;
      plan_sha256?: string;
      confirmation?: string;
      expected_source_sha?: string;
      expected_worker_version?: string;
    }>();
    if (!body.run_uuid || !body.plan_sha256 || body.confirmation !== APPLY_CONFIRMATION)
      fail('Confirmação, run_uuid e plan_sha256 são obrigatórios');
    if (
      body.expected_source_sha !== sourceSha(c.env) ||
      body.expected_worker_version !== version(c.env)
    )
      fail('Proveniência do Worker diverge');
    const existing = await c.env.DB.prepare(
      'SELECT run_uuid,status,plan_sha256 FROM ead_category_reconciliation_runs WHERE empresa_id=?',
    )
      .bind(ALLOWED_EMPRESA_ID)
      .first<{ run_uuid: string; status: string; plan_sha256: string }>();
    if (
      existing?.status === 'APPLIED' &&
      existing.run_uuid === body.run_uuid &&
      existing.plan_sha256 === body.plan_sha256
    )
      return c.json({ success: true, idempotent: true, status: 'APPLIED' });
    if (existing) fail('Executor encerrado: já houve apply para empresa 6');
    const plan = await computePlan(c.env.DB);
    if (plan.ambiguous_ids.length || plan.plan_sha256 !== body.plan_sha256)
      fail('Plano divergiu; refaça o dry-run');
    const runUuid = body.run_uuid!;
    const snapshot = await storeSnapshot(c.env, runUuid, plan);
    const run = c.env.DB.prepare(
      `INSERT INTO ead_category_reconciliation_runs (run_uuid,empresa_id,plan_sha256,source_sha,worker_version,snapshot_key,snapshot_sha256,rollback_key,status,totals_json) VALUES (?,?,?,?,?,?,?,?, 'APPLIED',?)`,
    ).bind(
      runUuid,
      ALLOWED_EMPRESA_ID,
      plan.plan_sha256,
      sourceSha(c.env),
      version(c.env),
      snapshot.key,
      snapshot.hash,
      snapshot.key,
      stable({ total_operations: plan.total_operations }),
    );
    await c.env.DB.batch([...plan.operations.map((op) => statement(c.env.DB, op)), run]);
    return c.json({
      success: true,
      mode: 'APPLY',
      run_uuid: body.run_uuid,
      total_operations: plan.total_operations,
      snapshot_sha256: snapshot.hash,
    });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'falha' }, 400);
  }
});

app.post('/verify', async (c) => {
  try {
    requireEnabled(c.env);
    requireTenant(getTenantContext(c).empresaId);
    const plan = await computePlan(c.env.DB);
    if (plan.ambiguous_ids.length) fail('Ambiguidade EAD');
    return c.json({
      success: true,
      mode: 'VERIFY',
      total_operations: plan.total_operations,
      romulo_history_ids: ROMULO_HISTORY_IDS,
      canonical_color: CANONICAL_COLOR,
    });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'falha' }, 400);
  }
});

app.post('/rollback', async (c) => {
  try {
    requireEnabled(c.env);
    requireTenant(getTenantContext(c).empresaId);
    const body = await c.req.json<{
      run_uuid?: string;
      snapshot_sha256?: string;
      confirmation?: string;
    }>();
    if (
      !body.run_uuid ||
      !body.snapshot_sha256 ||
      body.confirmation !== 'ROLLBACK_EAD_CATEGORY_RECONCILIATION'
    )
      fail('Confirmação de rollback inválida');
    const run = await c.env.DB.prepare(
      'SELECT * FROM ead_category_reconciliation_runs WHERE run_uuid=? AND empresa_id=?',
    )
      .bind(body.run_uuid, ALLOWED_EMPRESA_ID)
      .first<Row>();
    if (!run) fail('Run não encontrado');
    const storedRun: Row = run!;
    if (storedRun.status === 'ROLLED_BACK')
      return c.json({ success: true, idempotent: true, status: 'ROLLED_BACK' });
    if (storedRun.snapshot_sha256 !== body.snapshot_sha256 || !c.env.BUCKET)
      fail('Snapshot de rollback inválido');
    const object = await c.env.BUCKET.get(String(storedRun.snapshot_key));
    if (!object) fail('Snapshot não encontrado no R2');
    const text = await object!.text();
    if ((await sha256(text)) !== storedRun.snapshot_sha256) fail('Hash do snapshot diverge');
    const snapshot = JSON.parse(text) as { operations: Operation[] };
    const statements = snapshot.operations.map((op) => {
      if (op.table === 'qualificacoes_categorias')
        return c.env.DB.prepare(
          `UPDATE qualificacoes_categorias SET ativo=?,cor=?,updated_at=datetime('now') WHERE id=? AND empresa_id=? AND ativo IS ? AND cor IS ?`,
        ).bind(
          op.before.ativo,
          op.before.cor,
          op.id,
          ALLOWED_EMPRESA_ID,
          op.after.ativo,
          op.after.cor,
        );
      if (op.table === 'qualificacoes_tipos')
        return c.env.DB.prepare(
          `UPDATE qualificacoes_tipos SET categoria_id=?,categoria=?,formato_id=?,updated_at=datetime('now') WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND categoria_id IS ? AND categoria IS ? AND formato_id IS ?`,
        ).bind(
          op.before.categoria_id,
          op.before.categoria,
          op.before.formato_id,
          op.id,
          ALLOWED_EMPRESA_ID,
          op.after.categoria_id,
          op.after.categoria,
          op.after.formato_id,
        );
      if (op.table === 'qualificacoes_historico')
        return c.env.DB.prepare(
          `UPDATE qualificacoes_historico SET categoria_id=?,categoria=?,updated_at=datetime('now') WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND categoria_id IS ? AND categoria IS ?`,
        ).bind(
          op.before.categoria_id,
          op.before.categoria,
          op.id,
          ALLOWED_EMPRESA_ID,
          op.after.categoria_id,
          op.after.categoria,
        );
      return c.env.DB.prepare(
        `UPDATE lms_cursos SET categoria=?,formato_id=?,gerar_qualificacao_ao_concluir=?,updated_at=datetime('now') WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND categoria IS ? AND formato_id IS ? AND gerar_qualificacao_ao_concluir IS ?`,
      ).bind(
        op.before.categoria,
        op.before.formato_id,
        op.before.gerar_qualificacao_ao_concluir,
        op.id,
        ALLOWED_EMPRESA_ID,
        op.after.categoria,
        op.after.formato_id,
        op.after.gerar_qualificacao_ao_concluir,
      );
    });
    statements.push(
      c.env.DB.prepare(
        `UPDATE ead_category_reconciliation_runs SET status='ROLLED_BACK',rolled_back_at=datetime('now') WHERE run_uuid=? AND empresa_id=? AND status='APPLIED'`,
      ).bind(body.run_uuid, ALLOWED_EMPRESA_ID),
    );
    await c.env.DB.batch(statements);
    return c.json({ success: true, status: 'ROLLED_BACK' });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'falha' }, 400);
  }
});

export default app;
