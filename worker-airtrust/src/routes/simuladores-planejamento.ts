import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { materializeSimulatorPlanning } from '../services/cae-planning-materialization';
import { executeSimulatorPlanningApproval } from '../services/cae-planning-approval';
import { resolveSimulatorPlanningConfig, isInsidePlanningHorizon, type SimulatorPlanningConfigRow } from '../services/cae-planning-policy';
import { importCaeAvailabilityFromUpload } from '../services/cae-availability-import';

import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import {
  assertFuncionarioInScope,
  buildFuncionarioScopeWhere,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';
import { syncTreinamentoPlanejadoIntegration } from '../services/treinamentos-planejados-integration';
import { validateAndNormalizeCaeAvailability } from '../services/cae-availability';
import { matchCaeAvailabilityBatch, type CaeBatchPlanningNeed } from '../services/cae-planning-batch';
import { resolvePublishedRosterDayFromD1 } from '../services/cae-planning-roster-d1';
import {
  resolveGlobalSimulatorForEquipment,
  validateInstructorAssignment,
} from '../services/cae-planning-resource-assignment';
import {
  buildPlanningKey,
  estimateSessionCount,
  hasCompleteSimulatorSessionSchedule,
  mapPlanningStatusToLegacy,
  pairSimulatorPlanningCandidates,
  resolveQuinzenaNumero,
  selectPriorPlanningWindow,
  SIMULATOR_PLANNING_STATUSES,
  SIMULATOR_PLANNING_WINDOW_POLICIES,
  type QuinzenaWindow,
  type SimulatorPlanningCandidate,
  type SimulatorPlanningStatus,
  type SimulatorPlanningWindowPolicy,
  type SimulatorPlanningWindowType,
} from '../services/simulator-future-planning';
import {
  buildRenewalSqlPredicates,
  hasHistoricoRenovacaoDeColumn,
} from './qualificacoes/historico';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

type ModelRow = {
  id: number;
  qualificacao_tipo_id: number;
  codigo: string;
  nome: string;
  duracao_estimada: number | null;
  ordem_no_treinamento: number | null;
  modelo_aeronave: string | null;
  tipo_sessao_codigo: string | null;
};

type QualificationRow = {
  historico_id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_funcao: string | null;
  funcionario_quinzena: string | null;
  qualificacao_tipo_id: number;
  qualificacao_codigo: string | null;
  qualificacao_nome: string;
  data_vencimento: string;
  carga_horaria_recorrente: number | null;
};

type PlanningListRow = {
  id: number;
  empresa_id: number;
  qualificacao_tipo_id: number;
  qualificacao_codigo: string | null;
  qualificacao_nome: string | null;
  data_prevista: string;
  data_inicio: string | null;
  data_fim: string | null;
  status: string;
  titulo: string | null;
  observacoes: string | null;
  carga_horaria_prevista: number | null;
  planejamento_status: SimulatorPlanningStatus;
  planejamento_editado_manualmente: number;
  planejamento_vencimento_referencia: string | null;
  planejamento_margem_dias: number | null;
  planejamento_quinzena_numero: number | null;
  planejamento_politica_janela: SimulatorPlanningWindowPolicy | null;
  planejamento_tipo_janela: SimulatorPlanningWindowType | null;
  planejamento_janela_inicio: string | null;
  planejamento_janela_fim: string | null;
  planejamento_modelo_aeronave: string | null;
  planejamento_conflitos_json: string | null;
  planejamento_snapshot_json: string | null;
  planejamento_recalculado_em: string | null;
  planejamento_aprovacao_status: string | null;
  planejamento_aprovacao_observacoes: string | null;
  planejamento_aprovado_por: number | null;
  planejamento_aprovado_em: string | null;
  updated_at: string | null;
};

type ParticipantRow = {
  treinamento_id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_funcao: string | null;
  funcionario_quinzena: string | null;
};

type PlanningPatch = {
  planejamento_status?: SimulatorPlanningStatus;
  data_prevista?: string;
  janela_inicio?: string | null;
  janela_fim?: string | null;
  margem_dias?: number | null;
  observacoes?: string | null;
  participante_ids?: number[];
};

const PLANNING_ORIGIN = 'SIMULADOR_QUINZENA';
const ACTIVE_PAIR_STATUSES = new Set<SimulatorPlanningStatus>([
  'PLANEJADO',
  'CONFIRMADO',
  'AGENDADO',
]);

function getEmpresaId(c: Parameters<typeof getTenantContext>[0]): number {
  return getTenantContext(c).empresaId;
}

function contextUserId(c: { get: (key: string) => unknown }): number | null {
  const value = Number(c.get('userId') || 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function isIsoDate(value: unknown): value is string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${String(value)}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseNullableJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeEquipment(value: unknown): string {
  const compact = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!compact) return 'UNIVERSAL';
  if (compact.includes('AW139')) return 'AW139';
  if (compact.includes('SK76') || compact.includes('S76')) return 'SK76';
  return compact;
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(tableName)
    .first<{ name: string }>();
  return row?.name === tableName;
}

async function planningSchemaReady(db: D1Database): Promise<boolean> {
  const columns = await db
    .prepare("SELECT name FROM pragma_table_info('treinamentos_planejados')")
    .all<{ name: string }>();
  const names = new Set((columns.results || []).map((row) => row.name));
  return (
    names.has('planejamento_status') &&
    names.has('planejamento_snapshot_json') &&
    names.has('planejamento_politica_janela') &&
    names.has('planejamento_tipo_janela') &&
    (await tableExists(db, 'simulador_planejamento_auditoria'))
  );
}

function chooseModelGroup(
  qualification: QualificationRow,
  modelGroups: Map<string, ModelRow[]>,
): { equipment: string; models: ModelRow[]; ambiguous: boolean } {
  const universal = modelGroups.get('UNIVERSAL') || [];
  const equipmentGroups = [...modelGroups.entries()].filter(
    ([equipment]) => equipment !== 'UNIVERSAL',
  );
  if (equipmentGroups.length === 0) {
    return { equipment: 'UNIVERSAL', models: universal, ambiguous: false };
  }
  if (equipmentGroups.length === 1) {
    return {
      equipment: equipmentGroups[0][0],
      models: [...equipmentGroups[0][1], ...universal],
      ambiguous: false,
    };
  }

  const identity = normalizeEquipment(
    `${qualification.qualificacao_codigo || ''} ${qualification.qualificacao_nome}`,
  );
  const matched = equipmentGroups.find(([equipment]) => identity.includes(equipment));
  if (matched) {
    return { equipment: matched[0], models: [...matched[1], ...universal], ambiguous: false };
  }

  return {
    equipment: 'A_DEFINIR',
    models: [...equipmentGroups.flatMap(([, rows]) => rows), ...universal],
    ambiguous: true,
  };
}

async function loadCurrentModels(db: D1Database, empresaId: number): Promise<ModelRow[]> {
  const hasVersioning = await tableExists(db, 'modelos_sessao_versionamento');
  const versioningJoin = hasVersioning
    ? `INNER JOIN modelos_sessao_versionamento msv
         ON msv.modelo_id = ms.id
        AND msv.empresa_id = ms.empresa_id
        AND msv.is_current = 1`
    : '';

  const rows = await db
    .prepare(
      `SELECT ms.id,
              ms.qualificacao_tipo_id,
              ms.codigo,
              ms.nome,
              ms.duracao_estimada,
              ms.ordem_no_treinamento,
              ms.modelo_aeronave,
              ts.codigo AS tipo_sessao_codigo
         FROM modelos_sessao ms
         ${versioningJoin}
         INNER JOIN qualificacoes_tipos qt
           ON qt.id = ms.qualificacao_tipo_id
          AND qt.empresa_id = ms.empresa_id
          AND qt.deleted_at IS NULL
          AND COALESCE(qt.ativo, 1) = 1
          AND COALESCE(qt.validade, 0) > 0
         LEFT JOIN tipos_sessao ts
           ON ts.id = ms.tipo_sessao_id
          AND ts.empresa_id = ms.empresa_id
          AND ts.deleted_at IS NULL
        WHERE ms.empresa_id = ?
          AND ms.deleted_at IS NULL
          AND COALESCE(ms.ativo, 1) = 1
          AND ms.qualificacao_tipo_id IS NOT NULL
        ORDER BY ms.qualificacao_tipo_id,
                 COALESCE(ms.ordem_no_treinamento, 999999),
                 ms.codigo`,
    )
    .bind(empresaId)
    .all<ModelRow>();
  return rows.results || [];
}

async function loadCandidateQualifications(params: {
  db: D1Database;
  empresaId: number;
  inicio: string;
  fim: string;
  scopeClause: string;
  scopeBindings: number[];
  qualificationTypeIds: number[];
}): Promise<QualificationRow[]> {
  const { db, empresaId, inicio, fim, scopeClause, scopeBindings, qualificationTypeIds } = params;
  if (qualificationTypeIds.length === 0) return [];
  const hasRenovacaoDe = await hasHistoricoRenovacaoDeColumn(db);
  const { operationalCurrentQualificationPredicate } = buildRenewalSqlPredicates(hasRenovacaoDe);
  const placeholders = qualificationTypeIds.map(() => '?').join(', ');

  const rows = await db
    .prepare(
      `SELECT qh.id AS historico_id,
              f.id AS funcionario_id,
              f.nome AS funcionario_nome,
              f.funcao AS funcionario_funcao,
              f.quinzena AS funcionario_quinzena,
              qt.id AS qualificacao_tipo_id,
              qt.codigo AS qualificacao_codigo,
              qt.nome AS qualificacao_nome,
              qh.data_vencimento,
              COALESCE(qt.carga_horaria_recorrente, qt.carga_horaria) AS carga_horaria_recorrente
         FROM qualificacoes_historico qh
         INNER JOIN funcionarios f
           ON f.id = qh.funcionario_id
          AND f.empresa_id = qh.empresa_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
         INNER JOIN qualificacoes_tipos qt
           ON qt.id = qh.qualificacao_id
          AND qt.empresa_id = qh.empresa_id
          AND qt.deleted_at IS NULL
          AND COALESCE(qt.ativo, 1) = 1
          AND COALESCE(qt.validade, 0) > 0
        WHERE qh.empresa_id = ?
          AND qh.data_vencimento IS NOT NULL
          AND date(qh.data_vencimento) BETWEEN date(?) AND date(?)
          AND qt.id IN (${placeholders})
          AND ${scopeClause}
          AND ${operationalCurrentQualificationPredicate}
        ORDER BY date(qh.data_vencimento), f.nome, qt.nome`,
    )
    .bind(empresaId, inicio, fim, ...qualificationTypeIds, ...scopeBindings)
    .all<QualificationRow>();
  return rows.results || [];
}

async function loadQuinzenaWindows(
  db: D1Database,
  empresaId: number,
  inicio: string,
  fim: string,
): Promise<QuinzenaWindow[]> {
  const rows = await db
    .prepare(
      `SELECT id, numero, data_inicio, data_fim
         FROM escalas_quinzenas
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND numero IN (1, 2)
          AND date(data_fim) >= date(?, '-400 days')
          AND date(data_inicio) <= date(?)
        ORDER BY data_fim`,
    )
    .bind(empresaId, inicio, fim)
    .all<QuinzenaWindow>();
  return (rows.results || []).map((row) => ({
    ...row,
    numero: Number(row.numero) === 2 ? 2 : 1,
  }));
}

async function loadPlanningLoad(db: D1Database, empresaId: number): Promise<Map<number, number>> {
  const rows = await db
    .prepare(
      `SELECT tp.funcionario_id, COUNT(DISTINCT t.id) AS total
         FROM treinamentos_planejados t
         INNER JOIN treinamentos_participantes tp ON tp.treinamento_id = t.id
        WHERE t.empresa_id = ?
          AND t.deleted_at IS NULL
          AND t.planejamento_status IS NOT NULL
          AND t.planejamento_status <> 'CANCELADO'
        GROUP BY tp.funcionario_id`,
    )
    .bind(empresaId)
    .all<{ funcionario_id: number; total: number }>();
  return new Map(
    (rows.results || []).map((row) => [Number(row.funcionario_id), Number(row.total)]),
  );
}

async function loadPreservedQualificationKeys(
  db: D1Database,
  empresaId: number,
  inicio: string,
  fim: string,
): Promise<Set<string>> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT tp.funcionario_id, t.qualificacao_tipo_id
         FROM treinamentos_planejados t
         INNER JOIN treinamentos_participantes tp ON tp.treinamento_id = t.id
        WHERE t.empresa_id = ?
          AND t.deleted_at IS NULL
          AND t.planejamento_origem = ?
          AND t.planejamento_editado_manualmente = 1
          AND date(t.planejamento_vencimento_referencia) BETWEEN date(?) AND date(?)`,
    )
    .bind(empresaId, PLANNING_ORIGIN, inicio, fim)
    .all<{ funcionario_id: number; qualificacao_tipo_id: number }>();
  return new Set(
    (rows.results || []).map(
      (row) => `${Number(row.funcionario_id)}:${Number(row.qualificacao_tipo_id)}`,
    ),
  );
}

async function loadPublishedRosterConflicts(params: {
  db: D1Database;
  empresaId: number;
  funcionarioIds: number[];
  inicio: string | null;
  fim: string | null;
}): Promise<Array<Record<string, unknown>>> {
  if (!params.inicio || !params.fim || params.funcionarioIds.length === 0) return [];
  const placeholders = params.funcionarioIds.map(() => '?').join(', ');
  const rows = await params.db
    .prepare(
      `SELECT ea.funcionario_id,
              ea.data_inicio,
              ea.data_fim,
              ea.funcao,
              ea.situacao_tipo,
              ea.base,
              em.id AS escala_id,
              em.mes,
              em.ano
         FROM escala_alocacoes ea
         INNER JOIN escalas_mensais em
           ON em.id = ea.escala_id
          AND em.empresa_id = ?
          AND em.deleted_at IS NULL
          AND em.status = 'publicada'
        WHERE ea.deleted_at IS NULL
          AND ea.status <> 'cancelado'
          AND CAST(ea.funcionario_id AS INTEGER) IN (${placeholders})
          AND date(ea.data_fim) >= date(?)
          AND date(ea.data_inicio) <= date(?)
          AND UPPER(COALESCE(ea.situacao_tipo, '')) <> 'FOLGA'
        ORDER BY ea.funcionario_id, ea.data_inicio`,
    )
    .bind(params.empresaId, ...params.funcionarioIds, params.inicio, params.fim)
    .all<Record<string, unknown>>();
  return rows.results || [];
}

async function insertPlanningAudit(params: {
  db: D1Database;
  empresaId: number;
  treinamentoId: number | null;
  acao: string;
  status: SimulatorPlanningStatus | null;
  before?: unknown;
  after?: unknown;
  userId: number | null;
}) {
  await params.db
    .prepare(
      `INSERT INTO simulador_planejamento_auditoria (
         empresa_id, treinamento_planejado_id, acao, planejamento_status,
         snapshot_antes_json, snapshot_depois_json, realizado_por, realizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      params.empresaId,
      params.treinamentoId,
      params.acao,
      params.status,
      params.before == null ? null : JSON.stringify(params.before),
      params.after == null ? null : JSON.stringify(params.after),
      params.userId,
    )
    .run();
}

type InsertProposalCaeSlot = {
  slot_key: string;
  state: string;
  equipment: string;
  date: string;
  start_time: string;
  end_time: string;
};

async function insertProposal(params: {
  db: D1Database;
  empresaId: number;
  userId: number | null;
  runMarker: string;
  candidates: SimulatorPlanningCandidate[];
  status: SimulatorPlanningStatus;
  margemDias: number | null;
  config: ReturnType<typeof resolveSimulatorPlanningConfig>;
  caeSlot?: InsertProposalCaeSlot | null;
}): Promise<number> {
  const first = params.candidates[0];
  const participantIds = params.candidates.map((candidate) => candidate.funcionarioId);
  const janelaInicio = first.janelaInicio;
  const janelaFim = first.janelaFim;
  const vencimentoReferencia = params.candidates.map((candidate) => candidate.vencimento).sort()[0];
  const conflicts = await loadPublishedRosterConflicts({
    db: params.db,
    empresaId: params.empresaId,
    funcionarioIds: participantIds,
    inicio: janelaInicio,
    fim: janelaFim,
  });
  const candidateModelIds = (candidate: SimulatorPlanningCandidate): number[] => {
    const snapshot = candidate.snapshot as { models?: Array<{ id?: unknown }> } | null;
    const models = Array.isArray(snapshot?.models) ? snapshot.models : [];
    return models.map((model) => Number(model.id)).filter((id): id is number => Number.isInteger(id) && id > 0);
  };
  const trainingIds = new Set(params.candidates.map((candidate) => String(candidate.qualificacaoTipoId)));
  const modelIds = params.candidates.map((candidate) => candidateModelIds(candidate)[0] || 0);
  const sameTraining = trainingIds.size === 1;
  const sameModel = modelIds[0] > 0 && modelIds.every((id) => id === modelIds[0]);
  const mode = params.candidates.length > 1 && !(sameTraining && sameModel) ? 'COMPARTILHADA' : 'NORMAL';
  const sessionFingerprint = params.candidates
    .map((candidate) => `${candidate.funcionarioId}:${candidateModelIds(candidate).join(',')}`)
    .sort()
    .join('|');
  // O estado de escala é resolvido apenas para a data do slot CAE selecionado
  // (a data candidata real da sessão). Sem slot, não há data candidata ainda
  // e roster_by_date fica vazio — a revalidação live não terá nada a comparar
  // até que um slot seja confirmado.
  const rosterByDateByParticipant = new Map<number, Record<string, string>>();
  if (params.caeSlot) {
    for (const candidate of params.candidates) {
      const resolved = await resolvePublishedRosterDayFromD1({
        db: params.db,
        empresaId: params.empresaId,
        employeeId: candidate.funcionarioId,
        date: params.caeSlot.date,
      });
      rosterByDateByParticipant.set(candidate.funcionarioId, { [params.caeSlot.date]: resolved.state });
    }
  }
  // simuladores é um catálogo GLOBAL (sem empresa_id, por decisão de produto
  // já confirmada — mesma convenção documentada em GET /simuladores-equipamentos).
  // Só resolve quando já há um slot (equipamento confirmado) e só auto-atribui
  // quando exatamente um simulador ativo compatível existe; nunca escolhe
  // arbitrariamente entre vários, nunca inventa quando não há nenhum.
  let simulatorId: number | null = null;
  const pendingResources: string[] = ['instructor_id'];
  if (params.caeSlot) {
    const resolution = await resolveGlobalSimulatorForEquipment(params.db, first.modeloAeronave);
    if (resolution.status === 'RESOLVED') {
      simulatorId = resolution.simulator_id;
    } else {
      pendingResources.unshift('simulator_id');
    }
  } else {
    pendingResources.unshift('simulator_id');
  }
  const snapshot = {
    generated_at: params.runMarker,
    config: params.config,
    mode,
    simulator_id: simulatorId,
    instructor_id: null,
    resource_assignment: {
      pending: pendingResources,
      complete: pendingResources.length === 0,
    },
    participants: params.candidates.map((candidate) => ({
      funcionario_id: candidate.funcionarioId,
      funcionario_nome: candidate.funcionarioNome,
      funcao: candidate.funcao,
      vencimento: candidate.vencimento,
      quinzena_numero: candidate.quinzenaNumero,
      employee_id: candidate.funcionarioId,
      employee_active: true,
      equipment: first.modeloAeronave,
      qualification_history_id: null,
      qualification_expiry_date: candidate.vencimento,
      training_id: candidate.qualificacaoTipoId,
      session_model_ids: candidateModelIds(candidate),
      roster_by_date: rosterByDateByParticipant.get(candidate.funcionarioId) || {},
    })),
    cae_slots: params.caeSlot ? [params.caeSlot] : [],
    canonical_session_fingerprint: `sessions:${sessionFingerprint}`,
    pairing_fingerprint: `pairing:${mode}:${sessionFingerprint}`,
    curriculum: first.snapshot,
    window_policy: first.politicaJanela,
    selected_window_type: first.janelaTipo,
    source: 'qualificacoes_historico + modelos_sessao + escalas_quinzenas',
  };
  const planningKey = buildPlanningKey({
    qualificacaoTipoId: first.qualificacaoTipoId,
    modeloAeronave: first.modeloAeronave,
    janelaInicio,
    janelaFim,
    funcionarioIds: participantIds,
  });
  const legacyStatus = mapPlanningStatusToLegacy(params.status);
  const dataPrevista = janelaInicio || vencimentoReferencia;
  const result = await params.db
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
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'),
         ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`,
    )
    .bind(
      params.empresaId,
      first.qualificacaoTipoId,
      dataPrevista,
      legacyStatus,
      first.cargaHoras,
      `Planejamento ${first.qualificacaoNome} — ${first.modeloAeronave}`,
      'Planejamento futuro de simulador gerado a partir da qualificação vigente e da quinzena configurada.',
      conflicts.length > 0 ? 'Há conflito com escala publicada; revisar antes de agendar.' : null,
      janelaInicio,
      janelaFim,
      params.userId,
      params.status,
      PLANNING_ORIGIN,
      planningKey,
      vencimentoReferencia,
      params.margemDias,
      first.quinzenaNumero,
      first.politicaJanela,
      first.janelaTipo,
      janelaInicio,
      janelaFim,
      first.modeloAeronave,
      JSON.stringify(conflicts),
      JSON.stringify(snapshot),
      params.runMarker,
      params.userId,
    )
    .run();
  const treinamentoId = Number(result.meta.last_row_id || 0);
  for (const candidate of params.candidates) {
    await params.db
      .prepare(
        `INSERT INTO treinamentos_participantes (
           treinamento_id, funcionario_id, confirmado, presente, aprovado,
           nota, observacoes, created_at, updated_at
         ) VALUES (?, ?, 0, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'))`,
      )
      .bind(treinamentoId, candidate.funcionarioId)
      .run();
  }
  await insertPlanningAudit({
    db: params.db,
    empresaId: params.empresaId,
    treinamentoId,
    acao: params.status === 'PROPOSTO' ? 'RECALCULO_PROPOSTA' : 'RECALCULO_PENDENCIA',
    status: params.status,
    after: snapshot,
    userId: params.userId,
  });
  return treinamentoId;
}

