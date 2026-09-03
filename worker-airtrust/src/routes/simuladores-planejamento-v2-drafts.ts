import { Hono, type Context } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import {
  assertFuncionarioInScope,
  buildFuncionarioScopeWhere,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';
import { validateAndNormalizeCaeAvailability } from '../services/cae-availability';
import { mapPlanningStatusToLegacy, type SimulatorPlanningStatus } from '../services/simulator-future-planning';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

const ORIGIN = 'SIMULADOR_V3_PERSISTED';
const SNAPSHOT_SCHEMA = 'airtrust.simulator.planning.v3.draft.v1';
const MAX_SNAPSHOT_BYTES = 900_000;

type AppContext = Context<{ Bindings: Env }>;
type WorkflowStatus = 'AGUARDANDO_CAE' | 'CAE_RECEBIDA' | 'PLANEJADO' | 'REPLANEJAR';

type SessionNeed = {
  need_id: string;
  employee_id: number;
  qualification_type_id: number;
  expiry_date: string;
  equipment: string;
  [key: string]: unknown;
};

type PairLock = {
  anchor_need_id: string;
  partner_need_id: string;
};

type DraftPayload = {
  vencimento_inicio?: unknown;
  vencimento_fim?: unknown;
  workflow_status?: unknown;
  proposal?: unknown;
  base_needs?: unknown;
  locks?: unknown;
  cae_file_name?: unknown;
  cae_file_key?: unknown;
  cae_document?: unknown;
};

type DraftSnapshot = {
  schema_version: typeof SNAPSHOT_SCHEMA;
  draft_id: string;
  workflow_status: WorkflowStatus;
  vencimento_inicio: string;
  vencimento_fim: string;
  proposal: Record<string, unknown>;
  base_needs: SessionNeed[];
  locks: PairLock[];
  cae_file_name: string | null;
  cae_file_key: string | null;
  cae_document: unknown | null;
  saved_at: string;
};

type DraftRow = {
  id: number;
  planejamento_chave: string;
  planejamento_status: SimulatorPlanningStatus;
  planejamento_snapshot_json: string | null;
  updated_at: string | null;
};

function contextUserId(c: { get: (key: string) => unknown }): number | null {
  const value = Number(c.get('userId') || 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function isIsoDate(value: unknown): value is string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parsed = new Date(`${String(value)}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function workflowStatus(value: unknown): WorkflowStatus | null {
  const normalized = String(value || '').trim().toUpperCase();
  if (
    normalized === 'AGUARDANDO_CAE' ||
    normalized === 'CAE_RECEBIDA' ||
    normalized === 'PLANEJADO' ||
    normalized === 'REPLANEJAR'
  ) {
    return normalized;
  }
  return null;
}

function planningStatusForWorkflow(status: WorkflowStatus): SimulatorPlanningStatus {
  if (status === 'PLANEJADO') return 'PLANEJADO';
  if (status === 'REPLANEJAR') return 'REPLANEJAR';
  return 'AGUARDANDO_DISPONIBILIDADE';
}

function parseSnapshot(value: string | null): DraftSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DraftSnapshot>;
    if (parsed?.schema_version !== SNAPSHOT_SCHEMA || typeof parsed.draft_id !== 'string') return null;
    return parsed as DraftSnapshot;
  } catch {
    return null;
  }
}

function normalizeNeeds(value: unknown): SessionNeed[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const needs: SessionNeed[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const raw = item as Record<string, unknown>;
    const needId = String(raw.need_id || '').trim();
    const employeeId = Number(raw.employee_id);
    const qualificationTypeId = Number(raw.qualification_type_id);
    const expiryDate = String(raw.expiry_date || '').slice(0, 10);
    const equipment = String(raw.equipment || '').trim();
    if (
      !needId ||
      ids.has(needId) ||
      !Number.isInteger(employeeId) ||
      employeeId <= 0 ||
      !Number.isInteger(qualificationTypeId) ||
      qualificationTypeId <= 0 ||
      !isIsoDate(expiryDate) ||
      !equipment
    ) {
      return null;
    }
    ids.add(needId);
    needs.push({ ...raw, need_id: needId, employee_id: employeeId, qualification_type_id: qualificationTypeId, expiry_date: expiryDate, equipment });
  }
  return needs;
}

function normalizeLocks(value: unknown, needIds: Set<string>): PairLock[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const locks: PairLock[] = [];
  const used = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const raw = item as Record<string, unknown>;
    const anchor = String(raw.anchor_need_id || '').trim();
    const partner = String(raw.partner_need_id || '').trim();
    if (!anchor || !partner || anchor === partner || !needIds.has(anchor) || !needIds.has(partner)) return null;
    if (used.has(anchor) || used.has(partner)) return null;
    used.add(anchor);
    used.add(partner);
    locks.push({ anchor_need_id: anchor, partner_need_id: partner });
  }
  return locks;
}

function scheduledDates(proposal: Record<string, unknown>): string[] {
  const dates: string[] = [];
  const classes = Array.isArray(proposal.classes) ? proposal.classes : [];
  for (const trainingClass of classes) {
    if (!trainingClass || typeof trainingClass !== 'object') continue;
    const blocks = Array.isArray((trainingClass as Record<string, unknown>).blocks)
      ? ((trainingClass as Record<string, unknown>).blocks as unknown[])
      : [];
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;
      const slot = (block as Record<string, unknown>).scheduled_slot;
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) continue;
      const date = String((slot as Record<string, unknown>).date || '').slice(0, 10);
      if (isIsoDate(date)) dates.push(date);
    }
  }
  return dates.sort();
}

function classSummary(proposal: Record<string, unknown>): { count: number; names: string[] } {
  const classes = Array.isArray(proposal.classes) ? proposal.classes : [];
  const names = classes
    .map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? String((item as Record<string, unknown>).class_name || '').trim()
        : '',
    )
    .filter(Boolean);
  return { count: classes.length, names };
}

async function schemaReady(db: D1Database): Promise<boolean> {
  const columns = await db
    .prepare("SELECT name FROM pragma_table_info('treinamentos_planejados')")
    .all<{ name: string }>();
  const names = new Set((columns.results || []).map((row) => row.name));
  return (
    names.has('planejamento_status') &&
    names.has('planejamento_origem') &&
    names.has('planejamento_chave') &&
    names.has('planejamento_snapshot_json')
  );
}

async function normalizePayload(c: AppContext, raw: DraftPayload): Promise<{ snapshot: DraftSnapshot; participantIds: number[]; qualificationTypeId: number; equipment: string; referenceExpiry: string; plannedStatus: SimulatorPlanningStatus; legacyStatus: string; totalHours: number | null; dataInicio: string | null; dataFim: string | null; dataPrevista: string } | { error: string }> {
  const inicio = String(raw.vencimento_inicio || '');
  const fim = String(raw.vencimento_fim || '');
  const status = workflowStatus(raw.workflow_status);
  if (!isIsoDate(inicio) || !isIsoDate(fim) || inicio > fim) return { error: 'Intervalo de vencimentos inválido.' };
  if (!status) return { error: 'Status do fluxo de planejamento inválido.' };
  if (!raw.proposal || typeof raw.proposal !== 'object' || Array.isArray(raw.proposal)) return { error: 'Proposta de simulador inválida.' };

  const proposal = raw.proposal as Record<string, unknown>;
  if (!Array.isArray(proposal.classes) || proposal.classes.length === 0) return { error: 'A proposta precisa conter ao menos uma turma.' };
  const needs = normalizeNeeds(raw.base_needs);
  if (!needs) return { error: 'Necessidades de sessão inválidas.' };
  const needIds = new Set(needs.map((need) => need.need_id));
  const locks = normalizeLocks(raw.locks, needIds);
  if (!locks) return { error: 'Ajustes manuais de dupla inválidos.' };

  const empresaId = getTenantContext(c).empresaId;
  const access = await getEmployeeSectorAccess(c, empresaId);
  const participantIds = [...new Set(needs.map((need) => need.employee_id))].sort((a, b) => a - b);
  for (const participantId of participantIds) {
    await assertFuncionarioInScope(c.env.DB, empresaId, participantId, access);
  }

  let caeFileKey = raw.cae_file_key == null ? null : String(raw.cae_file_key).trim();
  if (caeFileKey && !caeFileKey.startsWith(`cae-availability/${empresaId}/`)) {
    return { error: 'Arquivo CAE não pertence ao tenant autenticado.' };
  }
  if (!caeFileKey) caeFileKey = null;

  let caeDocument: unknown | null = null;
  if (raw.cae_document != null) {
    const validation = validateAndNormalizeCaeAvailability(raw.cae_document);
    if (!validation.ok) return { error: 'Documento de disponibilidade CAE inválido.' };
    caeDocument = validation.data;
  }

  const firstNeed = needs[0];
  const expiryDates = needs.map((need) => need.expiry_date).sort();
  const dates = scheduledDates(proposal);
  const classes = Array.isArray(proposal.classes) ? proposal.classes : [];
  let totalMinutes = 0;
  let hasDuration = false;
  for (const trainingClass of classes) {
    if (!trainingClass || typeof trainingClass !== 'object') continue;
    const blocks = Array.isArray((trainingClass as Record<string, unknown>).blocks)
      ? ((trainingClass as Record<string, unknown>).blocks as unknown[])
      : [];
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;
      const minutes = Number((block as Record<string, unknown>).duration_minutes);
      if (Number.isFinite(minutes) && minutes > 0) {
        totalMinutes += minutes;
        hasDuration = true;
      }
    }
  }

  const draftId = crypto.randomUUID();
  const snapshot: DraftSnapshot = {
    schema_version: SNAPSHOT_SCHEMA,
    draft_id: draftId,
    workflow_status: status,
    vencimento_inicio: inicio,
    vencimento_fim: fim,
    proposal,
    base_needs: needs,
    locks,
    cae_file_name: raw.cae_file_name == null ? null : String(raw.cae_file_name).slice(0, 255),
    cae_file_key: caeFileKey,
    cae_document: caeDocument,
    saved_at: new Date().toISOString(),
  };
  const serialized = JSON.stringify(snapshot);
  if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
    return { error: 'A proposta excede o limite seguro de armazenamento.' };
  }

  const plannedStatus = planningStatusForWorkflow(status);
  return {
    snapshot,
    participantIds,
    qualificationTypeId: firstNeed.qualification_type_id,
    equipment: [...new Set(needs.map((need) => need.equipment))].length === 1 ? firstNeed.equipment : 'MULTI',
    referenceExpiry: expiryDates[0],
    plannedStatus,
    legacyStatus: mapPlanningStatusToLegacy(plannedStatus),
    totalHours: hasDuration ? totalMinutes / 60 : null,
    dataInicio: dates[0] || null,
    dataFim: dates.at(-1) || null,
    dataPrevista: dates[0] || expiryDates[0],
  };
}

function snapshotWithDraftId(snapshot: DraftSnapshot, draftId: string): DraftSnapshot {
  return { ...snapshot, draft_id: draftId, saved_at: new Date().toISOString() };
}

function responseFromRow(row: DraftRow, snapshot: DraftSnapshot) {
  const summary = classSummary(snapshot.proposal);
  const proposalSummary =
    snapshot.proposal.summary && typeof snapshot.proposal.summary === 'object' && !Array.isArray(snapshot.proposal.summary)
      ? (snapshot.proposal.summary as Record<string, unknown>)
      : {};
  return {
    id: Number(row.id),
    draft_id: snapshot.draft_id,
    workflow_status: snapshot.workflow_status,
    vencimento_inicio: snapshot.vencimento_inicio,
    vencimento_fim: snapshot.vencimento_fim,
    proposal: snapshot.proposal,
    base_needs: snapshot.base_needs,
    locks: snapshot.locks,
    cae_file_name: snapshot.cae_file_name,
    cae_file_key: snapshot.cae_file_key,
    cae_document: snapshot.cae_document,
    classes: summary.count,
    class_names: summary.names,
    session_requirements: Number(proposalSummary.session_requirements || snapshot.base_needs.length),
    updated_at: row.updated_at,
  };
}

async function findDraftRow(c: AppContext, draftId: string): Promise<DraftRow | null> {
  const empresaId = getTenantContext(c).empresaId;
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scope = buildFuncionarioScopeWhere(access, 'f');
  return c.env.DB
    .prepare(
      `SELECT t.id, t.planejamento_chave, t.planejamento_status, t.planejamento_snapshot_json, t.updated_at
         FROM treinamentos_planejados t
        WHERE t.empresa_id = ?
          AND t.deleted_at IS NULL
          AND t.planejamento_origem = ?
          AND t.planejamento_chave = ?
          AND NOT EXISTS (
            SELECT 1
              FROM treinamentos_participantes tp_scope
              INNER JOIN funcionarios f
                ON f.id = tp_scope.funcionario_id
               AND f.empresa_id = t.empresa_id
               AND f.deleted_at IS NULL
             WHERE tp_scope.treinamento_id = t.id
               AND NOT (${scope.clause})
          )
        LIMIT 1`,
    )
    .bind(empresaId, ORIGIN, `${ORIGIN}:${draftId}`, ...scope.bindings)
    .first<DraftRow>();
}

app.get('/rascunhos', requireRole('admin', 'manager'), async (c) => {
  if (!(await schemaReady(c.env.DB))) {
    return c.json({ success: false, error: 'Estrutura de planejamento persistente indisponível.', code: 'PLANNING_SCHEMA_REQUIRED' }, 503);
  }
  const empresaId = getTenantContext(c).empresaId;
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scope = buildFuncionarioScopeWhere(access, 'f');
  const rows = await c.env.DB
    .prepare(
      `SELECT t.id, t.planejamento_chave, t.planejamento_status, t.planejamento_snapshot_json, t.updated_at
         FROM treinamentos_planejados t
        WHERE t.empresa_id = ?
          AND t.deleted_at IS NULL
          AND t.planejamento_origem = ?
          AND NOT EXISTS (
            SELECT 1
              FROM treinamentos_participantes tp_scope
              INNER JOIN funcionarios f
                ON f.id = tp_scope.funcionario_id
               AND f.empresa_id = t.empresa_id
               AND f.deleted_at IS NULL
             WHERE tp_scope.treinamento_id = t.id
               AND NOT (${scope.clause})
          )
        ORDER BY datetime(t.updated_at) DESC, t.id DESC
        LIMIT 30`,
    )
    .bind(empresaId, ORIGIN, ...scope.bindings)
    .all<DraftRow>();

  const data = (rows.results || [])
    .map((row) => {
      const snapshot = parseSnapshot(row.planejamento_snapshot_json);
      return snapshot ? responseFromRow(row, snapshot) : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map(({ proposal: _proposal, base_needs: _needs, locks: _locks, cae_document: _cae, ...summary }) => summary);
  return c.json({ success: true, data });
});

app.get('/rascunhos/:draftId', requireRole('admin', 'manager'), async (c) => {
  if (!(await schemaReady(c.env.DB))) {
    return c.json({ success: false, error: 'Estrutura de planejamento persistente indisponível.', code: 'PLANNING_SCHEMA_REQUIRED' }, 503);
  }
  const row = await findDraftRow(c, String(c.req.param('draftId') || ''));
  const snapshot = row ? parseSnapshot(row.planejamento_snapshot_json) : null;
  if (!row || !snapshot) return c.json({ success: false, error: 'Planejamento salvo não encontrado.' }, 404);
  return c.json({ success: true, data: responseFromRow(row, snapshot) });
});

app.post('/rascunhos', requireRole('admin', 'manager'), async (c) => {
  if (!(await schemaReady(c.env.DB))) {
    return c.json({ success: false, error: 'Estrutura de planejamento persistente indisponível.', code: 'PLANNING_SCHEMA_REQUIRED' }, 503);
  }
  const userId = contextUserId(c);
  if (!userId) return c.json({ success: false, error: 'Usuário não autenticado.' }, 401);
  const raw = (await c.req.json().catch(() => null)) as DraftPayload | null;
  if (!raw) return c.json({ success: false, error: 'Payload inválido.' }, 400);
  const normalized = await normalizePayload(c, raw);
  if ('error' in normalized) return c.json({ success: false, error: normalized.error }, 400);

  const empresaId = getTenantContext(c).empresaId;
  const snapshot = normalized.snapshot;
  const planningKey = `${ORIGIN}:${snapshot.draft_id}`;
  const policy =
    String((snapshot.proposal.config as Record<string, unknown> | undefined)?.roster_policy || '') === 'FOLGA'
      ? 'FOLGA'
      : String((snapshot.proposal.config as Record<string, unknown> | undefined)?.roster_policy || '') === 'TRABALHO'
        ? 'QUINZENA_ATIVA'
        : 'AMBOS';
  const classNames = classSummary(snapshot.proposal).names;
  const result = await c.env.DB
    .prepare(
      `INSERT INTO treinamentos_planejados (
         empresa_id, qualificacao_tipo_id, data_prevista, status,
         carga_horaria_prevista, titulo, descricao, observacoes,
         data_inicio, data_fim, created_by, created_at, updated_at,
         planejamento_status, planejamento_origem, planejamento_chave,
         planejamento_editado_manualmente, planejamento_vencimento_referencia,
         planejamento_margem_dias, planejamento_quinzena_numero,
         planejamento_politica_janela, planejamento_tipo_janela,
         planejamento_janela_inicio, planejamento_janela_fim,
         planejamento_modelo_aeronave, planejamento_conflitos_json,
         planejamento_snapshot_json, planejamento_recalculado_em,
         planejamento_recalculado_por
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, datetime('now'), datetime('now'),
         ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, ?, '[]', ?, datetime('now'), ?
       )`,
    )
    .bind(
      empresaId,
      normalized.qualificationTypeId,
      normalized.dataPrevista,
      normalized.legacyStatus,
      normalized.totalHours,
      `Planejamento simulador V3 — ${classNames.slice(0, 2).join(', ') || normalized.equipment}`,
      'Proposta persistente do Planejamento de Simulador V3. Não materializa agenda nem qualificação.',
      normalized.dataInicio,
      normalized.dataFim,
      userId,
      normalized.plannedStatus,
      ORIGIN,
      planningKey,
      snapshot.locks.length > 0 ? 1 : 0,
      normalized.referenceExpiry,
      policy,
      normalized.equipment,
      JSON.stringify(snapshot),
      userId,
    )
    .run();
  const id = Number(result.meta.last_row_id || 0);
  if (!id) return c.json({ success: false, error: 'Não foi possível persistir o planejamento.' }, 500);
  for (const participantId of normalized.participantIds) {
    await c.env.DB
      .prepare(
        `INSERT INTO treinamentos_participantes (
           treinamento_id, funcionario_id, confirmado, presente, aprovado,
           nota, observacoes, created_at, updated_at
         ) VALUES (?, ?, 0, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'))`,
      )
      .bind(id, participantId)
      .run();
  }
  await c.env.DB
    .prepare(
      `INSERT INTO simulador_planejamento_auditoria (
         empresa_id, treinamento_planejado_id, acao, planejamento_status,
         snapshot_antes_json, snapshot_depois_json, realizado_por, realizado_em
       ) VALUES (?, ?, 'V3_PROPOSTA_PERSISTIDA', ?, NULL, ?, ?, datetime('now'))`,
    )
    .bind(empresaId, id, normalized.plannedStatus, JSON.stringify(snapshot), userId)
    .run();

  const row: DraftRow = {
    id,
    planejamento_chave: planningKey,
    planejamento_status: normalized.plannedStatus,
    planejamento_snapshot_json: JSON.stringify(snapshot),
    updated_at: snapshot.saved_at,
  };
  return c.json({ success: true, data: responseFromRow(row, snapshot) }, 201);
});

app.put('/rascunhos/:draftId', requireRole('admin', 'manager'), async (c) => {
  if (!(await schemaReady(c.env.DB))) {
    return c.json({ success: false, error: 'Estrutura de planejamento persistente indisponível.', code: 'PLANNING_SCHEMA_REQUIRED' }, 503);
  }
  const userId = contextUserId(c);
  if (!userId) return c.json({ success: false, error: 'Usuário não autenticado.' }, 401);
  const draftId = String(c.req.param('draftId') || '').trim();
  const current = await findDraftRow(c, draftId);
  const before = current ? parseSnapshot(current.planejamento_snapshot_json) : null;
  if (!current || !before) return c.json({ success: false, error: 'Planejamento salvo não encontrado.' }, 404);

  const raw = (await c.req.json().catch(() => null)) as DraftPayload | null;
  if (!raw) return c.json({ success: false, error: 'Payload inválido.' }, 400);
  const normalized = await normalizePayload(c, raw);
  if ('error' in normalized) return c.json({ success: false, error: normalized.error }, 400);
  const snapshot = snapshotWithDraftId(normalized.snapshot, draftId);
  const serialized = JSON.stringify(snapshot);
  if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
    return c.json({ success: false, error: 'A proposta excede o limite seguro de armazenamento.' }, 400);
  }

  const empresaId = getTenantContext(c).empresaId;
  const policy =
    String((snapshot.proposal.config as Record<string, unknown> | undefined)?.roster_policy || '') === 'FOLGA'
      ? 'FOLGA'
      : String((snapshot.proposal.config as Record<string, unknown> | undefined)?.roster_policy || '') === 'TRABALHO'
        ? 'QUINZENA_ATIVA'
        : 'AMBOS';
  await c.env.DB
    .prepare(
      `UPDATE treinamentos_planejados
          SET qualificacao_tipo_id = ?,
              data_prevista = ?,
              status = ?,
              carga_horaria_prevista = ?,
              data_inicio = ?,
              data_fim = ?,
              planejamento_status = ?,
              planejamento_editado_manualmente = ?,
              planejamento_vencimento_referencia = ?,
              planejamento_politica_janela = ?,
              planejamento_modelo_aeronave = ?,
              planejamento_snapshot_json = ?,
              planejamento_recalculado_em = datetime('now'),
              planejamento_recalculado_por = ?,
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND planejamento_origem = ? AND deleted_at IS NULL`,
    )
    .bind(
      normalized.qualificationTypeId,
      normalized.dataPrevista,
      normalized.legacyStatus,
      normalized.totalHours,
      normalized.dataInicio,
      normalized.dataFim,
      normalized.plannedStatus,
      snapshot.locks.length > 0 ? 1 : 0,
      normalized.referenceExpiry,
      policy,
      normalized.equipment,
      serialized,
      userId,
      current.id,
      empresaId,
      ORIGIN,
    )
    .run();
  await c.env.DB
    .prepare('DELETE FROM treinamentos_participantes WHERE treinamento_id = ?')
    .bind(current.id)
    .run();
  for (const participantId of normalized.participantIds) {
    await c.env.DB
      .prepare(
        `INSERT INTO treinamentos_participantes (
           treinamento_id, funcionario_id, confirmado, presente, aprovado,
           nota, observacoes, created_at, updated_at
         ) VALUES (?, ?, 0, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'))`,
      )
      .bind(current.id, participantId)
      .run();
  }
  await c.env.DB
    .prepare(
      `INSERT INTO simulador_planejamento_auditoria (
         empresa_id, treinamento_planejado_id, acao, planejamento_status,
         snapshot_antes_json, snapshot_depois_json, realizado_por, realizado_em
       ) VALUES (?, ?, 'V3_PROPOSTA_ATUALIZADA', ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(empresaId, current.id, normalized.plannedStatus, JSON.stringify(before), serialized, userId)
    .run();

  const row: DraftRow = {
    id: current.id,
    planejamento_chave: `${ORIGIN}:${draftId}`,
    planejamento_status: normalized.plannedStatus,
    planejamento_snapshot_json: serialized,
    updated_at: snapshot.saved_at,
  };
  return c.json({ success: true, data: responseFromRow(row, snapshot) });
});

export default app;
