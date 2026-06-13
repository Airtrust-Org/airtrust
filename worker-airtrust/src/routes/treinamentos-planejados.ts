import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { forbidden } from '../middleware/error-handler';
import { syncTreinamentoPlanejadoIntegration } from '../services/treinamentos-planejados-integration';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../utils/auditoria';
import {
  filterRequestedSetorIdsByAccess,
  getEmployeeSectorAccess,
  type EmployeeSectorAccess,
} from '../services/employee-sector-access';
import {
  buildConvocacaoPreview,
  getEmailConvocacaoConfig,
  listConvocacaoHistory,
  listGestoresCopia,
  sendConvocacaoInBatches,
} from '../services/treinamentos-convocacao-email';
import { normalizeTrainingStatusForCompatibility } from '../lib/status/status-codes';

interface TreinamentoSchemaCapabilities {
  hasModalidade: boolean;
  hasCodigoTurma: boolean;
  hasDataInicio: boolean;
  hasDataFim: boolean;
  hasBase: boolean;
  hasSala: boolean;
  hasEquipamentoDescricao: boolean;
  hasLimiteParticipantes: boolean;
  hasInstrutoresTable: boolean;
  hasDiasTable: boolean;
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  try {
    const row = await db
      .prepare('SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = ? AND name = ?')
      .bind('table', tableName)
      .first<{ cnt: number }>();
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

async function hasColumn(db: D1Database, table: string, column: string): Promise<boolean> {
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
    return (results || []).some((col: any) => col?.name === column);
  } catch {
    return false;
  }
}

function parseRequestedSetorIds(rawSetorId?: string | null, rawSetorIds?: string | null): number[] {
  const values: string[] = [];
  if (rawSetorId) values.push(rawSetorId);
  if (rawSetorIds) {
    values.push(
      ...rawSetorIds
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
}

function resolveScopedSetorIds(
  access: EmployeeSectorAccess,
  requestedSetorIds: number[],
): number[] | null {
  if (requestedSetorIds.length > 0) {
    const allowedRequested =
      access.mode === 'all'
        ? requestedSetorIds
        : filterRequestedSetorIdsByAccess(requestedSetorIds, access);

    if (allowedRequested.length !== requestedSetorIds.length) {
      forbidden('Filtro de setor fora do escopo permitido', 'SETOR_FORA_DO_ESCOPO');
    }

    return allowedRequested;
  }

  if (access.mode === 'all') {
    return null;
  }

  return access.setorIds;
}

// Module-level cache for schema capabilities — avoids 10+ PRAGMA calls per request.
// Worker isolates restart regularly so this never holds stale data for long.
let _capabilitiesCache: TreinamentoSchemaCapabilities | null = null;

async function detectTreinamentoSchemaCapabilities(
  db: D1Database,
): Promise<TreinamentoSchemaCapabilities> {
  if (_capabilitiesCache) return _capabilitiesCache;
  const [hasModalidade, hasCodigoTurma, hasDataInicio, hasDataFim, hasBase, hasSala, hasEquipamentoDescricao, hasLimiteParticipantes] =
    await Promise.all([
      hasColumn(db, 'treinamentos_planejados', 'modalidade'),
      hasColumn(db, 'treinamentos_planejados', 'codigo_turma'),
      hasColumn(db, 'treinamentos_planejados', 'data_inicio'),
      hasColumn(db, 'treinamentos_planejados', 'data_fim'),
      hasColumn(db, 'treinamentos_planejados', 'base'),
      hasColumn(db, 'treinamentos_planejados', 'sala'),
      hasColumn(db, 'treinamentos_planejados', 'equipamento_descricao'),
      hasColumn(db, 'treinamentos_planejados', 'limite_participantes'),
    ]);
  const [hasInstrutoresTable, hasDiasTable] = await Promise.all([
    tableExists(db, 'treinamentos_instrutores'),
    tableExists(db, 'treinamentos_dias'),
  ]);
  _capabilitiesCache = {
    hasModalidade,
    hasCodigoTurma,
    hasDataInicio,
    hasDataFim,
    hasBase,
    hasSala,
    hasEquipamentoDescricao,
    hasLimiteParticipantes,
    hasInstrutoresTable,
    hasDiasTable,
  };
  return _capabilitiesCache;
}

const treinamentosPlanejadosRoutes = new Hono<{ Bindings: Env }>();

treinamentosPlanejadosRoutes.use('*', auth());

const STATUS_VALUES = [
  'PLANEJADO',
  'CONFIRMADO',
  'EM_ANDAMENTO',
  'CONCLUIDO',
  'CANCELADO',
] as const;

const MODALIDADE_VALUES = [
  'TEORICO',
  'SALA',
  'PRATICO',
  'MISTO',
  'EAD',
  'SIMULADOR',
  'AERONAVE',
  'VOO',
  'CHEQUE',
  'OUTRO',
] as const;
const RESULTADO_VALUES = ['APROVADO', 'REPROVADO', 'INCOMPLETO', 'CANCELADO'] as const;
const diaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  hora_fim: z.string().regex(/^\d{2}:\d{2}$/).default('17:00'),
  local: z.string().trim().max(200).optional().nullable(),
  instrutor_id: z.number().int().positive().optional().nullable(),
  simulador_id: z.number().int().positive().optional().nullable(),
  aeronave_id: z.number().int().positive().optional().nullable(),
  sessao_id: z.number().int().positive().optional().nullable(),
  observacoes: z.string().trim().max(4000).optional().nullable(),
});

const eventoSchema = z.object({
  qualificacao_tipo_id: z.number().int().positive(),
  titulo: z.string().trim().min(3).max(200),
  descricao: z.string().trim().max(4000).optional().nullable(),
  observacoes: z.string().trim().max(4000).optional().nullable(),
  local: z.string().trim().max(200).optional().nullable(),
  data_prevista: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_inicio: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  hora_fim: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  instrutor_id: z.number().int().positive().optional().nullable(),
  carga_horaria_prevista: z.number().int().min(0).max(1000).optional().nullable(),
  status: z.enum(STATUS_VALUES).optional().default('PLANEJADO'),
  participante_ids: z.array(z.number().int().positive()).optional().default([]),
  codigo_turma: z.string().trim().max(80).optional().nullable(),
  modalidade: z.enum(MODALIDADE_VALUES).optional().default('TEORICO'),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  base: z.string().trim().max(120).optional().nullable(),
  sala: z.string().trim().max(120).optional().nullable(),
  equipamento_descricao: z.string().trim().max(200).optional().nullable(),
  limite_participantes: z.number().int().min(1).max(1000).optional().nullable(),
  tipo_treinamento: z.enum(['INICIAL', 'RECORRENTE']).optional(),
  instrutor_ids: z.array(z.number().int().positive()).optional().default([]),
  dias: z.array(diaSchema).min(1).max(90).optional(),
});

const eventoPatchSchema = eventoSchema.partial().extend({
  participante_ids: z.array(z.number().int().positive()).optional(),
});

const participantesSchema = z.object({
  participante_ids: z.array(z.number().int().positive()).default([]),
});

const presencaSchema = z.object({
  funcionario_id: z.number().int().positive(),
  confirmado: z.boolean().optional(),
  presente: z.boolean().nullable().optional(),
  aprovado: z.boolean().nullable().optional(),
  nota: z.number().min(0).max(100).nullable().optional(),
  observacoes: z.string().trim().max(4000).nullable().optional(),
});

const conclusaoParticipanteSchema = z.object({
  funcionario_id: z.number().int().positive(),
  resultado: z.enum(RESULTADO_VALUES),
  data_conclusao_efetiva: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  nota: z.number().min(0).max(100).nullable().optional(),
  conceito: z.string().trim().max(100).nullable().optional(),
  observacoes: z.string().trim().max(4000).nullable().optional(),
});

const presencaDiaSchema = z.object({
  funcionario_id: z.number().int().positive(),
  status: z.enum(['PENDENTE', 'PRESENTE', 'AUSENTE', 'PARCIAL', 'DISPENSADO']),
  minutos_presentes: z.number().int().min(0).max(1440).nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

type EventoRow = {
  id: number;
  empresa_id: number;
  qualificacao_tipo_id: number;
  qualificacao_nome: string | null;
  qualificacao_codigo: string | null;
  data_prevista: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  status: (typeof STATUS_VALUES)[number];
  instrutor_id: number | null;
  instrutor_nome: string | null;
  instrutor_guerra: string | null;
  local: string | null;
  carga_horaria_prevista: number | null;
  titulo: string | null;
  descricao: string | null;
  observacoes: string | null;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  codigo_turma: string | null;
  modalidade: (typeof MODALIDADE_VALUES)[number] | null;
  data_inicio: string | null;
  data_fim: string | null;
  base: string | null;
  sala: string | null;
  equipamento_descricao: string | null;
  limite_participantes: number | null;
  convocados_total: number | string | null;
  confirmados_total: number | string | null;
  presentes_total: number | string | null;
};

type ParticipanteRow = {
  id: number;
  treinamento_id: number;
  funcionario_id: number;
  funcionario_nome: string | null;
  funcionario_guerra: string | null;
  funcionario_matricula: string | null;
  funcionario_email: string | null;
  funcionario_setor: string | null;
  funcionario_funcao: string | null;
  confirmado: number | null;
  presente: number | null;
  aprovado: number | null;
  nota: number | null;
  observacoes: string | null;
  qualificacao_historico_id: number | null;
  status_participacao: string | null;
  resultado: string | null;
  conceito: string | null;
  data_conclusao_efetiva: string | null;
  concluido_em: string | null;
};

type DiaRow = {
  id: number;
  treinamento_id: number;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  local: string | null;
  instrutor_id: number | null;
  instrutor_nome: string | null;
  simulador_id: number | null;
  aeronave_id: number | null;
  sessao_id: number | null;
  status: string;
  observacoes: string | null;
  presencas?: Array<{
    participante_id: number;
    funcionario_id: number;
    status: string;
    minutos_presentes: number | null;
    observacoes: string | null;
  }>;
};

type InstrutorRow = {
  treinamento_id: number;
  funcionario_id: number;
  nome: string | null;
  guerra: string | null;
  papel: string;
  principal: number;
};

type AuditoriaRow = {
  id: number;
  acao: string;
  registro_id: string;
  usuario_nome: string | null;
  dados_antes: string | null;
  dados_depois: string | null;
  created_at: string;
};

// 'TREINAMENTOS' is a virtual combined filter: TURMA + QUALIFICACAO_PLANEJADA (excludes SIMULADOR)
type ConsolidatedSource = 'TURMA' | 'SIMULADOR' | 'QUALIFICACAO_PLANEJADA' | 'TREINAMENTOS';

type PlannedQualificationRow = {
  id: number;
  empresa_id: number;
  funcionario_id: number;
  funcionario_nome: string | null;
  funcionario_guerra: string | null;
  funcionario_matricula: string | null;
  funcionario_email: string | null;
  funcionario_setor: string | null;
  funcionario_funcao: string | null;
  qualificacao_tipo_id: number;
  qualificacao_nome: string | null;
  qualificacao_codigo: string | null;
  data_planejada: string | null;
  status: string | null;
  instrutor_nome: string | null;
  observacoes: string | null;
};

type SimulatorSessionRow = {
  id: number;
  empresa_id: number;
  data_prevista: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  status: string | null;
  tipo_dispositivo: string | null;
  simulador_id: number | null;
  aeronave_id: number | null;
  sessao_nome: string | null;
  instrutor_id: number | null;
  instrutor_nome: string | null;
  instrutor_guerra: string | null;
  examinador_id: number | null;
  examinador_nome: string | null;
  equipamento_nome: string | null;
  observacoes: string | null;
  linked_qualificacao_historico_id: number | null;
  linked_qualificacao_tipo_id: number | null;
  linked_qualificacao_nome: string | null;
  linked_qualificacao_codigo: string | null;
};

type SimulatorParticipantRow = {
  sessao_id: number;
  funcionario_id: number;
  funcionario_nome: string | null;
  funcionario_guerra: string | null;
  funcionario_matricula: string | null;
  funcionario_email: string | null;
  funcionario_setor: string | null;
  funcionario_funcao: string | null;
  qualificacao_historico_id: number | null;
};

type ConsolidatedTrainingItem = Omit<
  ReturnType<typeof serializeEvento>,
  'source' | 'source_id' | 'source_route' | 'source_label' | 'read_only'
> & {
  source: ConsolidatedSource;
  source_id: number;
  sessao_id?: number | null;
  source_route: string | null;
  source_label: string;
  read_only: boolean;
};

const SOURCE_VALUES = ['TURMA', 'SIMULADOR', 'QUALIFICACAO_PLANEJADA', 'TREINAMENTOS'] as const;

async function resolveGestoresCcByParticipantes(
  db: D1Database,
  empresaId: number,
  participantes: Array<{ funcionario_id: number }> | null | undefined,
  gestoresCcIdsInput: number[] | null,
) {
  const gestoresCcAtivos = (await listGestoresCopia(db, empresaId, true)).filter(
    (gestor) => gestor.ativo,
  );

  const funcionarioIds = Array.from(
    new Set(
      (participantes || [])
        .map((participante) => Number(participante?.funcionario_id || 0))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  );

  let gestoresBase = gestoresCcAtivos;

  if (funcionarioIds.length > 0) {
    const placeholders = funcionarioIds.map(() => '?').join(',');
    const rows = await db
      .prepare(
        `
        SELECT DISTINCT g.id
          FROM funcionarios f
          INNER JOIN setores_gestores sg
            ON sg.setor_id = f.setor_id
           AND sg.empresa_id = f.empresa_id
           AND sg.deleted_at IS NULL
           AND sg.ativo = 1
          INNER JOIN notificacoes_convocacao_cc_gestores g
            ON g.id = sg.gestor_id
           AND g.empresa_id = f.empresa_id
           AND g.deleted_at IS NULL
           AND g.ativo = 1
         WHERE f.empresa_id = ?
           AND f.deleted_at IS NULL
           AND f.id IN (${placeholders})
        `,
      )
      .bind(empresaId, ...funcionarioIds)
      .all<{ id: number }>();

    const idsFromSetores = Array.from(
      new Set((rows.results || []).map((row) => Number(row.id || 0)).filter((id) => id > 0)),
    );

    // Se houver mapeamento setor->gestor, restringe estritamente a ele.
    if (idsFromSetores.length > 0) {
      gestoresBase = gestoresCcAtivos.filter((gestor) => idsFromSetores.includes(gestor.id));
    }
  }

  return gestoresCcIdsInput === null
    ? gestoresBase
    : gestoresBase.filter((gestor) => gestoresCcIdsInput.includes(gestor.id));
}

function toNullableText(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toSqlBoolean(value: boolean | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value ? 1 : 0;
}

function normalizePositiveIds(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function collectResourceIdsFromDias(
  dias?: Array<{ simulador_id?: number | null; aeronave_id?: number | null; sessao_id?: number | null }>,
): { simuladorIds: number[]; aeronaveIds: number[]; sessaoIds: number[] } {
  const list = dias || [];
  return {
    simuladorIds: normalizePositiveIds(list.map((dia) => Number(dia.simulador_id || 0))),
    aeronaveIds: normalizePositiveIds(list.map((dia) => Number(dia.aeronave_id || 0))),
    sessaoIds: normalizePositiveIds(list.map((dia) => Number(dia.sessao_id || 0))),
  };
}

async function validateResourceTenant(
  db: D1Database,
  empresaId: number,
  table: 'simuladores' | 'aeronaves' | 'simulador_agendamentos',
  ids: number[],
  label: string,
): Promise<string | null> {
  const unique = normalizePositiveIds(ids);
  if (unique.length === 0) return null;
  const placeholders = unique.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT id FROM ${table}
        WHERE empresa_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
    )
    .bind(empresaId, ...unique)
    .all<{ id: number }>();
  const valid = new Set((rows.results || []).map((row) => Number(row.id)));
  if (unique.some((id) => !valid.has(id))) {
    return `${label} inexistente ou pertencente a outro tenant`;
  }
  return null;
}

async function validateTrainingReferences(params: {
  db: D1Database;
  empresaId: number;
  qualificacaoTipoId?: number;
  participanteIds?: number[];
  instrutorIds?: number[];
  simuladorIds?: number[];
  aeronaveIds?: number[];
  sessaoIds?: number[];
}): Promise<string | null> {
  const { db, empresaId } = params;
  if (params.qualificacaoTipoId) {
    const qualification = await db
      .prepare(
        `SELECT id
           FROM qualificacoes_tipos
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND COALESCE(ativo, 1) = 1`,
      )
      .bind(params.qualificacaoTipoId, empresaId)
      .first<{ id: number }>();
    if (!qualification) {
      return 'Modelo de qualificação inexistente, inativo ou pertencente a outro tenant';
    }
  }

  const participantIds = normalizePositiveIds(params.participanteIds || []);
  const instructorIds = normalizePositiveIds(params.instrutorIds || []);
  const employeeIds = normalizePositiveIds([...participantIds, ...instructorIds]);
  if (employeeIds.length > 0) {
    const placeholders = employeeIds.map(() => '?').join(', ');
    const rows = await db
      .prepare(
        `SELECT id
           FROM funcionarios
          WHERE empresa_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
      )
      .bind(empresaId, ...employeeIds)
      .all<{ id: number }>();
    const validIds = new Set((rows.results || []).map((row) => Number(row.id)));
    if (participantIds.some((id) => !validIds.has(id))) {
      return 'Participante inexistente ou pertencente a outro tenant';
    }
    if (instructorIds.some((id) => !validIds.has(id))) {
      return 'Instrutor inexistente ou pertencente a outro tenant';
    }
  }

  // B2: recursos referenciados nos dias da turma também precisam pertencer ao tenant.
  const resourceError =
    (await validateResourceTenant(db, empresaId, 'simuladores', params.simuladorIds || [], 'Simulador')) ||
    (await validateResourceTenant(db, empresaId, 'aeronaves', params.aeronaveIds || [], 'Aeronave')) ||
    (await validateResourceTenant(
      db,
      empresaId,
      'simulador_agendamentos',
      params.sessaoIds || [],
      'Sessão de simulador',
    ));
  if (resourceError) return resourceError;

  return null;
}

function buildMonthRange(mes?: string | null): { inicio: string; fim: string } | null {
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return null;
  const [year, month] = mes.split('-').map(Number);
  const inicio = new Date(year, month - 1, 1);
  const fim = new Date(year, month, 0);

  const format = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  return {
    inicio: format(inicio),
    fim: format(fim),
  };
}

async function replaceParticipantes(
  db: D1Database,
  treinamentoId: number,
  participanteIds: number[],
): Promise<void> {
  const ids = normalizePositiveIds(participanteIds);
  const existing = await db
    .prepare('SELECT id, funcionario_id FROM treinamentos_participantes WHERE treinamento_id = ?')
    .bind(treinamentoId)
    .all<{ id: number; funcionario_id: number }>();

  const existingRows = existing.results || [];
  const existingIds = new Set(
    existingRows.map((row) => Number(row.funcionario_id)).filter((value) => value > 0),
  );

  const rowsToDelete = existingRows.filter((row) => !ids.includes(Number(row.funcionario_id)));
  if (rowsToDelete.length > 0) {
    // M4: o D1 não aplica FK ON DELETE CASCADE em runtime; removemos as presenças
    // explicitamente para não deixar órfãos em treinamentos_presencas. Os vínculos de
    // qualificação emitida (treinamentos_qualificacoes_geradas) são preservados por
    // rastreabilidade — o upsert idempotente (A4) lida com reentradas sem bloquear
    // reemissão.
    const participanteRowIds = rowsToDelete.map((row) => Number(row.id)).filter((v) => v > 0);
    if (participanteRowIds.length > 0) {
      const presencaPlaceholders = participanteRowIds.map(() => '?').join(', ');
      await db
        .prepare(
          `DELETE FROM treinamentos_presencas WHERE participante_id IN (${presencaPlaceholders})`,
        )
        .bind(...participanteRowIds)
        .run();
    }

    const funcionarioIdsToDelete = rowsToDelete
      .map((row) => Number(row.funcionario_id))
      .filter((v) => v > 0);
    const placeholders = funcionarioIdsToDelete.map(() => '?').join(', ');
    await db
      .prepare(
        `DELETE FROM treinamentos_participantes WHERE treinamento_id = ? AND funcionario_id IN (${placeholders})`,
      )
      .bind(treinamentoId, ...funcionarioIdsToDelete)
      .run();
  }

  const idsToInsert = ids.filter((id) => !existingIds.has(id));
  for (const funcionarioId of idsToInsert) {
    await db
      .prepare(
        `INSERT INTO treinamentos_participantes (
          treinamento_id, funcionario_id, confirmado, presente, aprovado, nota, observacoes, created_at, updated_at
        ) VALUES (?, ?, 0, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'))`,
      )
      .bind(treinamentoId, funcionarioId)
      .run();
  }
}

async function replaceDias(
  db: D1Database,
  empresaId: number,
  treinamentoId: number,
  dias: z.infer<typeof diaSchema>[],
): Promise<void> {
  const uniqueDias = [...new Map(dias.map((dia) => [dia.data, dia])).values()].sort((a, b) =>
    a.data.localeCompare(b.data),
  );
  const datas = uniqueDias.map((dia) => dia.data);

  if (datas.length > 0) {
    const placeholders = datas.map(() => '?').join(', ');
    await db
      .prepare(
        `UPDATE treinamentos_dias
            SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE empresa_id = ? AND treinamento_id = ? AND deleted_at IS NULL
            AND data NOT IN (${placeholders})`,
      )
      .bind(empresaId, treinamentoId, ...datas)
      .run();
  }

  for (const dia of uniqueDias) {
    await db
      .prepare(
        `INSERT INTO treinamentos_dias
          (empresa_id, treinamento_id, data, hora_inicio, hora_fim, local, instrutor_id,
           simulador_id, aeronave_id, sessao_id, status, observacoes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO', ?, datetime('now'), datetime('now'))
         ON CONFLICT(treinamento_id, data) DO UPDATE SET
           empresa_id = excluded.empresa_id,
           hora_inicio = excluded.hora_inicio,
           hora_fim = excluded.hora_fim,
           local = excluded.local,
           instrutor_id = excluded.instrutor_id,
           simulador_id = excluded.simulador_id,
           aeronave_id = excluded.aeronave_id,
           sessao_id = excluded.sessao_id,
           status = 'ATIVO',
           observacoes = excluded.observacoes,
           deleted_at = NULL,
           updated_at = datetime('now')`,
      )
      .bind(
        empresaId,
        treinamentoId,
        dia.data,
        dia.hora_inicio,
        dia.hora_fim,
        toNullableText(dia.local),
        dia.instrutor_id ?? null,
        dia.simulador_id ?? null,
        dia.aeronave_id ?? null,
        dia.sessao_id ?? null,
        toNullableText(dia.observacoes),
      )
      .run();
  }
}

async function replaceInstrutores(
  db: D1Database,
  empresaId: number,
  treinamentoId: number,
  instrutorIds: number[],
  principalId?: number | null,
): Promise<void> {
  const ids = normalizePositiveIds(instrutorIds);
  await db
    .prepare('DELETE FROM treinamentos_instrutores WHERE empresa_id = ? AND treinamento_id = ?')
    .bind(empresaId, treinamentoId)
    .run();

  for (const funcionarioId of ids) {
    await db
      .prepare(
        `INSERT INTO treinamentos_instrutores
          (empresa_id, treinamento_id, funcionario_id, papel, principal, created_at, updated_at)
         VALUES (?, ?, ?, 'INSTRUTOR', ?, datetime('now'), datetime('now'))`,
      )
      .bind(empresaId, treinamentoId, funcionarioId, funcionarioId === principalId ? 1 : 0)
      .run();
  }
}

async function loadParticipanteLinks(
  db: D1Database,
  treinamentoId: number,
): Promise<Array<{ funcionario_id: number; qualificacao_historico_id: number | null }>> {
  const rows = await db
    .prepare(
      `SELECT funcionario_id, qualificacao_historico_id
         FROM treinamentos_participantes
        WHERE treinamento_id = ?`,
    )
    .bind(treinamentoId)
    .all<{ funcionario_id: number; qualificacao_historico_id: number | null }>();

  return rows.results || [];
}

async function loadParticipantesByTreinamento(
  db: D1Database,
  empresaId: number,
  treinamentoIds: number[],
  scopedSetorIds: number[] | null,
): Promise<Map<number, ParticipanteRow[]>> {
  const map = new Map<number, ParticipanteRow[]>();
  if (treinamentoIds.length === 0) return map;

  const placeholders = treinamentoIds.map(() => '?').join(', ');
  const query = `SELECT tp.id,
                        tp.treinamento_id,
                        tp.funcionario_id,
                        f.nome AS funcionario_nome,
                        f.guerra AS funcionario_guerra,
                        f.matricula AS funcionario_matricula,
                        f.email AS funcionario_email,
                        f.setor AS funcionario_setor,
                        f.funcao AS funcionario_funcao,
                        tp.confirmado,
                        tp.presente,
                        tp.aprovado,
                        tp.nota,
                        tp.observacoes,
                        tp.qualificacao_historico_id,
                        tp.status_participacao,
                        tp.resultado,
                        tp.conceito,
                        tp.data_conclusao_efetiva,
                        tp.concluido_em
                   FROM treinamentos_participantes tp
                   INNER JOIN treinamentos_planejados t ON t.id = tp.treinamento_id AND t.deleted_at IS NULL
                   LEFT JOIN funcionarios f ON f.id = tp.funcionario_id AND f.deleted_at IS NULL
                  WHERE t.empresa_id = ?
                    AND tp.treinamento_id IN (${placeholders})
                    ${
                      scopedSetorIds === null
                        ? ''
                        : scopedSetorIds.length === 0
                          ? 'AND 1 = 0'
                          : `AND f.setor_id IN (${scopedSetorIds.map(() => '?').join(', ')})`
                    }
                  ORDER BY COALESCE(f.nome, ''), tp.funcionario_id`;

  const rows = await db
    .prepare(query)
    .bind(empresaId, ...treinamentoIds, ...(scopedSetorIds === null ? [] : scopedSetorIds))
    .all<ParticipanteRow>();

  for (const row of rows.results || []) {
    const treinamentoId = Number(row.treinamento_id);
    const current = map.get(treinamentoId) || [];
    current.push(row);
    map.set(treinamentoId, current);
  }

  return map;
}

async function loadDiasByTreinamento(
  db: D1Database,
  empresaId: number,
  treinamentoIds: number[],
): Promise<Map<number, DiaRow[]>> {
  const map = new Map<number, DiaRow[]>();
  if (treinamentoIds.length === 0) return map;
  const placeholders = treinamentoIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT td.id, td.treinamento_id, td.data, td.hora_inicio, td.hora_fim, td.local,
              td.instrutor_id, f.nome AS instrutor_nome, td.simulador_id, td.aeronave_id,
              td.sessao_id, td.status, td.observacoes
         FROM treinamentos_dias td
         INNER JOIN treinamentos_planejados t
           ON t.id = td.treinamento_id AND t.empresa_id = ? AND t.deleted_at IS NULL
         LEFT JOIN funcionarios f ON f.id = td.instrutor_id AND f.deleted_at IS NULL
        WHERE td.empresa_id = ? AND td.treinamento_id IN (${placeholders})
          AND td.deleted_at IS NULL
        ORDER BY td.data, td.hora_inicio, td.id`,
    )
    .bind(empresaId, empresaId, ...treinamentoIds)
    .all<DiaRow>();
  for (const row of rows.results || []) {
    const current = map.get(Number(row.treinamento_id)) || [];
    current.push(row);
    map.set(Number(row.treinamento_id), current);
  }

  const fallbackRows = await db
    .prepare(
      `SELECT t.id * -1 AS id, t.id AS treinamento_id,
              COALESCE(t.data_prevista, t.data_inicio, t.data_fim) AS data,
              COALESCE(t.hora_inicio, '08:00') AS hora_inicio,
              COALESCE(t.hora_fim, '17:00') AS hora_fim,
              t.local,
              t.instrutor_id,
              f.nome AS instrutor_nome,
              t.simulador_id,
              t.aeronave_id,
              t.sessao_id,
              CASE
                WHEN UPPER(COALESCE(t.status, 'PLANEJADO')) = 'CANCELADO' THEN 'CANCELADO'
                ELSE 'ATIVO'
              END AS status,
              t.observacoes
         FROM treinamentos_planejados t
         LEFT JOIN funcionarios f ON f.id = t.instrutor_id AND f.deleted_at IS NULL
        WHERE t.empresa_id = ? AND t.id IN (${placeholders})
          AND t.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
              FROM treinamentos_dias td
             WHERE td.treinamento_id = t.id
               AND td.empresa_id = t.empresa_id
               AND td.deleted_at IS NULL
          )
        ORDER BY data, hora_inicio, treinamento_id`,
    )
    .bind(empresaId, ...treinamentoIds)
    .all<DiaRow>();
  for (const row of fallbackRows.results || []) {
    const current = map.get(Number(row.treinamento_id)) || [];
    current.push(row);
    map.set(Number(row.treinamento_id), current);
  }

  const presencas = await db
    .prepare(
      `SELECT td.treinamento_id, pr.treinamento_dia_id, pr.participante_id,
              tp.funcionario_id, pr.status, pr.minutos_presentes, pr.observacoes
         FROM treinamentos_presencas pr
         INNER JOIN treinamentos_dias td
           ON td.id = pr.treinamento_dia_id AND td.empresa_id = ? AND td.deleted_at IS NULL
         INNER JOIN treinamentos_participantes tp
           ON tp.id = pr.participante_id AND tp.treinamento_id = td.treinamento_id
        WHERE pr.empresa_id = ? AND td.treinamento_id IN (${placeholders})`,
    )
    .bind(empresaId, empresaId, ...treinamentoIds)
    .all<{
      treinamento_id: number;
      treinamento_dia_id: number;
      participante_id: number;
      funcionario_id: number;
      status: string;
      minutos_presentes: number | null;
      observacoes: string | null;
    }>();
  const presencasByDia = new Map<number, NonNullable<DiaRow['presencas']>>();
  for (const row of presencas.results || []) {
    const current = presencasByDia.get(Number(row.treinamento_dia_id)) || [];
    current.push({
      participante_id: Number(row.participante_id),
      funcionario_id: Number(row.funcionario_id),
      status: row.status,
      minutos_presentes:
        row.minutos_presentes === null ? null : Number(row.minutos_presentes),
      observacoes: row.observacoes,
    });
    presencasByDia.set(Number(row.treinamento_dia_id), current);
  }
  for (const days of map.values()) {
    for (const day of days) {
      day.presencas = presencasByDia.get(Number(day.id)) || [];
    }
  }
  return map;
}

async function loadInstrutoresByTreinamento(
  db: D1Database,
  empresaId: number,
  treinamentoIds: number[],
): Promise<Map<number, InstrutorRow[]>> {
  const map = new Map<number, InstrutorRow[]>();
  if (treinamentoIds.length === 0) return map;
  const placeholders = treinamentoIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT ti.treinamento_id, ti.funcionario_id, f.nome, f.guerra, ti.papel, ti.principal
         FROM treinamentos_instrutores ti
         INNER JOIN treinamentos_planejados t
           ON t.id = ti.treinamento_id AND t.empresa_id = ? AND t.deleted_at IS NULL
         LEFT JOIN funcionarios f ON f.id = ti.funcionario_id AND f.deleted_at IS NULL
        WHERE ti.empresa_id = ? AND ti.treinamento_id IN (${placeholders})
        ORDER BY ti.principal DESC, COALESCE(f.nome, ''), ti.funcionario_id`,
    )
    .bind(empresaId, empresaId, ...treinamentoIds)
    .all<InstrutorRow>();
  for (const row of rows.results || []) {
    const current = map.get(Number(row.treinamento_id)) || [];
    current.push(row);
    map.set(Number(row.treinamento_id), current);
  }

  const fallbackRows = await db
    .prepare(
      `SELECT t.id AS treinamento_id, t.instrutor_id AS funcionario_id, f.nome, f.guerra,
              'INSTRUTOR' AS papel, 1 AS principal
         FROM treinamentos_planejados t
         LEFT JOIN funcionarios f ON f.id = t.instrutor_id AND f.deleted_at IS NULL
        WHERE t.empresa_id = ? AND t.id IN (${placeholders})
          AND t.deleted_at IS NULL
          AND t.instrutor_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
              FROM treinamentos_instrutores ti
             WHERE ti.treinamento_id = t.id
               AND ti.empresa_id = t.empresa_id
          )
        ORDER BY COALESCE(f.nome, ''), t.instrutor_id`,
    )
    .bind(empresaId, ...treinamentoIds)
    .all<InstrutorRow>();
  for (const row of fallbackRows.results || []) {
    const current = map.get(Number(row.treinamento_id)) || [];
    current.push(row);
    map.set(Number(row.treinamento_id), current);
  }
  return map;
}

function serializeParticipante(row: ParticipanteRow) {
  return {
    id: Number(row.id),
    treinamento_id: Number(row.treinamento_id),
    funcionario_id: Number(row.funcionario_id),
    funcionario_nome: row.funcionario_nome,
    funcionario_guerra: row.funcionario_guerra,
    funcionario_matricula: row.funcionario_matricula,
    funcionario_email: row.funcionario_email,
    funcionario_setor: row.funcionario_setor,
    funcionario_funcao: row.funcionario_funcao,
    confirmado: Number(row.confirmado || 0) === 1,
    presente:
      row.presente === null || row.presente === undefined ? null : Number(row.presente) === 1,
    aprovado:
      row.aprovado === null || row.aprovado === undefined ? null : Number(row.aprovado) === 1,
    nota: row.nota === null || row.nota === undefined ? null : Number(row.nota),
    observacoes: row.observacoes,
    qualificacao_historico_id: row.qualificacao_historico_id,
    status_participacao: row.status_participacao || 'MATRICULADO',
    resultado: row.resultado,
    conceito: row.conceito,
    data_conclusao_efetiva: row.data_conclusao_efetiva,
    concluido_em: row.concluido_em,
  };
}

function serializeEvento(
  row: EventoRow,
  participantes: ParticipanteRow[],
  dias: DiaRow[],
  instrutores: InstrutorRow[],
) {
  return {
    id: Number(row.id),
    empresa_id: Number(row.empresa_id),
    qualificacao_tipo_id: Number(row.qualificacao_tipo_id),
    qualificacao_nome: row.qualificacao_nome,
    qualificacao_codigo: row.qualificacao_codigo,
    data_prevista: row.data_prevista,
    hora_inicio: row.hora_inicio,
    hora_fim: row.hora_fim,
    status: row.status,
    instrutor_id: row.instrutor_id,
    instrutor_nome: row.instrutor_nome,
    instrutor_guerra: row.instrutor_guerra,
    local: row.local,
    carga_horaria_prevista:
      row.carga_horaria_prevista === null || row.carga_horaria_prevista === undefined
        ? null
        : Number(row.carga_horaria_prevista),
    titulo: row.titulo,
    descricao: row.descricao,
    observacoes: row.observacoes,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    codigo_turma: row.codigo_turma,
    modalidade: row.modalidade || 'TEORICO',
    data_inicio: row.data_inicio || row.data_prevista,
    data_fim: row.data_fim || row.data_prevista,
    base: row.base,
    sala: row.sala,
    equipamento_descricao: row.equipamento_descricao,
    limite_participantes: row.limite_participantes,
    convocados_total: Number(row.convocados_total || 0),
    confirmados_total: Number(row.confirmados_total || 0),
    presentes_total: Number(row.presentes_total || 0),
    participantes: participantes.map(serializeParticipante),
    dias,
    instrutores: instrutores.map((instrutor) => ({
      funcionario_id: Number(instrutor.funcionario_id),
      nome: instrutor.nome,
      guerra: instrutor.guerra,
      papel: instrutor.papel,
      principal: Number(instrutor.principal || 0) === 1,
    })),
    source: 'TURMA' as const,
    source_id: Number(row.id),
    source_route: `/treinamentos/planejados`,
    source_label: 'Turma',
    read_only: false,
  };
}

const VIRTUAL_ID_OFFSETS = {
  QUALIFICACAO_PLANEJADA: 1000000000,
  SIMULADOR: 2000000000,
} as const;

function toVirtualId(source: 'QUALIFICACAO_PLANEJADA' | 'SIMULADOR', sourceId: number): number {
  return -1 * (VIRTUAL_ID_OFFSETS[source] + sourceId);
}

function normalizeSourceFilter(raw: string | null | undefined): ConsolidatedSource | null {
  const normalized = String(raw || '')
    .trim()
    .toUpperCase();
  return SOURCE_VALUES.includes(normalized as ConsolidatedSource)
    ? (normalized as ConsolidatedSource)
    : null;
}

function sortConsolidatedItems(items: ConsolidatedTrainingItem[]): ConsolidatedTrainingItem[] {
  return [...items].sort((left, right) => {
    const leftKey = `${left.data_prevista} ${left.hora_inicio || '99:99'} ${left.id}`;
    const rightKey = `${right.data_prevista} ${right.hora_inicio || '99:99'} ${right.id}`;
    return leftKey.localeCompare(rightKey);
  });
}

async function listTreinamentosPlanejadosBase(
  db: D1Database,
  empresaId: number,
  filters: {
    status?: string | null;
    inicio?: string | null;
    fim?: string | null;
    instrutorId?: string | null;
    funcionarioId?: string | null;
    busca?: string | null;
    treinamentoId?: number | null;
    scopedSetorIds?: number[] | null;
  },
  capabilities: TreinamentoSchemaCapabilities,
) {
  const migration0390Cols = [
    capabilities.hasCodigoTurma ? 't.codigo_turma' : 'NULL AS codigo_turma',
    capabilities.hasModalidade ? 't.modalidade' : "'TEORICO' AS modalidade",
    capabilities.hasDataInicio ? 't.data_inicio' : 't.data_prevista AS data_inicio',
    capabilities.hasDataFim ? 't.data_fim' : 't.data_prevista AS data_fim',
    capabilities.hasBase ? 't.base' : 'NULL AS base',
    capabilities.hasSala ? 't.sala' : 'NULL AS sala',
    capabilities.hasEquipamentoDescricao ? 't.equipamento_descricao' : 'NULL AS equipamento_descricao',
    capabilities.hasLimiteParticipantes ? 't.limite_participantes' : 'NULL AS limite_participantes',
  ].join(',\n                    ');

  let sql = `SELECT t.id,
                    t.empresa_id,
                    t.qualificacao_tipo_id,
                    qt.nome AS qualificacao_nome,
                    qt.codigo AS qualificacao_codigo,
                    t.data_prevista,
                    t.hora_inicio,
                    t.hora_fim,
                    t.status,
                    t.instrutor_id,
                    instr.nome AS instrutor_nome,
                    instr.guerra AS instrutor_guerra,
                    t.local,
                    t.carga_horaria_prevista,
                    t.titulo,
                    t.descricao,
                    t.observacoes,
                    t.created_by,
                    t.created_at,
                    t.updated_at,
                    ${migration0390Cols},
                    COUNT(tp.id) AS convocados_total,
                    SUM(CASE WHEN COALESCE(tp.confirmado, 0) = 1 THEN 1 ELSE 0 END) AS confirmados_total,
                    SUM(CASE WHEN COALESCE(tp.presente, 0) = 1 THEN 1 ELSE 0 END) AS presentes_total
               FROM treinamentos_planejados t
               LEFT JOIN qualificacoes_tipos qt ON qt.id = t.qualificacao_tipo_id AND qt.deleted_at IS NULL
               LEFT JOIN funcionarios instr ON instr.id = t.instrutor_id AND instr.deleted_at IS NULL
               LEFT JOIN treinamentos_participantes tp ON tp.treinamento_id = t.id
              WHERE t.empresa_id = ?
                AND t.deleted_at IS NULL`;

  const params: unknown[] = [empresaId];

  if (filters.treinamentoId) {
    sql += ' AND t.id = ?';
    params.push(filters.treinamentoId);
  }
  if (filters.status) {
    sql += ' AND t.status = ?';
    params.push(filters.status);
  }
  if (filters.inicio && filters.fim && capabilities.hasDiasTable) {
    // Include trainings with days within range, even if data_prevista is outside
    sql += ` AND (
      (date(t.data_prevista) >= date(?) AND date(t.data_prevista) <= date(?))
      OR EXISTS (
        SELECT 1 FROM treinamentos_dias td
        WHERE td.treinamento_id = t.id
          AND td.status = 'ATIVO'
          AND date(td.data) >= date(?)
          AND date(td.data) <= date(?)
      )
    )`;
    params.push(filters.inicio, filters.fim, filters.inicio, filters.fim);
  } else {
    if (filters.inicio) {
      sql += ' AND date(t.data_prevista) >= date(?)';
      params.push(filters.inicio);
    }
    if (filters.fim) {
      sql += ' AND date(t.data_prevista) <= date(?)';
      params.push(filters.fim);
    }
  }
  if (filters.instrutorId) {
    sql += ' AND t.instrutor_id = ?';
    params.push(Number(filters.instrutorId));
  }
  if (filters.funcionarioId) {
    sql +=
      ' AND EXISTS (SELECT 1 FROM treinamentos_participantes tp2 WHERE tp2.treinamento_id = t.id AND tp2.funcionario_id = ?)';
    params.push(Number(filters.funcionarioId));
  }
  if (filters.busca) {
    const busca = `%${filters.busca.trim().toUpperCase()}%`;
    sql += ` AND (
      UPPER(COALESCE(t.titulo, '')) LIKE ? OR
      UPPER(COALESCE(t.local, '')) LIKE ? OR
      UPPER(COALESCE(qt.nome, '')) LIKE ? OR
      UPPER(COALESCE(instr.nome, '')) LIKE ?
    )`;
    params.push(busca, busca, busca, busca);
  }
  if (filters.scopedSetorIds !== null && filters.scopedSetorIds !== undefined) {
    if (filters.scopedSetorIds.length === 0) {
      sql += ' AND 1 = 0';
    } else {
      const placeholders = filters.scopedSetorIds.map(() => '?').join(', ');
      sql += ` AND EXISTS (SELECT 1 FROM treinamentos_participantes tp3 INNER JOIN funcionarios f3 ON f3.id = tp3.funcionario_id AND f3.deleted_at IS NULL WHERE tp3.treinamento_id = t.id AND f3.setor_id IN (${placeholders}))`;
      params.push(...filters.scopedSetorIds);
    }
  }

  sql += ` GROUP BY t.id
           ORDER BY date(t.data_prevista) ASC, COALESCE(t.hora_inicio, '00:00') ASC, t.id DESC
           LIMIT 400`;

  const rows = await db
    .prepare(sql)
    .bind(...params)
    .all<EventoRow>();

  const ids = (rows.results || []).map((row) => Number(row.id));
  const [participantes, dias, instrutores] = await Promise.all([
    loadParticipantesByTreinamento(db, empresaId, ids, filters.scopedSetorIds ?? null),
    capabilities.hasDiasTable
      ? loadDiasByTreinamento(db, empresaId, ids)
      : Promise.resolve(new Map<number, DiaRow[]>()),
    capabilities.hasInstrutoresTable
      ? loadInstrutoresByTreinamento(db, empresaId, ids)
      : Promise.resolve(new Map<number, InstrutorRow[]>()),
  ]);

  return (rows.results || []).map((row) =>
    serializeEvento(
      row,
      participantes.get(Number(row.id)) || [],
      dias.get(Number(row.id)) || [],
      instrutores.get(Number(row.id)) || [],
    ),
  );
}

async function loadStandalonePlannedQualificationItems(
  db: D1Database,
  empresaId: number,
  filters: {
    status?: string | null;
    inicio?: string | null;
    fim?: string | null;
    funcionarioId?: string | null;
    busca?: string | null;
    scopedSetorIds?: number[] | null;
  },
): Promise<ConsolidatedTrainingItem[]> {
  if (filters.status && normalizeTrainingStatusForCompatibility(filters.status) !== 'PLANEJADO') {
    return [];
  }

  let sql = `SELECT qh.id,
                    qh.empresa_id,
                    qh.funcionario_id,
                    f.nome AS funcionario_nome,
                    f.guerra AS funcionario_guerra,
                    f.matricula AS funcionario_matricula,
                    f.email AS funcionario_email,
                    f.setor AS funcionario_setor,
                    f.funcao AS funcionario_funcao,
                    qt.id AS qualificacao_tipo_id,
                    qt.nome AS qualificacao_nome,
                    COALESCE(qh.qualificacao_codigo, qt.codigo) AS qualificacao_codigo,
                    qh.data_conclusao AS data_planejada,
                    qh.status,
                    qh.instrutor AS instrutor_nome,
                    qh.observacoes
               FROM qualificacoes_historico qh
               INNER JOIN funcionarios f
                  ON f.id = qh.funcionario_id
                 AND f.deleted_at IS NULL
                 AND UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'
               LEFT JOIN qualificacoes_tipos qt
                 ON qt.id = qh.qualificacao_id
                AND qt.deleted_at IS NULL
              WHERE qh.empresa_id = ?
                AND qh.deleted_at IS NULL
                AND COALESCE(qh.renovada, 0) = 0
                AND date(COALESCE(qh.data_conclusao, '')) IS NOT NULL
                AND UPPER(COALESCE(qh.status, '')) IN ('PLANEJADA', 'PLANEJADO')
                AND NOT EXISTS (
                  SELECT 1
                    FROM simulador_agendamentos sa
                   WHERE sa.id = qh.sessao_id
                     AND sa.empresa_id = qh.empresa_id
                     AND sa.deleted_at IS NULL
                )
                AND NOT EXISTS (
                  SELECT 1
                    FROM treinamentos_participantes tp
                    INNER JOIN treinamentos_planejados t
                      ON t.id = tp.treinamento_id
                     AND t.empresa_id = qh.empresa_id
                     AND t.deleted_at IS NULL
                   WHERE tp.qualificacao_historico_id = qh.id
                )`;

  const params: unknown[] = [empresaId];
  if (filters.inicio) {
    sql += ' AND date(qh.data_conclusao) >= date(?)';
    params.push(filters.inicio);
  }
  if (filters.fim) {
    sql += ' AND date(qh.data_conclusao) <= date(?)';
    params.push(filters.fim);
  }
  if (filters.funcionarioId) {
    sql += ' AND qh.funcionario_id = ?';
    params.push(Number(filters.funcionarioId));
  }
  if (filters.busca) {
    const busca = `%${filters.busca.trim().toUpperCase()}%`;
    sql += ` AND (
      UPPER(COALESCE(f.nome, '')) LIKE ? OR
      UPPER(COALESCE(qt.nome, '')) LIKE ? OR
      UPPER(COALESCE(qh.qualificacao_codigo, qt.codigo, '')) LIKE ? OR
      UPPER(COALESCE(qh.observacoes, '')) LIKE ?
    )`;
    params.push(busca, busca, busca, busca);
  }
  if (filters.scopedSetorIds !== null && filters.scopedSetorIds !== undefined) {
    if (filters.scopedSetorIds.length === 0) {
      sql += ' AND 1 = 0';
    } else {
      sql += ` AND f.setor_id IN (${filters.scopedSetorIds.map(() => '?').join(', ')})`;
      params.push(...filters.scopedSetorIds);
    }
  }

  sql += ' ORDER BY date(qh.data_conclusao) ASC, qh.id ASC LIMIT 400';

  const rows = await db.prepare(sql).bind(...params).all<PlannedQualificationRow>();

  return (rows.results || []).map((row) => {
    const itemId = toVirtualId('QUALIFICACAO_PLANEJADA', Number(row.id));
    return {
      id: itemId,
      empresa_id: Number(row.empresa_id),
      qualificacao_tipo_id: Number(row.qualificacao_tipo_id || 0),
      qualificacao_nome: row.qualificacao_nome,
      qualificacao_codigo: row.qualificacao_codigo,
      data_prevista: String(row.data_planejada || '').slice(0, 10),
      hora_inicio: null,
      hora_fim: null,
      status: 'PLANEJADO',
      instrutor_id: null,
      instrutor_nome: row.instrutor_nome,
      instrutor_guerra: null,
      local: null,
      carga_horaria_prevista: null,
      titulo: row.qualificacao_nome || row.qualificacao_codigo || 'Qualificação planejada',
      descricao: row.observacoes,
      observacoes: row.observacoes,
      created_by: null,
      created_at: null,
      updated_at: null,
      codigo_turma: null,
      modalidade: 'OUTRO',
      data_inicio: String(row.data_planejada || '').slice(0, 10),
      data_fim: String(row.data_planejada || '').slice(0, 10),
      base: null,
      sala: null,
      equipamento_descricao: null,
      limite_participantes: 1,
      convocados_total: 1,
      confirmados_total: 0,
      presentes_total: 0,
      participantes: [
        {
          id: itemId,
          treinamento_id: itemId,
          funcionario_id: Number(row.funcionario_id),
          funcionario_nome: row.funcionario_nome,
          funcionario_guerra: row.funcionario_guerra,
          funcionario_matricula: row.funcionario_matricula,
          funcionario_email: row.funcionario_email,
          funcionario_setor: row.funcionario_setor,
          funcionario_funcao: row.funcionario_funcao,
          confirmado: false,
          presente: null,
          aprovado: null,
          nota: null,
          observacoes: row.observacoes,
          qualificacao_historico_id: Number(row.id),
          status_participacao: 'PLANEJADO',
          resultado: null,
          conceito: null,
          data_conclusao_efetiva: null,
          concluido_em: null,
        },
      ],
      dias: [
        {
          id: itemId,
          treinamento_id: itemId,
          data: String(row.data_planejada || '').slice(0, 10),
          hora_inicio: '08:00',
          hora_fim: '17:00',
          local: null,
          instrutor_id: null,
          instrutor_nome: row.instrutor_nome,
          simulador_id: null,
          aeronave_id: null,
          sessao_id: null,
          status: 'ATIVO',
          observacoes: row.observacoes,
          presencas: [],
        },
      ],
      instrutores: [],
      source: 'QUALIFICACAO_PLANEJADA',
      source_id: Number(row.id),
      source_route: `/qualificacoes?id=${Number(row.id)}`,
      source_label: 'Qualificação planejada',
      read_only: true,
    };
  });
}

async function loadSimulatorParticipantsBySessao(
  db: D1Database,
  empresaId: number,
  sessaoIds: number[],
): Promise<Map<number, SimulatorParticipantRow[]>> {
  const map = new Map<number, SimulatorParticipantRow[]>();
  if (sessaoIds.length === 0) return map;

  const placeholders = sessaoIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT sp.sessao_id,
              sp.funcionario_id,
              f.nome AS funcionario_nome,
              f.guerra AS funcionario_guerra,
              f.matricula AS funcionario_matricula,
              f.email AS funcionario_email,
              f.setor AS funcionario_setor,
              f.funcao AS funcionario_funcao,
              qh.id AS qualificacao_historico_id
         FROM sessoes_participantes sp
         INNER JOIN simulador_agendamentos sa
           ON sa.id = sp.sessao_id
          AND sa.empresa_id = ?
          AND sa.deleted_at IS NULL
         LEFT JOIN funcionarios f
           ON f.id = sp.funcionario_id
          AND f.deleted_at IS NULL
         LEFT JOIN qualificacoes_historico qh
           ON qh.sessao_id = sp.sessao_id
          AND qh.funcionario_id = sp.funcionario_id
          AND qh.empresa_id = sa.empresa_id
          AND qh.deleted_at IS NULL
          AND COALESCE(qh.renovada, 0) = 0
        WHERE sp.deleted_at IS NULL
          AND sp.sessao_id IN (${placeholders})
        ORDER BY sp.sessao_id, COALESCE(f.nome, ''), sp.funcionario_id`,
    )
    .bind(empresaId, ...sessaoIds)
    .all<SimulatorParticipantRow>();

  for (const row of rows.results || []) {
    const current = map.get(Number(row.sessao_id)) || [];
    current.push(row);
    map.set(Number(row.sessao_id), current);
  }

  return map;
}

async function loadSimulatorSessionItems(
  db: D1Database,
  empresaId: number,
  filters: {
    status?: string | null;
    inicio?: string | null;
    fim?: string | null;
    instrutorId?: string | null;
    funcionarioId?: string | null;
    busca?: string | null;
  },
): Promise<ConsolidatedTrainingItem[]> {
  const equipamentoExpr = (await hasColumn(db, 'aeronaves', 'matricula'))
    ? 'COALESCE(sim.nome, aer.prefixo, aer.modelo, aer.matricula, sim.modelo)'
    : 'COALESCE(sim.nome, aer.prefixo, aer.modelo, sim.modelo)';

  let sql = `SELECT sa.id,
                    sa.empresa_id,
                    sa.data AS data_prevista,
                    sa.hora_inicio,
                    sa.hora_fim,
                    sa.status,
                    COALESCE(sa.tipo_dispositivo, 'SIMULADOR') AS tipo_dispositivo,
                    sa.simulador_id,
                    sa.aeronave_id,
                    sa.nome AS sessao_nome,
                    sa.instrutor_id,
                    fi.nome AS instrutor_nome,
                    fi.guerra AS instrutor_guerra,
                    sa.examinador_id,
                    fe.nome AS examinador_nome,
                    ${equipamentoExpr} AS equipamento_nome,
                    sa.observacoes,
                    MIN(qh.id) AS linked_qualificacao_historico_id,
                    MIN(qh.qualificacao_id) AS linked_qualificacao_tipo_id,
                    MIN(qt.nome) AS linked_qualificacao_nome,
                    MIN(COALESCE(qh.qualificacao_codigo, qt.codigo)) AS linked_qualificacao_codigo
               FROM simulador_agendamentos sa
               LEFT JOIN funcionarios fi ON fi.id = sa.instrutor_id AND fi.deleted_at IS NULL
               LEFT JOIN funcionarios fe ON fe.id = sa.examinador_id AND fe.deleted_at IS NULL
               LEFT JOIN simuladores sim ON sim.id = sa.simulador_id AND sim.deleted_at IS NULL
               LEFT JOIN aeronaves aer ON aer.id = sa.aeronave_id AND aer.deleted_at IS NULL
               LEFT JOIN qualificacoes_historico qh
                 ON qh.sessao_id = sa.id
                AND qh.empresa_id = sa.empresa_id
                AND qh.deleted_at IS NULL
                AND COALESCE(qh.renovada, 0) = 0
               LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
              WHERE sa.empresa_id = ?
                AND sa.deleted_at IS NULL`;

  const params: unknown[] = [empresaId];
  if (filters.inicio) {
    sql += ' AND date(sa.data) >= date(?)';
    params.push(filters.inicio);
  }
  if (filters.fim) {
    sql += ' AND date(sa.data) <= date(?)';
    params.push(filters.fim);
  }
  if (filters.instrutorId) {
    sql += ' AND sa.instrutor_id = ?';
    params.push(Number(filters.instrutorId));
  }
  if (filters.funcionarioId) {
    sql += ` AND EXISTS (
      SELECT 1
        FROM sessoes_participantes sp2
       WHERE sp2.sessao_id = sa.id
         AND sp2.funcionario_id = ?
         AND sp2.deleted_at IS NULL
    )`;
    params.push(Number(filters.funcionarioId));
  }
  if (filters.busca) {
    const busca = `%${filters.busca.trim().toUpperCase()}%`;
    sql += ` AND (
      UPPER(COALESCE(sa.nome, '')) LIKE ? OR
      UPPER(COALESCE(fi.nome, '')) LIKE ? OR
      UPPER(COALESCE(fe.nome, '')) LIKE ? OR
      UPPER(COALESCE(sim.nome, aer.prefixo, aer.modelo, aer.matricula, sim.modelo, '')) LIKE ?
    )`;
    params.push(busca, busca, busca, busca);
  }

  sql += ` GROUP BY sa.id
           ORDER BY date(sa.data) ASC, COALESCE(sa.hora_inicio, '00:00') ASC, sa.id ASC
           LIMIT 400`;

  const rows = await db.prepare(sql).bind(...params).all<SimulatorSessionRow>();
  const sessaoIds = (rows.results || []).map((row) => Number(row.id));
  const participantesMap = await loadSimulatorParticipantsBySessao(db, empresaId, sessaoIds);

  return (rows.results || []).flatMap((row): ConsolidatedTrainingItem[] => {
      const normalizedStatus = normalizeTrainingStatusForCompatibility(row.status) || 'PLANEJADO';
      if (filters.status && normalizedStatus !== normalizeTrainingStatusForCompatibility(filters.status)) {
        return [];
      }

      const baseParticipantId = toVirtualId('SIMULADOR', Number(row.id));
      const participantesRows = participantesMap.get(Number(row.id)) || [];
      const participantes =
        participantesRows.length > 0
          ? participantesRows.map((participant, index) => ({
              id: baseParticipantId - index,
              treinamento_id: baseParticipantId,
              funcionario_id: Number(participant.funcionario_id),
              funcionario_nome: participant.funcionario_nome,
              funcionario_guerra: participant.funcionario_guerra,
              funcionario_matricula: participant.funcionario_matricula,
              funcionario_email: participant.funcionario_email,
              funcionario_setor: participant.funcionario_setor,
              funcionario_funcao: participant.funcionario_funcao,
              confirmado: true,
              presente: null,
              aprovado: null,
              nota: null,
              observacoes: null,
              qualificacao_historico_id: participant.qualificacao_historico_id,
              status_participacao: 'CONFIRMADO',
              resultado: null,
              conceito: null,
              data_conclusao_efetiva: null,
              concluido_em: null,
            }))
          : [];

      return [{
        id: baseParticipantId,
        empresa_id: Number(row.empresa_id),
        qualificacao_tipo_id: Number(row.linked_qualificacao_tipo_id || 0),
        qualificacao_nome: row.linked_qualificacao_nome,
        qualificacao_codigo: row.linked_qualificacao_codigo,
        data_prevista: row.data_prevista,
        hora_inicio: row.hora_inicio,
        hora_fim: row.hora_fim,
        status: normalizedStatus,
        instrutor_id: row.instrutor_id,
        instrutor_nome: row.instrutor_nome,
        instrutor_guerra: row.instrutor_guerra,
        local: row.equipamento_nome,
        carga_horaria_prevista: null,
        titulo: row.sessao_nome || row.linked_qualificacao_nome || 'Sessão planejada',
        descricao: row.observacoes,
        observacoes: row.observacoes,
        created_by: null,
        created_at: null,
        updated_at: null,
        codigo_turma: null,
        modalidade:
          String(row.tipo_dispositivo || '').toUpperCase() === 'AERONAVE' ? 'AERONAVE' : 'SIMULADOR',
        data_inicio: row.data_prevista,
        data_fim: row.data_prevista,
        base: null,
        sala: null,
        equipamento_descricao: row.equipamento_nome,
        limite_participantes: participantes.length || null,
        convocados_total: participantes.length,
        confirmados_total: participantes.length,
        presentes_total: 0,
        participantes,
        dias: [
          {
            id: baseParticipantId,
            treinamento_id: baseParticipantId,
            data: row.data_prevista,
            hora_inicio: row.hora_inicio || '08:00',
            hora_fim: row.hora_fim || '17:00',
            local: row.equipamento_nome,
            instrutor_id: row.instrutor_id,
            instrutor_nome: row.instrutor_nome,
            simulador_id: row.simulador_id,
            aeronave_id: row.aeronave_id,
            sessao_id: Number(row.id),
            status: normalizedStatus === 'CANCELADO' ? 'CANCELADO' : 'ATIVO',
            observacoes: row.observacoes,
            presencas: [],
          },
        ],
        instrutores: [
          {
            funcionario_id: Number(row.instrutor_id || 0),
            nome: row.instrutor_nome,
            guerra: row.instrutor_guerra,
            papel: 'INSTRUTOR',
            principal: true,
          },
          ...(row.examinador_id
            ? [
                {
                  funcionario_id: Number(row.examinador_id),
                  nome: row.examinador_nome,
                  guerra: null,
                  papel: 'EXAMINADOR',
                  principal: false,
                },
              ]
            : []),
        ].filter((instrutor) => instrutor.funcionario_id > 0),
        source: 'SIMULADOR',
        source_id: Number(row.id),
        sessao_id: Number(row.id),
        source_route: `/simuladores/sessoes/${Number(row.id)}`,
        source_label:
          String(row.tipo_dispositivo || '').toUpperCase() === 'AERONAVE'
            ? 'Sessão em aeronave'
            : 'Sessão de simulador',
        read_only: true,
      }];
    });
}

interface ListEventosDiagnostics {
  turma: 'ok' | 'skipped' | 'error';
  qualificacao_planejada: 'ok' | 'skipped' | 'error';
  simulador: 'ok' | 'skipped' | 'error';
}

async function listEventos(
  db: D1Database,
  empresaId: number,
  filters: {
    status?: string | null;
    inicio?: string | null;
    fim?: string | null;
    instrutorId?: string | null;
    funcionarioId?: string | null;
    busca?: string | null;
    treinamentoId?: number | null;
    source?: string | null;
    scopedSetorIds?: number[] | null;
  },
  capabilities?: TreinamentoSchemaCapabilities,
): Promise<{ items: ConsolidatedTrainingItem[]; diagnostics: ListEventosDiagnostics }> {
  const sourceFilter = normalizeSourceFilter(filters.source);
  const items: ConsolidatedTrainingItem[] = [];
  const diagnostics: ListEventosDiagnostics = {
    turma: 'skipped',
    qualificacao_planejada: 'skipped',
    simulador: 'skipped',
  };

  // TREINAMENTOS = combined filter: TURMA + QUALIFICACAO_PLANEJADA (excludes SIMULADOR)
  const wantTurma = !sourceFilter || sourceFilter === 'TURMA' || sourceFilter === 'TREINAMENTOS';
  const wantQualificacaoPlanejada =
    !sourceFilter || sourceFilter === 'QUALIFICACAO_PLANEJADA' || sourceFilter === 'TREINAMENTOS';
  const wantSimulador = !sourceFilter || sourceFilter === 'SIMULADOR';

  if (wantTurma) {
    try {
      const turmaCapabilities = capabilities || await detectTreinamentoSchemaCapabilities(db);
      items.push(
        ...(await listTreinamentosPlanejadosBase(db, empresaId, filters, turmaCapabilities)),
      );
      diagnostics.turma = 'ok';
    } catch (err) {
      console.error('[listEventos] TURMA source failed:', err);
      diagnostics.turma = 'error';
    }
  }

  if (!filters.treinamentoId && wantQualificacaoPlanejada) {
    try {
      items.push(
        ...(await loadStandalonePlannedQualificationItems(db, empresaId, filters)),
      );
      diagnostics.qualificacao_planejada = 'ok';
    } catch (err) {
      console.error('[listEventos] QUALIFICACAO_PLANEJADA source failed:', err);
      diagnostics.qualificacao_planejada = 'error';
    }
  }

  if (!filters.treinamentoId && wantSimulador) {
    try {
      items.push(
        ...(await loadSimulatorSessionItems(db, empresaId, filters)),
      );
      diagnostics.simulador = 'ok';
    } catch (err) {
      console.error('[listEventos] SIMULADOR source failed:', err);
      diagnostics.simulador = 'error';
    }
  }

  const allFailed =
    diagnostics.turma !== 'ok' &&
    diagnostics.qualificacao_planejada !== 'ok' &&
    diagnostics.simulador !== 'ok';

  if (allFailed && items.length === 0) {
    throw new Error('Todas as fontes de treinamentos falharam');
  }

  return { items: sortConsolidatedItems(items).slice(0, 400), diagnostics };
}

async function loadAuditoriaByTreinamento(
  db: D1Database,
  treinamentoIds: number[],
): Promise<Map<number, AuditoriaRow[]>> {
  const map = new Map<number, AuditoriaRow[]>();
  if (treinamentoIds.length === 0) return map;

  const placeholders = treinamentoIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT id, acao, registro_id, usuario_nome, dados_antes, dados_depois, created_at
         FROM auditoria
        WHERE tabela_afetada = 'treinamentos_planejados'
          AND registro_id IN (${placeholders})
        ORDER BY datetime(created_at) DESC, id DESC`,
    )
    .bind(...treinamentoIds.map(String))
    .all<AuditoriaRow>();

  for (const row of rows.results || []) {
    const treinamentoId = Number(row.registro_id);
    const current = map.get(treinamentoId) || [];
    current.push(row);
    map.set(treinamentoId, current);
  }

  return map;
}

treinamentosPlanejadosRoutes.get('/planejados', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scopedSetorIds = resolveScopedSetorIds(
    access,
    parseRequestedSetorIds(c.req.query('setor_id'), c.req.query('setor_ids')),
  );
  const capabilities = await detectTreinamentoSchemaCapabilities(db);
  const { items, diagnostics } = await listEventos(db, empresaId, {
    status: c.req.query('status'),
    inicio: c.req.query('inicio'),
    fim: c.req.query('fim'),
    instrutorId: c.req.query('instrutor_id'),
    funcionarioId: c.req.query('funcionario_id'),
    busca: c.req.query('busca'),
    source: c.req.query('source'),
    scopedSetorIds,
  }, capabilities);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
    },
    diagnostics: Object.values(diagnostics).some(v => v === 'error') ? diagnostics : undefined,
  });
});