async function listPlanningItems(params: {
  db: D1Database;
  empresaId: number;
  scopeClause: string;
  scopeBindings: number[];
  inicio?: string | null;
  fim?: string | null;
  status?: string | null;
}) {
  let query = `SELECT t.id,
                      t.empresa_id,
                      t.qualificacao_tipo_id,
                      qt.codigo AS qualificacao_codigo,
                      qt.nome AS qualificacao_nome,
                      t.data_prevista,
                      t.data_inicio,
                      t.data_fim,
                      t.status,
                      t.titulo,
                      t.observacoes,
                      t.carga_horaria_prevista,
                      t.planejamento_status,
                      t.planejamento_editado_manualmente,
                      t.planejamento_vencimento_referencia,
                      t.planejamento_margem_dias,
                      t.planejamento_quinzena_numero,
                      t.planejamento_politica_janela,
                      t.planejamento_tipo_janela,
                      t.planejamento_janela_inicio,
                      t.planejamento_janela_fim,
                      t.planejamento_modelo_aeronave,
                      t.planejamento_conflitos_json,
                      t.planejamento_snapshot_json,
                      t.planejamento_recalculado_em,
                      t.planejamento_aprovacao_status,
                      t.planejamento_aprovacao_observacoes,
                      t.planejamento_aprovado_por,
                      t.planejamento_aprovado_em,
                      t.updated_at
                 FROM treinamentos_planejados t
                 LEFT JOIN qualificacoes_tipos qt
                   ON qt.id = t.qualificacao_tipo_id
                  AND qt.empresa_id = t.empresa_id
                  AND qt.deleted_at IS NULL
                WHERE t.empresa_id = ?
                  AND t.deleted_at IS NULL
                  AND t.planejamento_origem = ?
                  AND EXISTS (
                    SELECT 1
                      FROM treinamentos_participantes tp_scope
                      INNER JOIN funcionarios f
                        ON f.id = tp_scope.funcionario_id
                       AND f.empresa_id = t.empresa_id
                       AND f.deleted_at IS NULL
                     WHERE tp_scope.treinamento_id = t.id
                       AND ${params.scopeClause}
                  )`;
  const bindings: unknown[] = [params.empresaId, PLANNING_ORIGIN, ...params.scopeBindings];
  if (params.inicio) {
    query += ' AND date(t.planejamento_vencimento_referencia) >= date(?)';
    bindings.push(params.inicio);
  }
  if (params.fim) {
    query += ' AND date(t.planejamento_vencimento_referencia) <= date(?)';
    bindings.push(params.fim);
  }
  if (
    params.status &&
    SIMULATOR_PLANNING_STATUSES.includes(params.status as SimulatorPlanningStatus)
  ) {
    query += ' AND t.planejamento_status = ?';
    bindings.push(params.status);
  }
  query += ' ORDER BY date(t.planejamento_vencimento_referencia), t.id';

  const rows = await params.db
    .prepare(query)
    .bind(...bindings)
    .all<PlanningListRow>();
  const items = rows.results || [];
  if (items.length === 0) return [];
  const ids = items.map((row) => Number(row.id));
  const participantPlaceholders = ids.map(() => '?').join(', ');
  const participants = await params.db
    .prepare(
      `SELECT tp.treinamento_id,
              f.id AS funcionario_id,
              f.nome AS funcionario_nome,
              f.funcao AS funcionario_funcao,
              f.quinzena AS funcionario_quinzena
         FROM treinamentos_participantes tp
         INNER JOIN treinamentos_planejados t
           ON t.id = tp.treinamento_id
          AND t.empresa_id = ?
          AND t.deleted_at IS NULL
         INNER JOIN funcionarios f
           ON f.id = tp.funcionario_id
          AND f.empresa_id = t.empresa_id
          AND f.deleted_at IS NULL
        WHERE tp.treinamento_id IN (${participantPlaceholders})
          AND ${params.scopeClause}
        ORDER BY tp.treinamento_id, f.nome`,
    )
    .bind(params.empresaId, ...ids, ...params.scopeBindings)
    .all<ParticipantRow>();
  const byTraining = new Map<number, ParticipantRow[]>();
  for (const participant of participants.results || []) {
    const trainingId = Number(participant.treinamento_id);
    const bucket = byTraining.get(trainingId) || [];
    bucket.push(participant);
    byTraining.set(trainingId, bucket);
  }

  return items.map((row) => ({
    ...row,
    planejamento_conflitos: parseNullableJson(row.planejamento_conflitos_json),
    planejamento_snapshot: parseNullableJson(row.planejamento_snapshot_json),
    participantes: byTraining.get(Number(row.id)) || [],
  }));
}