treinamentosPlanejadosRoutes.get('/planejados/calendario', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scopedSetorIds = resolveScopedSetorIds(
    access,
    parseRequestedSetorIds(c.req.query('setor_id'), c.req.query('setor_ids')),
  );
  const monthRange = buildMonthRange(c.req.query('mes'));
  const inicio = c.req.query('inicio') || monthRange?.inicio || null;
  const fim = c.req.query('fim') || monthRange?.fim || null;
  const capabilities = await detectTreinamentoSchemaCapabilities(db);

  const { items } = await listEventos(db, empresaId, {
    status: c.req.query('status'),
    inicio,
    fim,
    instrutorId: c.req.query('instrutor_id'),
    funcionarioId: c.req.query('funcionario_id'),
    busca: c.req.query('busca'),
    source: c.req.query('source'),
    scopedSetorIds,
  }, capabilities);

  return c.json({
    success: true,
    data: {
      periodo: {
        inicio,
        fim,
      },
      items,
    },
  });
});

treinamentosPlanejadosRoutes.get('/planejados/auditoria', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scopedSetorIds = resolveScopedSetorIds(
    access,
    parseRequestedSetorIds(c.req.query('setor_id'), c.req.query('setor_ids')),
  );
  const { items } = await listEventos(db, empresaId, {
    status: c.req.query('status'),
    inicio: c.req.query('inicio'),
    fim: c.req.query('fim'),
    instrutorId: c.req.query('instrutor_id'),
    funcionarioId: c.req.query('funcionario_id'),
    busca: c.req.query('busca'),
    source: c.req.query('source'),
    scopedSetorIds,
  });

  const auditMap = await loadAuditoriaByTreinamento(
    db,
    items.filter((item) => item.source === 'TURMA').map((item) => Number(item.id)),
  );

  const enriched = items.map((item) => ({
    ...item,
    auditoria: (auditMap.get(Number(item.id)) || []).slice(0, 10).map((entry) => ({
      id: entry.id,
      acao: entry.acao,
      usuario_nome: entry.usuario_nome,
      created_at: entry.created_at,
      dados_antes: entry.dados_antes,
      dados_depois: entry.dados_depois,
    })),
  }));

  const resumo = {
    total_eventos: enriched.length,
    total_convocados: enriched.reduce((total, item) => total + item.convocados_total, 0),
    total_confirmados: enriched.reduce((total, item) => total + item.confirmados_total, 0),
    total_presentes: enriched.reduce((total, item) => total + item.presentes_total, 0),
    prontos_para_auditoria: enriched.filter(
      (item) => item.convocados_total > 0 && item.status !== 'CANCELADO',
    ).length,
  };

  return c.json({
    success: true,
    data: {
      items: enriched,
      resumo,
    },
  });
});

treinamentosPlanejadosRoutes.get('/planejados/:id', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const treinamentoId = Number(c.req.param('id'));
  if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  const { items } = await listEventos(db, empresaId, { treinamentoId });
  const item = items[0];
  if (!item) {
    return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
  }

  const auditMap = await loadAuditoriaByTreinamento(db, [treinamentoId]);

  return c.json({
    success: true,
    data: {
      ...item,
      convocacoes_email: await listConvocacaoHistory(db, treinamentoId),
      auditoria: (auditMap.get(treinamentoId) || []).slice(0, 20).map((entry) => ({
        id: entry.id,
        acao: entry.acao,
        usuario_nome: entry.usuario_nome,
        created_at: entry.created_at,
        dados_antes: entry.dados_antes,
        dados_depois: entry.dados_depois,
      })),
    },
  });
});

treinamentosPlanejadosRoutes.post('/planejados', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const parsed = eventoSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
      400,
    );
  }

  const input = parsed.data;
  const participanteIds = normalizePositiveIds(input.participante_ids || []);
  const instrutorIds = normalizePositiveIds([
    ...(input.instrutor_ids || []),
    ...(input.instrutor_id ? [input.instrutor_id] : []),
    ...((input.dias || []).flatMap((dia) => (dia.instrutor_id ? [dia.instrutor_id] : []))),
  ]);
  const referenceError = await validateTrainingReferences({
    db,
    empresaId,
    qualificacaoTipoId: input.qualificacao_tipo_id,
    participanteIds,
    instrutorIds,
    ...collectResourceIdsFromDias(input.dias),
  });
  if (referenceError) {
    return c.json({ success: false, error: referenceError }, 400);
  }
  if (input.data_inicio && input.data_fim && input.data_fim < input.data_inicio) {
    return c.json({ success: false, error: 'A data final deve ser igual ou posterior à inicial' }, 400);
  }
  if (
    input.limite_participantes &&
    participanteIds.length > input.limite_participantes
  ) {
    return c.json({ success: false, error: 'Quantidade de participantes excede o limite da turma' }, 400);
  }
  const dias =
    input.dias && input.dias.length > 0
      ? input.dias
      : [
          {
            data: input.data_prevista,
            hora_inicio: input.hora_inicio || '08:00',
            hora_fim: input.hora_fim || '17:00',
            local: input.local,
            instrutor_id: input.instrutor_id,
          },
        ];
  if (new Set(dias.map((dia) => dia.data)).size !== dias.length) {
    return c.json({ success: false, error: 'Dias efetivos duplicados não são permitidos' }, 400);
  }
  const dataInicio = input.data_inicio || dias[0].data;
  const dataFim = input.data_fim || dias[dias.length - 1].data;
  if (dias.some((dia) => dia.data < dataInicio || dia.data > dataFim)) {
    return c.json({ success: false, error: 'Dia efetivo fora do período da turma' }, 400);
  }
  if (dias.some((dia) => dia.hora_fim <= dia.hora_inicio)) {
    return c.json({ success: false, error: 'O horário final deve ser posterior ao inicial' }, 400);
  }
  const ua = extrairUsuarioAuditoria(c);

  // M12: proteção contra duplo-submit/retry. Sem transação interativa no D1, usamos uma
  // janela curta de deduplicação por chave natural — se uma turma idêntica acabou de ser
  // criada, devolvemos a existente de forma idempotente em vez de duplicar.
  const duplicate = await db
    .prepare(
      `SELECT id FROM treinamentos_planejados
        WHERE empresa_id = ?
          AND qualificacao_tipo_id = ?
          AND data_prevista = ?
          AND COALESCE(titulo, '') = COALESCE(?, '')
          AND deleted_at IS NULL
          AND UPPER(COALESCE(status, 'PLANEJADO')) <> 'CANCELADO'
          AND created_at >= datetime('now', '-20 seconds')
        ORDER BY id DESC LIMIT 1`,
    )
    .bind(empresaId, input.qualificacao_tipo_id, input.data_prevista, input.titulo)
    .first<{ id: number }>();
  if (duplicate?.id) {
    return c.json({ success: true, data: { id: duplicate.id, deduplicated: true } }, 200);
  }

  const result = await db
    .prepare(
      `INSERT INTO treinamentos_planejados (
        empresa_id, qualificacao_tipo_id, data_prevista, hora_inicio, hora_fim, status,
        instrutor_id, local, carga_horaria_prevista, titulo, descricao, observacoes,
        codigo_turma, modalidade, data_inicio, data_fim, base, sala,
        equipamento_descricao, limite_participantes,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      empresaId,
      input.qualificacao_tipo_id,
      input.data_prevista,
      toNullableText(input.hora_inicio),
      toNullableText(input.hora_fim),
      input.status,
      input.instrutor_id ?? null,
      toNullableText(input.local),
      input.carga_horaria_prevista ?? null,
      input.titulo,
      toNullableText(input.descricao),
      toNullableText(input.observacoes),
      toNullableText(input.codigo_turma),
      input.modalidade,
      dataInicio,
      dataFim,
      toNullableText(input.base),
      toNullableText(input.sala),
      toNullableText(input.equipamento_descricao),
      input.limite_participantes ?? null,
      ua.usuario_id ?? null,
    )
    .run();

  const treinamentoId = Number(result.meta.last_row_id || 0);
  try {
    await replaceParticipantes(db, treinamentoId, participanteIds);
    await replaceDias(db, empresaId, treinamentoId, dias);
    await replaceInstrutores(db, empresaId, treinamentoId, instrutorIds, input.instrutor_id);
    await syncTreinamentoPlanejadoIntegration({ db, empresaId, treinamentoId });
  } catch (error) {
    // M12: a criação não é atômica no D1. Em falha de uma etapa, desfazemos o estado
    // parcial (incluindo histórico planejado gerado pela sync) para permitir retry seguro.
    const safeRun = (sql: string, binds: unknown[]) =>
      db
        .prepare(sql)
        .bind(...binds)
        .run()
        .catch(() => undefined);
    await safeRun(
      `DELETE FROM treinamentos_presencas
        WHERE treinamento_dia_id IN (SELECT id FROM treinamentos_dias WHERE treinamento_id = ?)`,
      [treinamentoId],
    );
    await safeRun('DELETE FROM treinamentos_dias WHERE treinamento_id = ? AND empresa_id = ?', [
      treinamentoId,
      empresaId,
    ]);
    await safeRun(
      'DELETE FROM treinamentos_instrutores WHERE treinamento_id = ? AND empresa_id = ?',
      [treinamentoId, empresaId],
    );
    await safeRun('DELETE FROM treinamentos_participantes WHERE treinamento_id = ?', [treinamentoId]);
    await safeRun(
      `DELETE FROM qualificacoes_historico
        WHERE empresa_id = ? AND status = 'PLANEJADA' AND COALESCE(observacoes, '') LIKE ?`,
      [empresaId, `%Origem: Treinamento Planejado #${treinamentoId}%`],
    );
    await safeRun('DELETE FROM treinamentos_planejados WHERE id = ? AND empresa_id = ?', [
      treinamentoId,
      empresaId,
    ]);
    console.error('treinamento_create_partial_rollback', {
      treinamentoId,
      error: (error as Error)?.message,
    });
    return c.json(
      {
        success: false,
        error: 'Falha ao criar a turma; nenhuma alteração foi mantida. Tente novamente.',
      },
      500,
    );
  }

  await registrarAuditoria({
    db,
    tabela: 'treinamentos_planejados',
    acao: 'INSERT',
    registro_id: treinamentoId,
    dados_novos: {
      titulo: input.titulo,
      data_prevista: input.data_prevista,
      status: input.status,
      participante_ids: participanteIds,
    },
    ...ua,
  });

  return c.json(
    {
      success: true,
      data: {
        id: treinamentoId,
      },
    },
    201,
  );
});