type CandidateCurriculumSnapshot = {
  models?: Array<{
    duracao_estimada?: unknown;
  }>;
};

function sessionDurationsFromCandidate(candidate: SimulatorPlanningCandidate): number[] {
  const snapshot = candidate.snapshot as CandidateCurriculumSnapshot | null;
  const models = Array.isArray(snapshot?.models) ? snapshot?.models || [] : [];
  if (models.length === 0) return [];
  return models.map((model) => Number(model.duracao_estimada));
}

function proposalNeedId(candidates: SimulatorPlanningCandidate[]): string {
  const first = candidates[0];
  const participantIds = candidates.map((candidate) => candidate.funcionarioId).sort((a, b) => a - b);
  return [
    first.qualificacaoTipoId,
    first.modeloAeronave,
    participantIds.join('-'),
    candidates.map((candidate) => candidate.vencimento).sort()[0],
  ].join(':');
}

function dateRangesOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
): boolean {
  return leftStart <= rightEnd && leftEnd >= rightStart;
}


app.post('/cae-disponibilidade/importar', requireRole('admin', 'manager'), async (c) => {
  const formData = await c.req.formData().catch(() => null);
  if (!formData) {
    return c.json({ success: false, error: 'Upload inválido' }, 400);
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return c.json({ success: false, error: 'Nenhum arquivo enviado' }, 400);
  }

  const mimeType = String(file.type || '').toLowerCase();
  const fileName = String(file.name || 'cae.pdf');
  if (!mimeType.includes('pdf') && !fileName.toLowerCase().endsWith('.pdf')) {
    return c.json({ success: false, error: 'Envie o PDF recebido da CAE. JSON manual não substitui o upload.' }, 400);
  }
  if (!c.env.BUCKET) {
    return c.json({ success: false, error: 'Armazenamento de arquivos indisponível' }, 503);
  }

  const empresaId = getEmpresaId(c);
  const fileKey = `cae-availability/${empresaId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  await c.env.BUCKET.put(fileKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'application/pdf' } });

  const imported = await importCaeAvailabilityFromUpload({
    empresaId,
    fileName,
    mimeType: file.type || 'application/pdf',
    objectKey: fileKey,
  });

  if (imported.status === 'EXTRACTION_UNAVAILABLE') {
    return c.json({
      success: false,
      error: imported.error,
      requires_human_review: true,
      extraction_available: false,
      file_key: imported.object_key,
    }, 422);
  }

  return c.json({
    success: imported.import.status !== 'REJEITADO',
    data: imported.import,
    file_key: imported.object_key,
  }, imported.import.status === 'REJEITADO' ? 400 : 200);
});

app.get('/', async (c) => {
  const empresaId = getEmpresaId(c);
  if (!(await planningSchemaReady(c.env.DB))) {
    return c.json(
      { success: false, error: 'Migration 0460 não aplicada', code: 'PLANNING_SCHEMA_REQUIRED' },
      503,
    );
  }
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scope = buildFuncionarioScopeWhere(access, 'f');
  const data = await listPlanningItems({
    db: c.env.DB,
    empresaId,
    scopeClause: scope.clause,
    scopeBindings: scope.bindings,
    inicio: c.req.query('inicio'),
    fim: c.req.query('fim'),
    status: c.req.query('status'),
  });
  return c.json({
    success: true,
    data,
    resumo: SIMULATOR_PLANNING_STATUSES.reduce<Record<string, number>>((acc, status) => {
      acc[status] = data.filter((item) => item.planejamento_status === status).length;
      return acc;
    }, {}),
  });
});

app.post('/disponibilidade-cae/validar', requireRole('admin', 'manager'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = validateAndNormalizeCaeAvailability(body);
  if (!result.ok) {
    return c.json(
      {
        success: false,
        error: 'Disponibilidade CAE inválida',
        code: 'CAE_AVAILABILITY_INVALID',
        details: result.errors,
        warnings: result.warnings,
      },
      400,
    );
  }

  return c.json({
    success: true,
    data: {
      document: result.data,
      warnings: result.warnings,
      mode: 'PREVIEW_ONLY',
    },
  });
});

app.post('/recalcular', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaId(c);
  const db = c.env.DB;
  if (!(await planningSchemaReady(db))) {
    return c.json(
      { success: false, error: 'Migration 0460 não aplicada', code: 'PLANNING_SCHEMA_REQUIRED' },
      503,
    );
  }
  const body = (await c.req.json().catch(() => null)) as {
    vencimento_inicio?: unknown;
    vencimento_fim?: unknown;
    margem_dias?: unknown;
    politica_janela?: unknown;
    dry_run?: unknown;
    cae_availability?: unknown;
    data_referencia?: unknown;
  } | null;
  const inicio = String(body?.vencimento_inicio || '');
  const fim = String(body?.vencimento_fim || '');
  if (!isIsoDate(inicio) || !isIsoDate(fim) || inicio > fim) {
    return c.json({ success: false, error: 'Intervalo de vencimento inválido' }, 400);
  }
  const empresaConfigRow = await c.env.DB
    .prepare(
      `SELECT
         planejamento_simulador_antecedencia_dias,
         planejamento_simulador_regra_quinzena,
         planejamento_simulador_preferencia_sessoes_por_dia,
         planejamento_simulador_preferencia_minutos_por_dia,
         planejamento_simulador_permitir_quebra_preferencia,
         planejamento_simulador_permitir_sessao_compartilhada,
         planejamento_simulador_preferir_mesmo_treinamento,
         planejamento_simulador_preferir_mesma_sessao,
         planejamento_simulador_aprovacao_obrigatoria
       FROM empresas_config
      WHERE empresa_id = ?`,
    )
    .bind(empresaId)
    .first<SimulatorPlanningConfigRow>()
    .catch(() => undefined);
  
  const config = resolveSimulatorPlanningConfig(empresaConfigRow);

  let margemDias: number | null = null;
  if (body?.margem_dias !== undefined && body?.margem_dias !== null && body?.margem_dias !== '') {
    margemDias = Number(body.margem_dias);
    if (!Number.isInteger(margemDias) || margemDias < 0 || margemDias > 365) {
      return c.json(
        { success: false, error: 'margem_dias deve ser um inteiro entre 0 e 365' },
        400,
      );
    }
  }

  const politicaJanela = String(body?.politica_janela || 'FOLGA') as SimulatorPlanningWindowPolicy;
  const dryRun = body?.dry_run === true || String(body?.dry_run || '').toLowerCase() === 'true';
  const dataReferenciaRaw = String(body?.data_referencia || '').trim();
  const dataReferencia = dataReferenciaRaw || new Date().toISOString().slice(0, 10);
  if (!isIsoDate(dataReferencia)) {
    return c.json({ success: false, error: 'data_referencia inválida' }, 400);
  }
  if (!SIMULATOR_PLANNING_WINDOW_POLICIES.includes(politicaJanela)) {
    return c.json({ success: false, error: 'politica_janela inválida' }, 400);
  }

  const userId = contextUserId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scope = buildFuncionarioScopeWhere(access, 'f');
  const models = await loadCurrentModels(db, empresaId);
  const qualificationTypeIds = [
    ...new Set(models.map((model) => Number(model.qualificacao_tipo_id))),
  ];
  const [qualificationRows, windows, load, preservedQualificationKeys] = await Promise.all([
    loadCandidateQualifications({
      db,
      empresaId,
      inicio,
      fim,
      scopeClause: scope.clause,
      scopeBindings: scope.bindings,
      qualificationTypeIds,
    }),
    loadQuinzenaWindows(db, empresaId, inicio, fim),
    loadPlanningLoad(db, empresaId),
    loadPreservedQualificationKeys(db, empresaId, inicio, fim),
  ]);

  const modelsByQualification = new Map<number, Map<string, ModelRow[]>>();
  for (const model of models) {
    const qualificationId = Number(model.qualificacao_tipo_id);
    const group = modelsByQualification.get(qualificationId) || new Map<string, ModelRow[]>();
    const equipment = normalizeEquipment(model.modelo_aeronave);
    const rows = group.get(equipment) || [];
    rows.push(model);
    group.set(equipment, rows);
    modelsByQualification.set(qualificationId, group);
  }

  const candidates: SimulatorPlanningCandidate[] = [];
  for (const qualification of qualificationRows) {
    if (
      preservedQualificationKeys.has(
        `${Number(qualification.funcionario_id)}:${Number(qualification.qualificacao_tipo_id)}`,
      )
    )
      continue;
    const groups = modelsByQualification.get(Number(qualification.qualificacao_tipo_id));
    if (!groups) continue;
    const modelGroup = chooseModelGroup(qualification, groups);
    if (!isInsidePlanningHorizon({ reference_date: dataReferencia, expiry_date: String(qualification.data_vencimento).slice(0, 10), config })) continue;
    const quinzenaNumero = resolveQuinzenaNumero(qualification.funcionario_quinzena);
    const selectedWindow = modelGroup.ambiguous
      ? null
      : selectPriorPlanningWindow(
          windows,
          quinzenaNumero,
          qualification.data_vencimento,
          margemDias,
          politicaJanela,
        );
    const estimate = estimateSessionCount(
      qualification.carga_horaria_recorrente == null
        ? null
        : Number(qualification.carga_horaria_recorrente),
      modelGroup.models.map((model) => Number(model.duracao_estimada || 0)),
    );
    candidates.push({
      funcionarioId: Number(qualification.funcionario_id),
      funcionarioNome: qualification.funcionario_nome,
      funcao: qualification.funcionario_funcao,
      qualificacaoTipoId: Number(qualification.qualificacao_tipo_id),
      qualificacaoCodigo: qualification.qualificacao_codigo,
      qualificacaoNome: qualification.qualificacao_nome,
      vencimento: String(qualification.data_vencimento).slice(0, 10),
      modeloAeronave: modelGroup.equipment,
      quinzenaNumero,
      politicaJanela,
      janelaTipo: selectedWindow?.type || null,
      janelaInicio: selectedWindow?.window.data_inicio || null,
      janelaFim: selectedWindow?.window.data_fim || null,
      cargaHoras: estimate.totalMinutes == null ? null : estimate.totalMinutes / 60,
      cargaAtual: load.get(Number(qualification.funcionario_id)) || 0,
      snapshot: {
        ambiguous_equipment: modelGroup.ambiguous,
        source_recurring_hours: qualification.carga_horaria_recorrente,
        estimated_session_count: estimate.sessionCount,
        typical_session_minutes: estimate.typicalSessionMinutes,
        models: modelGroup.models.map((model) => ({
          id: Number(model.id),
          codigo: model.codigo,
          nome: model.nome,
          duracao_estimada: model.duracao_estimada,
          ordem_no_treinamento: model.ordem_no_treinamento,
          tipo_sessao_codigo: model.tipo_sessao_codigo,
          modelo_aeronave: model.modelo_aeronave,
        })),
      },
    });
  }

  const { pairs, unmatched } = pairSimulatorPlanningCandidates(candidates);

  if (dryRun) {
    const previewProposal = (
      proposalCandidates: SimulatorPlanningCandidate[],
      status: SimulatorPlanningStatus,
    ) => {
      const first = proposalCandidates[0];
      return {
        need_id: proposalNeedId(proposalCandidates),
        status,
        qualificacao_tipo_id: first.qualificacaoTipoId,
        qualificacao_codigo: first.qualificacaoCodigo,
        qualificacao_nome: first.qualificacaoNome,
        modelo_aeronave: first.modeloAeronave,
        vencimento_referencia: proposalCandidates
          .map((candidate) => candidate.vencimento)
          .sort()[0],
        janela_tipo: first.janelaTipo,
        janela_inicio: first.janelaInicio,
        janela_fim: first.janelaFim,
        carga_horaria_prevista: first.cargaHoras,
        curriculo: first.snapshot,
        participantes: proposalCandidates.map((candidate) => ({
          funcionario_id: candidate.funcionarioId,
          funcionario_nome: candidate.funcionarioNome,
          funcionario_funcao: candidate.funcao,
          funcionario_quinzena: candidate.quinzenaNumero,
          vencimento: candidate.vencimento,
        })),
      };
    };

    const proposalGroups: Array<{
      candidates: SimulatorPlanningCandidate[];
      status: SimulatorPlanningStatus;
    }> = [
      ...pairs.map((pair) => ({ candidates: [pair.left, pair.right], status: 'PROPOSTO' as const })),
      ...unmatched.map((candidate) => ({
        candidates: [candidate],
        status: 'AGUARDANDO_DISPONIBILIDADE' as const,
      })),
    ];
    const proposals = proposalGroups.map(({ candidates: proposalCandidates, status }) =>
      previewProposal(proposalCandidates, status),
    );

    let caeComparison: unknown = null;
    if (body?.cae_availability !== undefined && body?.cae_availability !== null) {
      const validation = validateAndNormalizeCaeAvailability(body.cae_availability);
      if (!validation.ok) {
        return c.json(
          {
            success: false,
            error: 'Disponibilidade CAE inválida',
            code: 'CAE_AVAILABILITY_INVALID',
            details: validation.errors,
            warnings: validation.warnings,
          },
          400,
        );
      }

      const metadataByNeedId = new Map<
        string,
        { candidates: SimulatorPlanningCandidate[]; proposal: ReturnType<typeof previewProposal> }
      >();
      const needs: CaeBatchPlanningNeed[] = [];
      for (const group of proposalGroups) {
        const first = group.candidates[0];
        const needId = proposalNeedId(group.candidates);
        const proposal = previewProposal(group.candidates, group.status);
        metadataByNeedId.set(needId, { candidates: group.candidates, proposal });
        needs.push({
          id: needId,
          config,
          equipment: first.modeloAeronave,
          expiry_date: group.candidates.map((candidate) => candidate.vencimento).sort()[0],
          planning_start_date: dataReferencia,
          preferred_window_start: first.janelaInicio,
          preferred_window_end: first.janelaFim,
          session_durations_minutes:
            first.modeloAeronave === 'AW139' || first.modeloAeronave === 'SK76'
              ? sessionDurationsFromCandidate(first)
              : [],
        });
      }

      const batch = matchCaeAvailabilityBatch(needs, validation.data.slots);
      const recommendations = await Promise.all(
        batch.matches.map(async (match) => {
          const metadata = metadataByNeedId.get(String(match.need_id));
          if (!metadata) {
            return {
              need_id: match.need_id,
              status: 'INVALID_NEED',
              reasons: ['Metadados internos do planejamento não encontrados.'],
              outside_preferred_window: false,
              selected_slots: [],
              assignments: [],
              conflicts: [],
            };
          }

          let conflicts: Array<Record<string, unknown>> = [];
          if (match.status === 'MATCHED' && match.selected_slots.length > 0) {
            const starts = match.selected_slots.map((slot) => slot.date).sort();
            const ends = match.selected_slots.map((slot) => slot.end_date).sort();
            const broadConflicts = await loadPublishedRosterConflicts({
              db,
              empresaId,
              funcionarioIds: metadata.candidates.map((candidate) => candidate.funcionarioId),
              inicio: starts[0] || null,
              fim: ends.at(-1) || null,
            });
            conflicts = broadConflicts.filter((conflict) => {
              const conflictStart = String(conflict.data_inicio || '').slice(0, 10);
              const conflictEnd = String(conflict.data_fim || conflict.data_inicio || '').slice(0, 10);
              return match.selected_slots.some((slot) =>
                dateRangesOverlap(slot.date, slot.end_date, conflictStart, conflictEnd),
              );
            });
          }

          return {
            ...metadata.proposal,
            status: match.status,
            selected_slots: match.selected_slots,
            assignments: match.assignments,
            outside_preferred_window: match.outside_preferred_window,
            total_required_minutes: match.total_required_minutes,
            total_reserved_minutes: match.total_reserved_minutes,
            unused_reserved_minutes: match.unused_reserved_minutes,
            latest_training_date: match.latest_training_date,
            days_before_expiry: match.days_before_expiry,
            reasons: match.reasons,
            conflicts,
            requires_human_review:
              match.outside_preferred_window ||
              conflicts.length > 0 ||
              validation.warnings.length > 0 ||
              match.status !== 'MATCHED',
          };
        }),
      );

      caeComparison = {
        mode: 'PREVIEW_ONLY',
        data_referencia: dataReferencia,
        availability_warnings: validation.warnings,
        recommendations,
        remaining_slots: batch.remaining_slots,
        summary: {
          total_needs: recommendations.length,
          matched: recommendations.filter((item) => item.status === 'MATCHED').length,
          insufficient: recommendations.filter(
            (item) => item.status === 'INSUFFICIENT_AVAILABILITY',
          ).length,
          invalid_needs: recommendations.filter((item) => item.status === 'INVALID_NEED').length,
          with_conflicts: recommendations.filter((item) => item.conflicts.length > 0).length,
          outside_preferred_window: recommendations.filter(
            (item) => item.outside_preferred_window,
          ).length,
        },
      };
    }

    return c.json({
      success: true,
      data: {
        dry_run: true,
        candidatos: candidates.length,
        pares: pairs.length,
        pendencias: unmatched.length,
        preservados: preservedQualificationKeys.size,
        registros_criados: 0,
        margem_dias: margemDias,
        politica_janela: politicaJanela,
        propostas: proposals,
        cae_comparison: caeComparison,
      },
    });
  }

  const runMarker = new Date().toISOString();
  const autoStatuses = ['PROPOSTO', 'AGUARDANDO_DISPONIBILIDADE', 'REPLANEJAR'];
  const statusPlaceholders = autoStatuses.map(() => '?').join(', ');

  // O matcher já escolheu o melhor slot CAE (mais próximo do vencimento, nunca
  // após o vencimento) quando cae_availability é fornecido — persistimos
  // exatamente esse slot no snapshot em vez de deixar a proposta sem slot.
  const caeSlotByGroupKey = new Map<string, InsertProposalCaeSlot>();
  if (body?.cae_availability !== undefined && body?.cae_availability !== null) {
    const validation = validateAndNormalizeCaeAvailability(body.cae_availability);
    if (!validation.ok) {
      return c.json(
        {
          success: false,
          error: 'Disponibilidade CAE inválida',
          code: 'CAE_AVAILABILITY_INVALID',
          details: validation.errors,
          warnings: validation.warnings,
        },
        400,
      );
    }
    const persistGroups: Array<{ candidates: SimulatorPlanningCandidate[] }> = [
      ...pairs.map((pair) => ({ candidates: [pair.left, pair.right] })),
      ...unmatched.map((candidate) => ({ candidates: [candidate] })),
    ];
    const groupByNeedId = new Map<string, SimulatorPlanningCandidate[]>();
    const needs: CaeBatchPlanningNeed[] = persistGroups.map((group) => {
      const first = group.candidates[0];
      const needId = proposalNeedId(group.candidates);
      groupByNeedId.set(needId, group.candidates);
      return {
        id: needId,
        config,
        equipment: first.modeloAeronave,
        expiry_date: group.candidates.map((candidate) => candidate.vencimento).sort()[0],
        planning_start_date: dataReferencia,
        preferred_window_start: first.janelaInicio,
        preferred_window_end: first.janelaFim,
        session_durations_minutes:
          first.modeloAeronave === 'AW139' || first.modeloAeronave === 'SK76'
            ? sessionDurationsFromCandidate(first)
            : [],
      };
    });
    const batch = matchCaeAvailabilityBatch(needs, validation.data.slots);
    for (const match of batch.matches) {
      if (match.status !== 'MATCHED' || match.selected_slots.length === 0) continue;
      const slot = match.selected_slots[0];
      caeSlotByGroupKey.set(String(match.need_id), {
        slot_key: [slot.equipment, slot.date, slot.start_time, slot.end_date, slot.end_time].join('|'),
        state: slot.state,
        equipment: slot.equipment,
        date: slot.date,
        start_time: slot.start_time,
        end_time: slot.end_time,
      });
    }
  }

  try {
    await db
      .prepare(
        `UPDATE treinamentos_planejados
            SET deleted_at = ?, updated_at = datetime('now')
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND planejamento_origem = ?
            AND planejamento_editado_manualmente = 0
            AND planejamento_status IN (${statusPlaceholders})
            AND date(planejamento_vencimento_referencia) BETWEEN date(?) AND date(?)`,
      )
      .bind(runMarker, empresaId, PLANNING_ORIGIN, ...autoStatuses, inicio, fim)
      .run();

    let created = 0;
    for (const pair of pairs) {
      await insertProposal({
        db,
        empresaId,
        userId,
        runMarker,
        candidates: [pair.left, pair.right],
        status: 'PROPOSTO',
        margemDias,
        config,
        caeSlot: caeSlotByGroupKey.get(proposalNeedId([pair.left, pair.right])) || null,
      });
      created += 1;
    }
    for (const candidate of unmatched) {
      await insertProposal({
        db,
        empresaId,
        userId,
        runMarker,
        candidates: [candidate],
        status: 'AGUARDANDO_DISPONIBILIDADE',
        margemDias,
        config,
        caeSlot: caeSlotByGroupKey.get(proposalNeedId([candidate])) || null,
      });
      created += 1;
    }

    await insertPlanningAudit({
      db,
      empresaId,
      treinamentoId: null,
      acao: 'RECALCULO_CONCLUIDO',
      status: null,
      after: {
        vencimento_inicio: inicio,
        vencimento_fim: fim,
        margem_dias: margemDias,
        politica_janela: politicaJanela,
        candidatos: candidates.length,
        pares: pairs.length,
        pendencias: unmatched.length,
        preservados: preservedQualificationKeys.size,
      },
      userId,
    });

    return c.json({
      success: true,
      data: {
        candidatos: candidates.length,
        pares: pairs.length,
        pendencias: unmatched.length,
        preservados: preservedQualificationKeys.size,
        registros_criados: created,
        margem_dias: margemDias,
        politica_janela: politicaJanela,
      },
    });
  } catch (error) {
    await db
      .prepare(
        `UPDATE treinamentos_planejados
            SET deleted_at = COALESCE(deleted_at, datetime('now')), updated_at = datetime('now')
          WHERE empresa_id = ?
            AND planejamento_origem = ?
            AND planejamento_recalculado_em = ?
            AND deleted_at IS NULL`,
      )
      .bind(empresaId, PLANNING_ORIGIN, runMarker)
      .run()
      .catch(() => undefined);
    await db
      .prepare(
        `UPDATE treinamentos_planejados
            SET deleted_at = NULL, updated_at = datetime('now')
          WHERE empresa_id = ?
            AND planejamento_origem = ?
            AND deleted_at = ?
            AND planejamento_recalculado_em <> ?`,
      )
      .bind(empresaId, PLANNING_ORIGIN, runMarker, runMarker)
      .run()
      .catch(() => undefined);
    console.error('simulator_future_planning_recalculate_error', error);
    return c.json(
      { success: false, error: 'Falha ao recalcular planejamento; estado anterior restaurado.' },
      500,
    );
  }
});

app.patch('/:id', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaId(c);
  const db = c.env.DB;
  if (!(await planningSchemaReady(db))) {
    return c.json(
      { success: false, error: 'Migration 0460 não aplicada', code: 'PLANNING_SCHEMA_REQUIRED' },
      503,
    );
  }
  const treinamentoId = Number(c.req.param('id'));
  if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scope = buildFuncionarioScopeWhere(access, 'f');
  const existing = await db
    .prepare(
      `SELECT t.*
         FROM treinamentos_planejados t
        WHERE t.id = ?
          AND t.empresa_id = ?
          AND t.deleted_at IS NULL
          AND t.planejamento_origem = ?
          AND EXISTS (
            SELECT 1
              FROM treinamentos_participantes tp
              INNER JOIN funcionarios f
                ON f.id = tp.funcionario_id
               AND f.empresa_id = t.empresa_id
               AND f.deleted_at IS NULL
             WHERE tp.treinamento_id = t.id
               AND ${scope.clause}
          )
        LIMIT 1`,
    )
    .bind(treinamentoId, empresaId, PLANNING_ORIGIN, ...scope.bindings)
    .first<Record<string, unknown>>();
  if (!existing) return c.json({ success: false, error: 'Planejamento não encontrado' }, 404);

  const input = (await c.req.json().catch(() => null)) as PlanningPatch | null;
  if (!input) return c.json({ success: false, error: 'Dados inválidos' }, 400);
  const requestedStatus =
    input.planejamento_status || (String(existing.planejamento_status) as SimulatorPlanningStatus);
  if (!SIMULATOR_PLANNING_STATUSES.includes(requestedStatus)) {
    return c.json({ success: false, error: 'Status de planejamento inválido' }, 400);
  }
  if (input.data_prevista !== undefined && !isIsoDate(input.data_prevista)) {
    return c.json({ success: false, error: 'data_prevista inválida' }, 400);
  }
  if (
    input.janela_inicio !== undefined &&
    input.janela_inicio !== null &&
    !isIsoDate(input.janela_inicio)
  ) {
    return c.json({ success: false, error: 'janela_inicio inválida' }, 400);
  }
  if (input.janela_fim !== undefined && input.janela_fim !== null && !isIsoDate(input.janela_fim)) {
    return c.json({ success: false, error: 'janela_fim inválida' }, 400);
  }
  if (
    input.margem_dias !== undefined &&
    input.margem_dias !== null &&
    (!Number.isInteger(input.margem_dias) || input.margem_dias < 0 || input.margem_dias > 365)
  ) {
    return c.json({ success: false, error: 'margem_dias inválida' }, 400);
  }

  if (input.participante_ids) {
    const participantIds = [...new Set(input.participante_ids.map(Number))];
    if (
      participantIds.length < 1 ||
      participantIds.length > 2 ||
      participantIds.some((id) => !Number.isInteger(id) || id <= 0)
    ) {
      return c.json({ success: false, error: 'Informe um ou dois participantes válidos' }, 400);
    }
    for (const funcionarioId of participantIds) {
      await assertFuncionarioInScope(db, empresaId, funcionarioId, access);
    }
    const placeholders = participantIds.map(() => '?').join(', ');
    const eligible = await db
      .prepare(
        `SELECT DISTINCT f.id, f.quinzena
           FROM funcionarios f
           INNER JOIN qualificacoes_historico qh
             ON qh.funcionario_id = f.id
            AND qh.empresa_id = f.empresa_id
            AND qh.deleted_at IS NULL
            AND qh.qualificacao_id = ?
            AND qh.data_vencimento IS NOT NULL
          WHERE f.empresa_id = ?
            AND f.deleted_at IS NULL
            AND COALESCE(f.ativo, 1) = 1
            AND f.id IN (${placeholders})`,
      )
      .bind(Number(existing.qualificacao_tipo_id), empresaId, ...participantIds)
      .all<{ id: number; quinzena: string | null }>();
    if ((eligible.results || []).length !== participantIds.length) {
      return c.json(
        { success: false, error: 'Participante sem qualificação compatível com o planejamento' },
        400,
      );
    }
    if (ACTIVE_PAIR_STATUSES.has(requestedStatus) && participantIds.length !== 2) {
      return c.json({ success: false, error: 'Planejamento operacional exige uma dupla' }, 400);
    }
    await db
      .prepare('DELETE FROM treinamentos_participantes WHERE treinamento_id = ?')
      .bind(treinamentoId)
      .run();
    for (const funcionarioId of participantIds) {
      await db
        .prepare(
          `INSERT INTO treinamentos_participantes (
             treinamento_id, funcionario_id, confirmado, presente, aprovado,
             nota, observacoes, created_at, updated_at
           ) VALUES (?, ?, 0, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'))`,
        )
        .bind(treinamentoId, funcionarioId)
        .run();
    }
  }

  const participantCount = await db
    .prepare('SELECT COUNT(*) AS total FROM treinamentos_participantes WHERE treinamento_id = ?')
    .bind(treinamentoId)
    .first<{ total: number }>();
  if (ACTIVE_PAIR_STATUSES.has(requestedStatus) && Number(participantCount?.total || 0) !== 2) {
    return c.json({ success: false, error: 'Planejamento operacional exige uma dupla' }, 400);
  }
  if (requestedStatus === 'REALIZADO' && String(existing.status) !== 'CONCLUIDO') {
    return c.json(
      { success: false, error: 'REALIZADO exige conclusão efetiva registrada no treinamento' },
      409,
    );
  }

  if (requestedStatus === 'AGENDADO') {
    if (!(await tableExists(db, 'treinamentos_dias'))) {
      return c.json(
        { success: false, error: 'Cronograma detalhado de treinamento indisponível' },
        409,
      );
    }
    const snapshot = parseNullableJson(String(existing.planejamento_snapshot_json || '')) as {
      curriculum?: { estimated_session_count?: unknown };
    } | null;
    const expectedSessionCount = Number(snapshot?.curriculum?.estimated_session_count || 0);
    if (!Number.isInteger(expectedSessionCount) || expectedSessionCount <= 0) {
      return c.json(
        { success: false, error: 'Currículo sem quantidade de sessões válida para agendamento' },
        409,
      );
    }
    const scheduled = await db
      .prepare(
        `SELECT COUNT(*) AS total
           FROM treinamentos_dias
          WHERE empresa_id = ?
            AND treinamento_id = ?
            AND deleted_at IS NULL`,
      )
      .bind(empresaId, treinamentoId)
      .first<{ total: number }>();
    if (!hasCompleteSimulatorSessionSchedule(expectedSessionCount, Number(scheduled?.total || 0))) {
      return c.json(
        {
          success: false,
          error: `Cadastre as ${expectedSessionCount} sessão(ões) no cronograma antes de marcar como AGENDADO`,
          code: 'SIMULATOR_SESSIONS_REQUIRED',
          expected_sessions: expectedSessionCount,
          scheduled_sessions: Number(scheduled?.total || 0),
        },
        409,
      );
    }
  }

  const currentPlanningStatus = String(existing.planejamento_status) as SimulatorPlanningStatus;
  if (
    currentPlanningStatus === 'AGENDADO' &&
    ['PROPOSTO', 'PLANEJADO', 'REPLANEJAR', 'AGUARDANDO_DISPONIBILIDADE'].includes(requestedStatus)
  ) {
    await db
      .prepare(
        "UPDATE treinamentos_planejados SET status = 'CANCELADO', updated_at = datetime('now') WHERE id = ? AND empresa_id = ?",
      )
      .bind(treinamentoId, empresaId)
      .run();
    await syncTreinamentoPlanejadoIntegration({ db, empresaId, treinamentoId });
  }

  const legacyStatus =
    requestedStatus === 'REALIZADO' ? 'CONCLUIDO' : mapPlanningStatusToLegacy(requestedStatus);
  const dataPrevista = input.data_prevista ?? String(existing.data_prevista);
  const janelaInicio =
    input.janela_inicio !== undefined
      ? input.janela_inicio
      : (existing.planejamento_janela_inicio as string | null);
  const janelaFim =
    input.janela_fim !== undefined
      ? input.janela_fim
      : (existing.planejamento_janela_fim as string | null);
  if (janelaInicio && janelaFim && janelaInicio > janelaFim) {
    return c.json({ success: false, error: 'Janela de planejamento inválida' }, 400);
  }
  const conflicts = await loadPublishedRosterConflicts({
    db,
    empresaId,
    funcionarioIds: await db
      .prepare(
        'SELECT funcionario_id FROM treinamentos_participantes WHERE treinamento_id = ? ORDER BY funcionario_id',
      )
      .bind(treinamentoId)
      .all<{ funcionario_id: number }>()
      .then((result) => (result.results || []).map((row) => Number(row.funcionario_id))),
    inicio: janelaInicio,
    fim: janelaFim,
  });

  await db
    .prepare(
      `UPDATE treinamentos_planejados
          SET planejamento_status = ?,
              status = ?,
              data_prevista = ?,
              data_inicio = ?,
              data_fim = ?,
              planejamento_janela_inicio = ?,
              planejamento_janela_fim = ?,
              planejamento_margem_dias = ?,
              observacoes = ?,
              planejamento_conflitos_json = ?,
              planejamento_editado_manualmente = 1,
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(
      requestedStatus,
      legacyStatus,
      dataPrevista,
      janelaInicio,
      janelaFim,
      janelaInicio,
      janelaFim,
      input.margem_dias !== undefined ? input.margem_dias : existing.planejamento_margem_dias,
      input.observacoes !== undefined ? input.observacoes : existing.observacoes,
      JSON.stringify(conflicts),
      treinamentoId,
      empresaId,
    )
    .run();

  if (
    requestedStatus === 'AGENDADO' ||
    requestedStatus === 'CANCELADO' ||
    currentPlanningStatus === 'AGENDADO'
  ) {
    await syncTreinamentoPlanejadoIntegration({ db, empresaId, treinamentoId });
  }

  const after = await db
    .prepare(
      `SELECT id, empresa_id, qualificacao_tipo_id, data_prevista, data_inicio, data_fim,
              status, titulo, observacoes, carga_horaria_prevista, planejamento_status,
              planejamento_origem, planejamento_chave, planejamento_editado_manualmente,
              planejamento_vencimento_referencia, planejamento_margem_dias,
              planejamento_quinzena_numero, planejamento_politica_janela,
              planejamento_tipo_janela, planejamento_janela_inicio, planejamento_janela_fim,
              planejamento_modelo_aeronave, planejamento_conflitos_json,
              planejamento_snapshot_json, planejamento_recalculado_em,
              planejamento_recalculado_por, created_at, updated_at, deleted_at
         FROM treinamentos_planejados
        WHERE id = ? AND empresa_id = ?`,
    )
    .bind(treinamentoId, empresaId)
    .first<Record<string, unknown>>();
  await insertPlanningAudit({
    db,
    empresaId,
    treinamentoId,
    acao: 'EDICAO_MANUAL',
    status: requestedStatus,
    before: existing,
    after,
    userId: contextUserId(c),
  });

  return c.json({ success: true, data: after, conflitos: conflicts });
});



app.post('/:id/recursos', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const treinamentoId = Number(c.req.param('id'));
  if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }
  const body = (await c.req.json().catch(() => null)) as {
    simulator_id?: unknown;
    instructor_id?: unknown;
  } | null;
  if (!body) return c.json({ success: false, error: 'Dados inválidos' }, 400);

  const row = await db
    .prepare(
      `SELECT planejamento_snapshot_json
         FROM treinamentos_planejados
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(treinamentoId, empresaId)
    .first<{ planejamento_snapshot_json: string | null }>();
  if (!row) return c.json({ success: false, error: 'Planejamento não encontrado' }, 404);
  if (!row.planejamento_snapshot_json) {
    return c.json({ success: false, error: 'Snapshot ausente' }, 400);
  }

  let snapshot: Record<string, unknown>;
  try {
    snapshot = JSON.parse(row.planejamento_snapshot_json);
  } catch {
    return c.json({ success: false, error: 'Snapshot inválido' }, 400);
  }

  if (body.simulator_id !== undefined) {
    const simulatorId = Number(body.simulator_id);
    if (!Number.isInteger(simulatorId) || simulatorId <= 0) {
      return c.json({ success: false, error: 'simulator_id inválido' }, 400);
    }
    const equipment = String((snapshot.participants as Array<{ equipment?: unknown }> | undefined)?.[0]?.equipment || '');
    const resolution = await resolveGlobalSimulatorForEquipment(db, equipment);
    const validIds = new Set(
      resolution.status === 'AMBIGUOUS' ? resolution.candidates.map((item) => item.id) : [],
    );
    if (resolution.status === 'RESOLVED' && resolution.simulator_id !== simulatorId) {
      return c.json(
        { success: false, error: 'simulator_id não corresponde ao catálogo compatível com este planejamento' },
        400,
      );
    }
    if (resolution.status === 'AMBIGUOUS' && !validIds.has(simulatorId)) {
      return c.json(
        { success: false, error: 'simulator_id não está entre os simuladores compatíveis com este planejamento' },
        400,
      );
    }
    if (resolution.status === 'NEEDS_ASSIGNMENT') {
      return c.json(
        { success: false, error: 'Nenhum simulador compatível encontrado no catálogo' },
        400,
      );
    }
    snapshot.simulator_id = simulatorId;
  }

  if (body.instructor_id !== undefined) {
    const instructorId = Number(body.instructor_id);
    const eligibility = await validateInstructorAssignment(db, empresaId, instructorId);
    if (!eligibility.eligible) {
      return c.json({ success: false, error: eligibility.reason, code: 'INSTRUCTOR_NOT_ELIGIBLE' }, 400);
    }
    snapshot.instructor_id = instructorId;
  }

  const isPositiveInt = (value: unknown): boolean => Number.isInteger(value) && Number(value) > 0;
  const pending: string[] = [];
  if (!isPositiveInt(snapshot.simulator_id)) pending.push('simulator_id');
  if (!isPositiveInt(snapshot.instructor_id)) pending.push('instructor_id');
  snapshot.resource_assignment = { pending, complete: pending.length === 0 };

  await db
    .prepare(
      `UPDATE treinamentos_planejados
          SET planejamento_snapshot_json = ?, updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(JSON.stringify(snapshot), treinamentoId, empresaId)
    .run();

  return c.json({
    success: true,
    data: {
      simulator_id: snapshot.simulator_id ?? null,
      instructor_id: snapshot.instructor_id ?? null,
      resource_assignment: snapshot.resource_assignment,
    },
  });
});

app.post('/:id/submeter', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = Number(c.req.param('id'));
  const userId = contextUserId(c);
  if (!userId) return c.json({ success: false, error: 'Usuário não autenticado' }, 401);

  const result = await executeSimulatorPlanningApproval({
    db,
    empresaId,
    planningId: id,
    action: 'SUBMIT',
    userId,
    userName: String(c.get('userName' as never)) || String(userId),
  });

  return c.json(result, result.success ? 200 : 400);
});

app.post('/:id/aprovar', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = Number(c.req.param('id'));
  const userId = contextUserId(c);
  if (!userId) return c.json({ success: false, error: 'Usuário não autenticado' }, 401);

  const result = await executeSimulatorPlanningApproval({
    db,
    empresaId,
    planningId: id,
    action: 'APPROVE',
    userId,
    userName: String(c.get('userName' as never)) || String(userId),
  });

  return c.json(result, result.success ? 200 : 400);
});

app.post('/:id/devolver', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = Number(c.req.param('id'));
  const userId = contextUserId(c);
  if (!userId) return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
  const body = (await c.req.json().catch(() => null)) as { observacoes?: unknown } | null;
  const observacoes = typeof body?.observacoes === 'string' ? body.observacoes.trim() : '';
  if (!observacoes) {
    return c.json({ success: false, error: 'Informe observações para devolução' }, 400);
  }

  const result = await executeSimulatorPlanningApproval({
    db,
    empresaId,
    planningId: id,
    action: 'RETURN',
    userId,
    userName: String(c.get('userName' as never)) || String(userId),
    observations: observacoes,
  });

  return c.json(result, result.success ? 200 : 400);
});

app.post('/:id/materializar', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = Number(c.req.param('id'));
  const userId = contextUserId(c);
  if (!userId) return c.json({ success: false, error: 'Usuário não autenticado' }, 401);

  const result = await materializeSimulatorPlanning({
    db,
    empresaId,
    planningId: id,
    userId,
  });

  return c.json(result, result.success ? 200 : 400);
});

app.get('/:id/recursos/candidatos', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const treinamentoId = Number(c.req.param('id'));
  if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }
  const row = await db
    .prepare(
      `SELECT planejamento_snapshot_json
         FROM treinamentos_planejados
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(treinamentoId, empresaId)
    .first<{ planejamento_snapshot_json: string | null }>();
  if (!row) return c.json({ success: false, error: 'Planejamento não encontrado' }, 404);

  let snapshot: Record<string, unknown> = {};
  try {
    snapshot = row.planejamento_snapshot_json ? JSON.parse(row.planejamento_snapshot_json) : {};
  } catch {
    snapshot = {};
  }
  const equipment = String((snapshot.participants as Array<{ equipment?: unknown }> | undefined)?.[0]?.equipment || '');
  const simulatorResolution = await resolveGlobalSimulatorForEquipment(db, equipment);

  const columns = await db.prepare("PRAGMA table_info('funcionarios')").all<{ name: string }>();
  const hasIsInstrutor = (columns.results || []).some((r) => r.name === 'is_instrutor');
  const instructors = await db
    .prepare(
      `SELECT id, nome
         FROM funcionarios
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND COALESCE(ativo, 1) = 1
          ${hasIsInstrutor ? 'AND is_instrutor = 1' : ''}
        ORDER BY nome`,
    )
    .bind(empresaId)
    .all<{ id: number; nome: string }>();

  return c.json({
    success: true,
    data: {
      simulator_resolution: simulatorResolution,
      eligible_instructors: instructors.results || [],
      current: {
        simulator_id: snapshot.simulator_id ?? null,
        instructor_id: snapshot.instructor_id ?? null,
        resource_assignment: snapshot.resource_assignment ?? null,
      },
    },
  });
});