treinamentosPlanejadosRoutes.post(
  '/planejados/:id/convocacoes/preview',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const { items } = await listEventos(db, empresaId, { treinamentoId });
    const item = items[0];
    if (!item) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }
    if (!item.data_prevista) {
      return c.json({ success: false, error: 'A turma não possui data definida' }, 400);
    }
    if (item.status === 'CONCLUIDO' || item.status === 'CANCELADO') {
      return c.json({ success: false, error: 'A turma já foi encerrada/concluída' }, 400);
    }
    if (item.participantes.length === 0) {
      return c.json({ success: false, error: 'A turma não possui tripulantes matriculados' }, 400);
    }

    const body = (await c.req.json().catch(() => ({}))) as { gestores_cc_ids?: number[] };
    const gestoresCcIdsInput = Array.isArray(body.gestores_cc_ids)
      ? Array.from(
          new Set(
            body.gestores_cc_ids
              .map((value) => Number(value || 0))
              .filter((value) => Number.isFinite(value) && value > 0),
          ),
        )
      : null;

    const config = await getEmailConvocacaoConfig(db, empresaId);
    const gestoresCc = await resolveGestoresCcByParticipantes(
      db,
      empresaId,
      item.participantes,
      gestoresCcIdsInput,
    );
    const ultimaConvocacao = (await listConvocacaoHistory(db, treinamentoId))[0] || null;
    const empresa = await db
      .prepare('SELECT nome FROM empresas WHERE id = ?')
      .bind(empresaId)
      .first<{ nome: string | null }>();

    const preview = buildConvocacaoPreview({
      treinamento: item,
      empresaNome: empresa?.nome || 'AirTrust',
      config,
      gestoresCc,
      ultimaConvocacaoEm: ultimaConvocacao?.created_at || null,
    });

    return c.json({
      success: true,
      data: {
        ...preview,
        config: {
          assunto_padrao: config.assunto_padrao,
          reply_to: config.reply_to,
        },
      },
    });
  },
);

treinamentosPlanejadosRoutes.post(
  '/planejados/:id/convocacoes',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      force_resend?: boolean;
      skip_missing_email?: boolean;
      gestores_cc_ids?: number[];
    };
    const { items } = await listEventos(db, empresaId, { treinamentoId });
    const item = items[0];
    if (!item) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }
    if (!item.data_prevista) {
      return c.json({ success: false, error: 'A turma não possui data definida' }, 400);
    }
    if (item.status === 'CONCLUIDO' || item.status === 'CANCELADO') {
      return c.json({ success: false, error: 'A turma já foi encerrada/concluída' }, 400);
    }
    if (item.participantes.length === 0) {
      return c.json({ success: false, error: 'A turma não possui tripulantes matriculados' }, 400);
    }

    const gestoresCcIdsInput = Array.isArray(body.gestores_cc_ids)
      ? Array.from(
          new Set(
            body.gestores_cc_ids
              .map((value) => Number(value || 0))
              .filter((value) => Number.isFinite(value) && value > 0),
          ),
        )
      : null;

    const config = await getEmailConvocacaoConfig(db, empresaId);
    const gestoresCc = await resolveGestoresCcByParticipantes(
      db,
      empresaId,
      item.participantes,
      gestoresCcIdsInput,
    );
    const historico = await listConvocacaoHistory(db, treinamentoId);
    if (historico.length > 0 && !body.force_resend) {
      return c.json(
        {
          success: false,
          error: `Esta turma já recebeu convocação em ${historico[0].created_at}. Deseja reenviar?`,
          code: 'CONVOCACAO_REENVIO_CONFIRMATION_REQUIRED',
        },
        409,
      );
    }

    const empresa = await db
      .prepare('SELECT nome FROM empresas WHERE id = ?')
      .bind(empresaId)
      .first<{ nome: string | null }>();
    const preview = buildConvocacaoPreview({
      treinamento: item,
      empresaNome: empresa?.nome || 'AirTrust',
      config,
      gestoresCc,
      ultimaConvocacaoEm: historico[0]?.created_at || null,
    });

    if (!body.skip_missing_email && preview.ausentes_email.length > 0) {
      return c.json(
        {
          success: false,
          error:
            'Existem tripulantes sem e-mail cadastrado. Revise antes de enviar ou confirme o envio ignorando esses registros.',
          code: 'CONVOCACAO_MISSING_EMAIL_CONFIRMATION_REQUIRED',
          data: preview,
        },
        409,
      );
    }

    const ua = extrairUsuarioAuditoria(c);
    const sendResult = await sendConvocacaoInBatches({
      env: c.env,
      db,
      empresaId,
      treinamentoId,
      disparadoPor: ua.usuario_id ? Number(ua.usuario_id) : null,
      disparadoPorNome: ua.usuario_nome || null,
      subjectTemplate: config.assunto_padrao,
      templateHtml: config.template_html,
      assinaturaHtml: config.assinatura_html,
      replyTo: config.reply_to,
      senderName: config.sender_name,
      senderEmail: config.smtp_user,
      cc: gestoresCc.map((gestor) => gestor.email),
      preview,
      participantes: preview.participantes,
      batchSize: config.batch_size,
      batchIntervalMs: config.batch_interval_ms,
      empresaNome: empresa?.nome || 'AirTrust',
    });

    await registrarAuditoria({
      db,
      tabela: 'treinamentos_planejados',
      acao: 'CONVOCACAO_EMAIL',
      registro_id: treinamentoId,
      dados_novos: {
        convocacao_id: sendResult.convocacaoId,
        enviados_sucesso: sendResult.enviados_sucesso,
        enviados_falha: sendResult.enviados_falha,
      },
      ...ua,
    });

    return c.json({
      success: true,
      data: {
        convocacao_id: sendResult.convocacaoId,
        enviados_sucesso: sendResult.enviados_sucesso,
        enviados_falha: sendResult.enviados_falha,
        itens: sendResult.itens,
      },
    });
  },
);