app.get('/:id/auditoria', async (c) => {
  const empresaId = getEmpresaId(c);
  const treinamentoId = Number(c.req.param('id'));
  if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scope = buildFuncionarioScopeWhere(access, 'f');
  const allowed = await c.env.DB.prepare(
    `SELECT t.id
         FROM treinamentos_planejados t
        WHERE t.id = ?
          AND t.empresa_id = ?
          AND t.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM treinamentos_participantes tp
            INNER JOIN funcionarios f ON f.id = tp.funcionario_id AND f.empresa_id = t.empresa_id
            WHERE tp.treinamento_id = t.id AND ${scope.clause}
          )`,
  )
    .bind(treinamentoId, empresaId, ...scope.bindings)
    .first<{ id: number }>();
  if (!allowed) return c.json({ success: false, error: 'Planejamento não encontrado' }, 404);
  const rows = await c.env.DB.prepare(
    `SELECT id, acao, planejamento_status, snapshot_antes_json,
              snapshot_depois_json, realizado_por, realizado_em
         FROM simulador_planejamento_auditoria
        WHERE empresa_id = ? AND treinamento_planejado_id = ?
        ORDER BY datetime(realizado_em) DESC, id DESC
        LIMIT 100`,
  )
    .bind(empresaId, treinamentoId)
    .all<Record<string, unknown>>();
  return c.json({ success: true, data: rows.results || [] });
});

export default app;