treinamentosPlanejadosRoutes.post(
  '/planejados/:id/convocacoes/reenvio',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    const body = (await c.req.json().catch(() => ({}))) as {
      funcionario_id?: number;
      gestores_cc_ids?: number[];
    };
    if (
      !Number.isInteger(treinamentoId) ||
      treinamentoId <= 0 ||
      !Number.isInteger(body.funcionario_id) ||
      (body.funcionario_id || 0) <= 0
    ) {
      return c.json({ success: false, error: 'Dados inválidos' }, 400);
    }

    const { items } = await listEventos(db, empresaId, { treinamentoId });
    const item = items[0];
    if (!item) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }

    const gestoresCcIdsInput = Array.isArray(body.gestores_cc_ids)
      ? Array.from(
          new Set(
            body.gestores_cc_ids
              .map((value) => Number(value || 0))
              .filter((value) => Number.isFinite(value) && value > 0),
          ),
        )
      : null;

    const config = await getEmailConvocacaoConfig(db, empresaId);
    const gestoresCc = await resolveGestoresCcByParticipantes(
      db,
      empresaId,
      item.participantes,
      gestoresCcIdsInput,
    );
    const empresa = await db
      .prepare('SELECT nome FROM empresas WHERE id = ?')
      .bind(empresaId)
      .first<{ nome: string | null }>();
    const preview = buildConvocacaoPreview({
      treinamento: item,
      empresaNome: empresa?.nome || 'AirTrust',
      config,
      gestoresCc,
      ultimaConvocacaoEm: null,
    });
    const participante = preview.participantes.find(
      (entry) => entry.funcionario_id === body.funcionario_id,
    );
    if (!participante) {
      return c.json({ success: false, error: 'Tripulante não encontrado nesta turma' }, 404);
    }

    const ua = extrairUsuarioAuditoria(c);
    const sendResult = await sendConvocacaoInBatches({
      env: c.env,
      db,
      empresaId,
      treinamentoId,
      disparadoPor: ua.usuario_id ? Number(ua.usuario_id) : null,
      disparadoPorNome: ua.usuario_nome || null,
      subjectTemplate: config.assunto_padrao,
      templateHtml: config.template_html,
      assinaturaHtml: config.assinatura_html,
      replyTo: config.reply_to,
      senderName: config.sender_name,
      senderEmail: config.smtp_user,
      cc: gestoresCc.map((gestor) => gestor.email),
      preview,
      participantes: [participante],
      batchSize: 1,
      batchIntervalMs: 0,
      empresaNome: empresa?.nome || 'AirTrust',
    });

    if (sendResult.itens[0]?.status !== 'sucesso') {
      const erroMensagem = sendResult.itens[0]?.erro_mensagem || 'Falha ao reenviar convocação';
      return c.json({ success: false, error: erroMensagem }, 500);
    }

    return c.json({ success: true, data: sendResult.itens[0] });
  },
);

treinamentosPlanejadosRoutes.patch(
  '/planejados/:id',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const parsed = eventoPatchSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const existing = await db
      .prepare(
        'SELECT id, qualificacao_tipo_id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(treinamentoId, empresaId)
      .first<{ id: number; qualificacao_tipo_id: number }>();

    if (!existing) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }

    const input = parsed.data;
    const referenceError = await validateTrainingReferences({
      db,
      empresaId,
      qualificacaoTipoId: input.qualificacao_tipo_id,
      participanteIds: input.participante_ids,
      instrutorIds: normalizePositiveIds([
        ...(input.instrutor_ids || []),
        ...(input.instrutor_id ? [input.instrutor_id] : []),
        ...((input.dias || []).flatMap((dia) => (dia.instrutor_id ? [dia.instrutor_id] : []))),
      ]),
      ...collectResourceIdsFromDias(input.dias),
    });
    if (referenceError) {
      return c.json({ success: false, error: referenceError }, 400);
    }
    if (input.data_inicio && input.data_fim && input.data_fim < input.data_inicio) {
      return c.json(
        { success: false, error: 'A data final deve ser igual ou posterior à inicial' },
        400,
      );
    }
    if (input.dias?.some((dia) => dia.hora_fim <= dia.hora_inicio)) {
      return c.json({ success: false, error: 'O horário final deve ser posterior ao inicial' }, 400);
    }
    if (
      input.dias &&
      new Set(input.dias.map((dia) => dia.data)).size !== input.dias.length
    ) {
      return c.json({ success: false, error: 'Dias efetivos duplicados não são permitidos' }, 400);
    }
    if (
      input.dias &&
      input.data_inicio &&
      input.data_fim &&
      input.dias.some((dia) => dia.data < input.data_inicio! || dia.data > input.data_fim!)
    ) {
      return c.json({ success: false, error: 'Dia efetivo fora do período da turma' }, 400);
    }
    if (
      input.limite_participantes &&
      input.participante_ids &&
      normalizePositiveIds(input.participante_ids).length > input.limite_participantes
    ) {
      return c.json({ success: false, error: 'Quantidade de participantes excede o limite da turma' }, 400);
    }
    const previousParticipants =
      input.participante_ids !== undefined ||
      (input.qualificacao_tipo_id !== undefined &&
        input.qualificacao_tipo_id !== existing.qualificacao_tipo_id)
        ? await loadParticipanteLinks(db, treinamentoId)
        : [];
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.qualificacao_tipo_id !== undefined) {
      updates.push('qualificacao_tipo_id = ?');
      params.push(input.qualificacao_tipo_id);
    }
    if (input.titulo !== undefined) {
      updates.push('titulo = ?');
      params.push(input.titulo);
    }
    if (input.descricao !== undefined) {
      updates.push('descricao = ?');
      params.push(toNullableText(input.descricao));
    }
    if (input.observacoes !== undefined) {
      updates.push('observacoes = ?');
      params.push(toNullableText(input.observacoes));
    }
    if (input.local !== undefined) {
      updates.push('local = ?');
      params.push(toNullableText(input.local));
    }
    if (input.data_prevista !== undefined) {
      updates.push('data_prevista = ?');
      params.push(input.data_prevista);
    }
    if (input.hora_inicio !== undefined) {
      updates.push('hora_inicio = ?');
      params.push(toNullableText(input.hora_inicio));
    }
    if (input.hora_fim !== undefined) {
      updates.push('hora_fim = ?');
      params.push(toNullableText(input.hora_fim));
    }
    if (input.instrutor_id !== undefined) {
      updates.push('instrutor_id = ?');
      params.push(input.instrutor_id ?? null);
    }
    if (input.carga_horaria_prevista !== undefined) {
      updates.push('carga_horaria_prevista = ?');
      params.push(input.carga_horaria_prevista ?? null);
    }
    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }
    if (input.codigo_turma !== undefined) {
      updates.push('codigo_turma = ?');
      params.push(toNullableText(input.codigo_turma));
    }
    if (input.modalidade !== undefined) {
      updates.push('modalidade = ?');
      params.push(input.modalidade);
    }
    if (input.data_inicio !== undefined) {
      updates.push('data_inicio = ?');
      params.push(input.data_inicio);
    }
    if (input.data_fim !== undefined) {
      updates.push('data_fim = ?');
      params.push(input.data_fim);
    }
    if (input.base !== undefined) {
      updates.push('base = ?');
      params.push(toNullableText(input.base));
    }
    if (input.sala !== undefined) {
      updates.push('sala = ?');
      params.push(toNullableText(input.sala));
    }
    if (input.equipamento_descricao !== undefined) {
      updates.push('equipamento_descricao = ?');
      params.push(toNullableText(input.equipamento_descricao));
    }
    if (input.limite_participantes !== undefined) {
      updates.push('limite_participantes = ?');
      params.push(input.limite_participantes ?? null);
    }

    if (updates.length > 0) {
      params.push(treinamentoId, empresaId);
      await db
        .prepare(
          `UPDATE treinamentos_planejados
            SET ${updates.join(', ')},
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(...params)
        .run();
    }

    if (input.participante_ids !== undefined) {
      await replaceParticipantes(db, treinamentoId, input.participante_ids);
    }
    if (input.dias !== undefined) {
      await replaceDias(db, empresaId, treinamentoId, input.dias);
    }
    if (input.instrutor_ids !== undefined || input.instrutor_id !== undefined) {
      const instrutorIds =
        input.instrutor_ids !== undefined
          ? input.instrutor_ids
          : (
              await db
                .prepare(
                  'SELECT funcionario_id FROM treinamentos_instrutores WHERE empresa_id = ? AND treinamento_id = ?',
                )
                .bind(empresaId, treinamentoId)
                .all<{ funcionario_id: number }>()
            ).results?.map((row) => Number(row.funcionario_id)) || [];
      await replaceInstrutores(
        db,
        empresaId,
        treinamentoId,
        normalizePositiveIds([
          ...instrutorIds,
          ...(input.instrutor_id ? [input.instrutor_id] : []),
        ]),
        input.instrutor_id,
      );
    }

    const incomingParticipantes =
      input.participante_ids !== undefined ? normalizePositiveIds(input.participante_ids) : null;
    const removedParticipants = previousParticipants.filter((participant) => {
      if (
        input.qualificacao_tipo_id !== undefined &&
        input.qualificacao_tipo_id !== existing.qualificacao_tipo_id
      ) {
        return true;
      }
      return incomingParticipantes
        ? !incomingParticipantes.includes(participant.funcionario_id)
        : false;
    });

    await syncTreinamentoPlanejadoIntegration({
      db,
      empresaId,
      treinamentoId,
      removedParticipants,
    });

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'treinamentos_planejados',
      acao: 'UPDATE',
      registro_id: treinamentoId,
      dados_novos: {
        ...input,
        participante_ids:
          input.participante_ids !== undefined
            ? normalizePositiveIds(input.participante_ids)
            : undefined,
      },
      ...ua,
    });

    return c.json({ success: true, data: { id: treinamentoId } });
  },
);

treinamentosPlanejadosRoutes.post(
  '/planejados/:id/participantes',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const parsed = participantesSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const existing = await db
      .prepare(
        'SELECT id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(treinamentoId, empresaId)
      .first<{ id: number }>();
    if (!existing) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }

    const participanteIds = normalizePositiveIds(parsed.data.participante_ids);
    const referenceError = await validateTrainingReferences({
      db,
      empresaId,
      participanteIds,
    });
    if (referenceError) {
      return c.json({ success: false, error: referenceError }, 400);
    }
    const previousParticipants = await loadParticipanteLinks(db, treinamentoId);
    await replaceParticipantes(db, treinamentoId, participanteIds);
    await syncTreinamentoPlanejadoIntegration({
      db,
      empresaId,
      treinamentoId,
      removedParticipants: previousParticipants.filter(
        (participant) => !participanteIds.includes(participant.funcionario_id),
      ),
    });

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'treinamentos_planejados',
      acao: 'UPDATE',
      registro_id: treinamentoId,
      dados_novos: {
        participante_ids: participanteIds,
      },
      ...ua,
    });

    return c.json({
      success: true,
      data: { id: treinamentoId, participante_ids: participanteIds },
    });
  },
);

treinamentosPlanejadosRoutes.patch(
  '/planejados/:id/presenca',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const parsed = presencaSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const existing = await db
      .prepare(
        'SELECT id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(treinamentoId, empresaId)
      .first<{ id: number }>();
    if (!existing) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }

    const participant = await db
      .prepare(
        `SELECT id
           FROM treinamentos_participantes
          WHERE treinamento_id = ? AND funcionario_id = ?`,
      )
      .bind(treinamentoId, parsed.data.funcionario_id)
      .first<{ id: number }>();
    if (!participant) {
      return c.json({ success: false, error: 'Convocado não encontrado neste treinamento' }, 404);
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    const confirmado = toSqlBoolean(parsed.data.confirmado);
    const presente = toSqlBoolean(parsed.data.presente);
    const aprovado = toSqlBoolean(parsed.data.aprovado);

    if (confirmado !== undefined) {
      updates.push('confirmado = ?');
      params.push(confirmado);
    }
    if (presente !== undefined) {
      updates.push('presente = ?');
      params.push(presente);
    }
    if (aprovado !== undefined) {
      updates.push('aprovado = ?');
      params.push(aprovado);
    }
    if (parsed.data.nota !== undefined) {
      updates.push('nota = ?');
      params.push(parsed.data.nota ?? null);
    }
    if (parsed.data.observacoes !== undefined) {
      updates.push('observacoes = ?');
      params.push(toNullableText(parsed.data.observacoes));
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: 'Nenhum campo para atualizar' }, 400);
    }

    params.push(treinamentoId, parsed.data.funcionario_id);

    await db
      .prepare(
        `UPDATE treinamentos_participantes
            SET ${updates.join(', ')},
                updated_at = datetime('now')
          WHERE treinamento_id = ? AND funcionario_id = ?`,
      )
      .bind(...params)
      .run();

    await syncTreinamentoPlanejadoIntegration({
      db,
      empresaId,
      treinamentoId,
    });

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'treinamentos_planejados',
      acao: 'UPDATE',
      registro_id: treinamentoId,
      dados_novos: {
        funcionario_id: parsed.data.funcionario_id,
        confirmado: parsed.data.confirmado,
        presente: parsed.data.presente,
        aprovado: parsed.data.aprovado,
        nota: parsed.data.nota,
        observacoes: parsed.data.observacoes,
      },
      ...ua,
    });

    return c.json({
      success: true,
      data: { id: treinamentoId, funcionario_id: parsed.data.funcionario_id },
    });
  },
);

treinamentosPlanejadosRoutes.get('/planejados/:id/conclusao/preview', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const treinamentoId = Number(c.req.param('id'));
  if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  const { items } = await listEventos(db, empresaId, { treinamentoId });
  const item = items[0];
  if (!item) {
    return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
  }

  return c.json({
    success: true,
    data: {
      treinamento_id: treinamentoId,
      qualificacao: {
        id: item.qualificacao_tipo_id,
        codigo: item.qualificacao_codigo,
        nome: item.qualificacao_nome,
      },
      participantes: item.participantes.map((participante) => ({
        funcionario_id: participante.funcionario_id,
        nome: participante.funcionario_guerra || participante.funcionario_nome,
        resultado: participante.resultado,
        data_conclusao_efetiva: participante.data_conclusao_efetiva,
        qualificacao_historico_id: participante.qualificacao_historico_id,
        elegivel:
          participante.resultado === 'APROVADO' &&
          Boolean(participante.data_conclusao_efetiva),
      })),
    },
  });
});

treinamentosPlanejadosRoutes.patch(
  '/planejados/:id/participantes/conclusao',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const parsed = conclusaoParticipanteSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    if (parsed.data.resultado === 'APROVADO' && !parsed.data.data_conclusao_efetiva) {
      return c.json(
        { success: false, error: 'A data efetiva é obrigatória para participante aprovado' },
        400,
      );
    }

    const participant = await db
      .prepare(
        `SELECT tp.id
           FROM treinamentos_participantes tp
           INNER JOIN treinamentos_planejados t
             ON t.id = tp.treinamento_id
            AND t.empresa_id = ?
            AND t.deleted_at IS NULL
          WHERE tp.treinamento_id = ? AND tp.funcionario_id = ?`,
      )
      .bind(empresaId, treinamentoId, parsed.data.funcionario_id)
      .first<{ id: number }>();
    if (!participant) {
      return c.json({ success: false, error: 'Participante não encontrado nesta turma' }, 404);
    }

    const ua = extrairUsuarioAuditoria(c);
    const aprovado = parsed.data.resultado === 'APROVADO' ? 1 : 0;
    await db
      .prepare(
        `UPDATE treinamentos_participantes
            SET resultado = ?,
                aprovado = ?,
                nota = ?,
                conceito = ?,
                data_conclusao_efetiva = ?,
                concluido_em = datetime('now'),
                concluido_por = ?,
                observacoes = COALESCE(?, observacoes),
                updated_at = datetime('now')
          WHERE id = ?`,
      )
      .bind(
        parsed.data.resultado,
        aprovado,
        parsed.data.nota ?? null,
        toNullableText(parsed.data.conceito),
        parsed.data.data_conclusao_efetiva,
        ua.usuario_id ?? null,
        toNullableText(parsed.data.observacoes),
        participant.id,
      )
      .run();

    await syncTreinamentoPlanejadoIntegration({ db, empresaId, treinamentoId });
    await registrarAuditoria({
      db,
      tabela: 'treinamentos_planejados',
      acao: 'UPDATE',
      registro_id: treinamentoId,
      dados_novos: {
        participante_id: participant.id,
        funcionario_id: parsed.data.funcionario_id,
        resultado: parsed.data.resultado,
        data_conclusao_efetiva: parsed.data.data_conclusao_efetiva,
      },
      ...ua,
    });

    const generated = await db
      .prepare(
        `SELECT qualificacao_historico_id
           FROM treinamentos_qualificacoes_geradas
          WHERE empresa_id = ? AND treinamento_id = ? AND participante_id = ?
          ORDER BY id DESC LIMIT 1`,
      )
      .bind(empresaId, treinamentoId, participant.id)
      .first<{ qualificacao_historico_id: number }>();

    return c.json({
      success: true,
      data: {
        treinamento_id: treinamentoId,
        funcionario_id: parsed.data.funcionario_id,
        resultado: parsed.data.resultado,
        qualificacao_historico_id: generated?.qualificacao_historico_id || null,
      },
    });
  },
);

treinamentosPlanejadosRoutes.patch(
  '/planejados/:id/dias/:diaId/presencas',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    const diaId = Number(c.req.param('diaId'));
    const parsed = presencaDiaSchema.safeParse(await c.req.json());
    if (
      !Number.isInteger(treinamentoId) ||
      treinamentoId <= 0 ||
      !Number.isInteger(diaId) ||
      diaId <= 0
    ) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }

    const participant = await db
      .prepare(
        `SELECT tp.id
           FROM treinamentos_participantes tp
           INNER JOIN treinamentos_planejados t
             ON t.id = tp.treinamento_id AND t.empresa_id = ? AND t.deleted_at IS NULL
           INNER JOIN treinamentos_dias td
             ON td.id = ? AND td.treinamento_id = t.id AND td.empresa_id = ?
            AND td.deleted_at IS NULL
          WHERE tp.treinamento_id = ? AND tp.funcionario_id = ?`,
      )
      .bind(empresaId, diaId, empresaId, treinamentoId, parsed.data.funcionario_id)
      .first<{ id: number }>();
    if (!participant) {
      return c.json({ success: false, error: 'Dia ou participante não encontrado' }, 404);
    }

    const ua = extrairUsuarioAuditoria(c);
    await db
      .prepare(
        `INSERT INTO treinamentos_presencas
          (empresa_id, treinamento_dia_id, participante_id, status, minutos_presentes,
           observacoes, registrado_por, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(treinamento_dia_id, participante_id) DO UPDATE SET
           status = excluded.status,
           minutos_presentes = excluded.minutos_presentes,
           observacoes = excluded.observacoes,
           registrado_por = excluded.registrado_por,
           updated_at = datetime('now')`,
      )
      .bind(
        empresaId,
        diaId,
        participant.id,
        parsed.data.status,
        parsed.data.minutos_presentes ?? null,
        toNullableText(parsed.data.observacoes),
        ua.usuario_id ?? null,
      )
      .run();

    return c.json({
      success: true,
      data: { treinamento_id: treinamentoId, dia_id: diaId, participante_id: participant.id },
    });
  },
);

treinamentosPlanejadosRoutes.delete(
  '/planejados/:id',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const treinamentoId = Number(c.req.param('id'));
    if (!Number.isInteger(treinamentoId) || treinamentoId <= 0) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const existing = await db
      .prepare(
        'SELECT id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(treinamentoId, empresaId)
      .first<{ id: number }>();
    if (!existing) {
      return c.json({ success: false, error: 'Treinamento planejado não encontrado' }, 404);
    }

    await db
      .prepare(
        `UPDATE treinamentos_planejados
            SET status = 'CANCELADO',
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(treinamentoId, empresaId)
      .run();

    await syncTreinamentoPlanejadoIntegration({
      db,
      empresaId,
      treinamentoId,
    });

    await db
      .prepare(
        `UPDATE treinamentos_planejados
          SET deleted_at = datetime('now'),
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(treinamentoId, empresaId)
      .run();

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'treinamentos_planejados',
      acao: 'DELETE',
      registro_id: treinamentoId,
      ...ua,
    });

    return c.json({ success: true, data: { id: treinamentoId } });
  },
);

export default treinamentosPlanejadosRoutes;
