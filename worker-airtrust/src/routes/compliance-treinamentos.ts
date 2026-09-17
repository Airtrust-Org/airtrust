import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import {
  CANCELLED_STATUS_VALUES,
  PLANNED_QUALIFICATION_STATUS_VALUES,
  sqlStatusEqualsAny,
} from '../lib/status/status-codes';
import { classificarStatusPorVencimento, diasEntreDatas } from '../lib/status/operational-status';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../utils/auditoria';
import {
  assertFuncionarioInScope,
  filterRequestedSetorIdsByAccess,
  getEmployeeSectorAccess,
  type EmployeeSectorAccess,
} from '../services/employee-sector-access';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

const SCOPES = ['EMPRESA', 'SETOR', 'FUNCAO', 'SETOR_FUNCAO', 'FUNCIONARIO'] as const;
const OBRIGATORIEDADES = ['OBRIGATORIA', 'RECOMENDADA', 'NAO_APLICA'] as const;
const ORIGENS = [
  'REGULATORIO',
  'PTO',
  'MANUAL',
  'SGSO',
  'RH',
  'CLIENTE',
  'EMPRESA',
  'OUTRO',
] as const;

type Scope = (typeof SCOPES)[number];
type Obrigatoriedade = (typeof OBRIGATORIEDADES)[number];
type Origem = (typeof ORIGENS)[number];
type ComplianceStatus = 'CONFORME' | 'VENCENDO' | 'VENCIDO' | 'NAO_REALIZADO' | 'EM_ANDAMENTO';

type Employee = {
  id: number;
  nome: string;
  setor_id: number | null;
  setor_nome: string | null;
  funcao_id: number | null;
  funcao_nome: string | null;
  aeronaves_modelos: string[];
};

type Rule = {
  id: number;
  empresa_id: number;
  qualificacao_tipo_id: number;
  qualificacao_tipo_nome: string | null;
  qualificacao_tipo_codigo: string | null;
  validade_meses: number | null;
  escopo: Scope;
  setor_id: number | null;
  setor_nome: string | null;
  funcao_id: number | null;
  funcao_nome: string | null;
  funcionario_id: number | null;
  funcionario_nome: string | null;
  aeronave_modelo: string | null;
  obrigatoriedade: Obrigatoriedade;
  nivel_requerido: number | null;
  critico_operacional: number;
  origem: Origem;
  referencia_normativa: string | null;
  observacoes: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  prazo_inicial_dias: number | null;
  auto_matricular_ead: number;
  ativo: number;
  created_at: string;
  updated_at: string;
};

type Evidence = {
  funcionario_id: number;
  tipo_id: number;
  data_realizacao: string | null;
  data_vencimento: string | null;
  origem: 'QUALIFICACAO' | 'LMS';
  origem_id: number | null;
  origem_titulo: string | null;
  lms_status?: string | null;
};

type LmsEvidenceState = {
  latest: Evidence | undefined;
  latestCompleted: Evidence | undefined;
};

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
    .bind(tableName)
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

async function columnSet(db: D1Database, tableName: string): Promise<Set<string>> {
  const { results } = await db
    .prepare(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`)
    .all<{ name: string }>();
  return new Set((results || []).map((row) => String(row.name || '')));
}

function asPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T[number]) : fallback;
}

export function normalizeAircraftModel(value: unknown): string | null {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  return normalized || null;
}

function specificity(scope: Scope): number {
  if (scope === 'FUNCIONARIO') return 50;
  if (scope === 'SETOR_FUNCAO') return 40;
  if (scope === 'FUNCAO') return 30;
  if (scope === 'SETOR') return 20;
  return 10;
}

function rulePriority(rule: Rule): number {
  return specificity(rule.escopo) + (rule.aeronave_modelo ? 5 : 0);
}

export function ruleApplies(rule: Rule, employee: Employee): boolean {
  if (rule.aeronave_modelo && !employee.aeronaves_modelos.includes(rule.aeronave_modelo)) {
    return false;
  }
  if (rule.escopo === 'EMPRESA') return true;
  if (rule.escopo === 'SETOR')
    return Boolean(employee.setor_id && rule.setor_id === employee.setor_id);
  if (rule.escopo === 'FUNCAO')
    return Boolean(employee.funcao_id && rule.funcao_id === employee.funcao_id);
  if (rule.escopo === 'SETOR_FUNCAO') {
    return Boolean(
      employee.setor_id &&
      employee.funcao_id &&
      rule.setor_id === employee.setor_id &&
      rule.funcao_id === employee.funcao_id,
    );
  }
  return rule.funcionario_id === employee.id;
}

export function resolvedRules(rules: Rule[], employee: Employee): Rule[] {
  const byType = new Map<number, Rule>();
  for (const rule of rules) {
    if (!ruleApplies(rule, employee)) continue;
    const previous = byType.get(rule.qualificacao_tipo_id);
    if (
      !previous ||
      rulePriority(rule) > rulePriority(previous) ||
      (rulePriority(rule) === rulePriority(previous) && rule.id > previous.id)
    ) {
      byType.set(rule.qualificacao_tipo_id, rule);
    }
  }
  return Array.from(byType.values());
}

async function loadEmployees(db: D1Database, empresaId: number): Promise<Employee[]> {
  const cols = await columnSet(db, 'funcionarios');
  const hasSetorId = cols.has('setor_id');
  const hasFuncaoId = cols.has('funcao_id');
  const statusExpr = cols.has('status') ? "UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'" : '1 = 1';
  const ativoExpr = cols.has('ativo') ? 'AND COALESCE(f.ativo, 1) = 1' : '';
  const deletedExpr = cols.has('deleted_at') ? 'AND f.deleted_at IS NULL' : '';

  const { results } = await db
    .prepare(
      `SELECT f.id, f.nome,
              ${hasSetorId ? 'f.setor_id' : 'NULL'} AS setor_id,
              ${hasFuncaoId ? 'f.funcao_id' : 'NULL'} AS funcao_id,
              s.nome AS setor_nome,
              fn.nome AS funcao_nome
         FROM funcionarios f
         LEFT JOIN setores s ON ${hasSetorId ? 's.id = f.setor_id AND s.empresa_id = f.empresa_id AND s.deleted_at IS NULL' : '1 = 0'}
         LEFT JOIN funcoes fn ON ${hasFuncaoId ? 'fn.id = f.funcao_id AND fn.empresa_id = f.empresa_id AND fn.deleted_at IS NULL' : '1 = 0'}
        WHERE f.empresa_id = ?
          AND ${statusExpr}
          ${ativoExpr}
          ${deletedExpr}
        ORDER BY f.nome ASC`,
    )
    .bind(empresaId)
    .all<Omit<Employee, 'aeronaves_modelos'>>();

  const employees: Employee[] = (results || []).map((row) => ({
    ...row,
    aeronaves_modelos: [],
  }));
  if (!(await tableExists(db, 'funcionarios_aeronaves')) || !(await tableExists(db, 'aeronaves'))) {
    return employees;
  }
  const faCols = await columnSet(db, 'funcionarios_aeronaves');
  const aircraftCols = await columnSet(db, 'aeronaves');
  if (!aircraftCols.has('modelo')) return employees;
  const faDeletedExpr = faCols.has('deleted_at') ? 'AND fa.deleted_at IS NULL' : '';
  const faActiveExpr = faCols.has('ativo') ? 'AND COALESCE(fa.ativo,1)=1' : '';
  const faStartExpr = faCols.has('data_inicio')
    ? "AND (fa.data_inicio IS NULL OR date(fa.data_inicio) <= date('now'))"
    : '';
  const faEndExpr = faCols.has('data_fim')
    ? "AND (fa.data_fim IS NULL OR date(fa.data_fim) >= date('now'))"
    : '';
  const aircraftDeletedExpr = aircraftCols.has('deleted_at') ? 'AND a.deleted_at IS NULL' : '';
  const modelRows = await db
    .prepare(
      `SELECT DISTINCT CAST(fa.funcionario_id AS INTEGER) AS funcionario_id,
              UPPER(TRIM(a.modelo)) AS modelo
         FROM funcionarios_aeronaves fa
         JOIN aeronaves a ON a.id = fa.aeronave_id AND a.empresa_id = ?
        WHERE TRIM(COALESCE(a.modelo,'')) <> ''
          ${faDeletedExpr}
          ${faActiveExpr}
          ${faStartExpr}
          ${faEndExpr}
          ${aircraftDeletedExpr}`,
    )
    .bind(empresaId)
    .all<{ funcionario_id: number; modelo: string }>();
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  for (const row of modelRows.results || []) {
    const employee = byId.get(Number(row.funcionario_id));
    const model = normalizeAircraftModel(row.modelo);
    if (!employee || !model || employee.aeronaves_modelos.includes(model)) continue;
    employee.aeronaves_modelos.push(model);
  }
  for (const employee of employees) employee.aeronaves_modelos.sort((a, b) => a.localeCompare(b));
  return employees;
}

async function loadAircraftModelsCatalog(db: D1Database, empresaId: number) {
  if (!(await tableExists(db, 'aeronaves'))) return [] as Array<{ modelo: string; aeronaves: number }>;
  const cols = await columnSet(db, 'aeronaves');
  if (!cols.has('modelo')) return [] as Array<{ modelo: string; aeronaves: number }>;
  const deletedExpr = cols.has('deleted_at') ? 'AND deleted_at IS NULL' : '';
  const { results } = await db
    .prepare(
      `SELECT UPPER(TRIM(modelo)) AS modelo, COUNT(*) AS aeronaves
         FROM aeronaves
        WHERE empresa_id=? AND TRIM(COALESCE(modelo,''))<>'' ${deletedExpr}
        GROUP BY UPPER(TRIM(modelo))
        ORDER BY UPPER(TRIM(modelo))`,
    )
    .bind(empresaId)
    .all<{ modelo: string; aeronaves: number }>();
  return (results || [])
    .map((row) => ({ modelo: normalizeAircraftModel(row.modelo) || '', aeronaves: Number(row.aeronaves) }))
    .filter((row) => Boolean(row.modelo));
}

async function loadRules(db: D1Database, empresaId: number): Promise<Rule[]> {
  const hasV2 = await tableExists(db, 'treinamento_requisitos');
  const tipoCols = await columnSet(db, 'qualificacoes_tipos');
  const validadeExpr = tipoCols.has('validade')
    ? 'qt.validade'
    : tipoCols.has('validade_meses')
      ? 'qt.validade_meses'
      : 'NULL';

  if (!hasV2) {
    if (!(await tableExists(db, 'matriz_treinamento_funcao'))) return [];
    const { results } = await db
      .prepare(
        `SELECT m.id, m.empresa_id, m.qualificacao_tipo_id,
                qt.nome AS qualificacao_tipo_nome, qt.codigo AS qualificacao_tipo_codigo,
                ${validadeExpr} AS validade_meses,
                'FUNCAO' AS escopo, NULL AS setor_id, NULL AS setor_nome,
                m.funcao_id, fn.nome AS funcao_nome,
                NULL AS funcionario_id, NULL AS funcionario_nome,
                NULL AS aeronave_modelo,
                m.obrigatoriedade, m.nivel_requerido, m.critico_operacional,
                m.origem, NULL AS referencia_normativa, m.observacoes,
                NULL AS vigencia_inicio, NULL AS vigencia_fim, NULL AS prazo_inicial_dias,
                0 AS auto_matricular_ead, m.ativo, m.created_at, m.updated_at
           FROM matriz_treinamento_funcao m
           JOIN qualificacoes_tipos qt
             ON qt.id = m.qualificacao_tipo_id
            AND qt.empresa_id = m.empresa_id
            AND qt.deleted_at IS NULL
           LEFT JOIN funcoes fn
             ON fn.id = m.funcao_id AND fn.empresa_id = m.empresa_id AND fn.deleted_at IS NULL
          WHERE m.empresa_id = ? AND m.ativo = 1 AND m.deleted_at IS NULL
          ORDER BY qt.nome ASC, m.id ASC`,
      )
      .bind(empresaId)
      .all<Rule>();
    return (results || []).map((rule) => ({ ...rule, aeronave_modelo: null }));
  }

  const ruleCols = await columnSet(db, 'treinamento_requisitos');
  const aircraftExpr = ruleCols.has('aeronave_modelo') ? 'tr.aeronave_modelo' : 'NULL';
  const { results } = await db
    .prepare(
      `SELECT tr.id, tr.empresa_id, tr.qualificacao_tipo_id,
              qt.nome AS qualificacao_tipo_nome,
              qt.codigo AS qualificacao_tipo_codigo,
              ${validadeExpr} AS validade_meses,
              tr.escopo, tr.setor_id, s.nome AS setor_nome,
              tr.funcao_id, fn.nome AS funcao_nome,
              tr.funcionario_id, fu.nome AS funcionario_nome,
              ${aircraftExpr} AS aeronave_modelo,
              tr.obrigatoriedade, tr.nivel_requerido, tr.critico_operacional,
              tr.origem, tr.referencia_normativa, tr.observacoes,
              tr.vigencia_inicio, tr.vigencia_fim, tr.prazo_inicial_dias,
              tr.auto_matricular_ead, tr.ativo, tr.created_at, tr.updated_at
         FROM treinamento_requisitos tr
         JOIN qualificacoes_tipos qt
           ON qt.id = tr.qualificacao_tipo_id
          AND qt.empresa_id = tr.empresa_id
          AND qt.deleted_at IS NULL
         LEFT JOIN setores s
           ON s.id = tr.setor_id AND s.empresa_id = tr.empresa_id AND s.deleted_at IS NULL
         LEFT JOIN funcoes fn
           ON fn.id = tr.funcao_id AND fn.empresa_id = tr.empresa_id AND fn.deleted_at IS NULL
         LEFT JOIN funcionarios fu
           ON fu.id = tr.funcionario_id AND fu.empresa_id = tr.empresa_id AND fu.deleted_at IS NULL
        WHERE tr.empresa_id = ?
          AND tr.ativo = 1
          AND tr.deleted_at IS NULL
          AND (tr.vigencia_inicio IS NULL OR date(tr.vigencia_inicio) <= date('now'))
          AND (tr.vigencia_fim IS NULL OR date(tr.vigencia_fim) >= date('now'))
        ORDER BY qt.nome ASC, tr.id ASC`,
    )
    .bind(empresaId)
    .all<Rule>();
  return (results || []).map((rule) => ({
    ...rule,
    aeronave_modelo: normalizeAircraftModel(rule.aeronave_modelo),
  }));
}

async function loadQualificationEvidence(
  db: D1Database,
  empresaId: number,
): Promise<Map<string, Evidence>> {
  const map = new Map<string, Evidence>();
  if (!(await tableExists(db, 'qualificacoes_historico'))) return map;
  const cols = await columnSet(db, 'qualificacoes_historico');
  const tipoCol = cols.has('tipo_qualificacao_id')
    ? 'tipo_qualificacao_id'
    : cols.has('qualificacao_id')
      ? 'qualificacao_id'
      : cols.has('tipo_id')
        ? 'tipo_id'
        : null;
  if (!tipoCol) return map;
  const dataCol = cols.has('data_realizacao')
    ? 'data_realizacao'
    : cols.has('data_conclusao')
      ? 'data_conclusao'
      : null;
  const vencCol = cols.has('data_vencimento')
    ? 'data_vencimento'
    : cols.has('data_validade')
      ? 'data_validade'
      : null;
  if (!dataCol) return map;
  const statusExpr = cols.has('status') ? "UPPER(COALESCE(qh.status, ''))" : "''";
  const empresaExpr = cols.has('empresa_id') ? 'qh.empresa_id = ?' : 'f.empresa_id = ?';
  const deletedExpr = cols.has('deleted_at') ? 'AND qh.deleted_at IS NULL' : '';
  const updatedExpr = cols.has('updated_at')
    ? 'qh.updated_at'
    : cols.has('created_at')
      ? 'qh.created_at'
      : `qh.${dataCol}`;
  const vencSelect = vencCol ? `qh.${vencCol}` : 'NULL';

  const { results } = await db
    .prepare(
      `WITH ranked AS (
         SELECT qh.id, qh.funcionario_id, qh.${tipoCol} AS tipo_id,
                qh.${dataCol} AS data_realizacao, ${vencSelect} AS data_vencimento,
                ROW_NUMBER() OVER (
                  PARTITION BY qh.funcionario_id, qh.${tipoCol}
                  ORDER BY datetime(COALESCE(qh.${dataCol}, ${updatedExpr}, ${vencSelect})) DESC, qh.id DESC
                ) AS rn
           FROM qualificacoes_historico qh
           JOIN funcionarios f ON f.id = qh.funcionario_id
          WHERE ${empresaExpr}
            ${deletedExpr}
            AND NOT (${sqlStatusEqualsAny(statusExpr, CANCELLED_STATUS_VALUES)})
            AND NOT (${sqlStatusEqualsAny(statusExpr, PLANNED_QUALIFICATION_STATUS_VALUES)})
       )
       SELECT id, funcionario_id, tipo_id, data_realizacao, data_vencimento
         FROM ranked WHERE rn = 1`,
    )
    .bind(empresaId)
    .all<{
      id: number;
      funcionario_id: number;
      tipo_id: number;
      data_realizacao: string | null;
      data_vencimento: string | null;
    }>();

  for (const row of results || []) {
    map.set(`${row.funcionario_id}:${row.tipo_id}`, {
      funcionario_id: row.funcionario_id,
      tipo_id: row.tipo_id,
      data_realizacao: row.data_realizacao,
      data_vencimento: row.data_vencimento,
      origem: 'QUALIFICACAO',
      origem_id: row.id,
      origem_titulo: null,
    });
  }
  return map;
}

async function loadLmsEvidence(
  db: D1Database,
  empresaId: number,
): Promise<Map<string, LmsEvidenceState>> {
  const map = new Map<string, LmsEvidenceState>();
  if (!(await tableExists(db, 'lms_matriculas')) || !(await tableExists(db, 'lms_cursos')))
    return map;
  const { results } = await db
    .prepare(
      `SELECT m.id, m.funcionario_id, c.qualificacao_tipo_id AS tipo_id,
              m.status, m.data_conclusao, m.updated_at, c.titulo
         FROM lms_matriculas m
         JOIN lms_cursos c
           ON c.id = m.curso_id
          AND c.empresa_id = m.empresa_id
          AND c.deleted_at IS NULL
        WHERE m.empresa_id = ?
          AND m.deleted_at IS NULL
          AND c.qualificacao_tipo_id IS NOT NULL
          AND UPPER(COALESCE(m.status, '')) <> 'CANCELADO'
        ORDER BY datetime(COALESCE(m.data_conclusao, m.updated_at, m.created_at)) DESC, m.id DESC`,
    )
    .bind(empresaId)
    .all<{
      id: number;
      funcionario_id: number;
      tipo_id: number;
      status: string;
      data_conclusao: string | null;
      titulo: string | null;
    }>();
  for (const row of results || []) {
    const key = `${row.funcionario_id}:${row.tipo_id}`;
    const evidence: Evidence = {
      funcionario_id: row.funcionario_id,
      tipo_id: row.tipo_id,
      data_realizacao: row.data_conclusao,
      data_vencimento: null,
      origem: 'LMS',
      origem_id: row.id,
      origem_titulo: row.titulo,
      lms_status: row.status,
    };
    const state = map.get(key) || { latest: undefined, latestCompleted: undefined };
    if (!state.latest) state.latest = evidence;
    if (!state.latestCompleted && String(row.status || '').toUpperCase() === 'CONCLUIDO') {
      state.latestCompleted = evidence;
    }
    map.set(key, state);
  }
  return map;
}

function latestEvidence(
  history: Evidence | undefined,
  lms: Evidence | undefined,
): Evidence | undefined {
  if (!history) return lms;
  if (!lms) return history;
  if (!lms.data_realizacao) return history;
  if (!history.data_realizacao) return lms;
  return lms.data_realizacao > history.data_realizacao ? lms : history;
}

function computeRequirement(
  rule: Rule,
  history: Evidence | undefined,
  lms: LmsEvidenceState | undefined,
) {
  const today = new Date().toISOString().slice(0, 10);
  const evidence = latestEvidence(history, lms?.latestCompleted);
  const currentLms = lms?.latest;
  let status_compliance: ComplianceStatus = 'NAO_REALIZADO';
  let data_validade: string | null = null;
  let dias_para_vencer: number | null = null;

  if (evidence?.data_realizacao) {
    if (evidence.data_vencimento) {
      data_validade = evidence.data_vencimento.slice(0, 10);
    } else if (rule.validade_meses) {
      const base = new Date(`${evidence.data_realizacao.slice(0, 10)}T12:00:00Z`);
      base.setUTCMonth(base.getUTCMonth() + Number(rule.validade_meses));
      data_validade = base.toISOString().slice(0, 10);
    }
    if (!data_validade) {
      status_compliance = 'CONFORME';
    } else {
      const classification = classificarStatusPorVencimento(data_validade, today);
      dias_para_vencer = diasEntreDatas(data_validade, today);
      status_compliance =
        classification === 'VENCIDA'
          ? 'VENCIDO'
          : classification === 'VENCENDO_30'
            ? 'VENCENDO'
            : 'CONFORME';
    }
  } else if (currentLms && String(currentLms.lms_status || '').toUpperCase() === 'EM_ANDAMENTO') {
    status_compliance = 'EM_ANDAMENTO';
  }

  const status_legacy =
    status_compliance === 'VENCIDO'
      ? 'VENCIDO'
      : status_compliance === 'CONFORME' || status_compliance === 'VENCENDO'
        ? 'EM_DIA'
        : 'EM_FALTA';
  return {
    regra_id: rule.id,
    matriz_id: rule.id,
    qualificacao_tipo_id: rule.qualificacao_tipo_id,
    qualificacao_tipo_nome: rule.qualificacao_tipo_nome,
    qualificacao_tipo_codigo: rule.qualificacao_tipo_codigo,
    obrigatoriedade: rule.obrigatoriedade,
    critico_operacional: Boolean(rule.critico_operacional),
    origem: rule.origem,
    referencia_normativa: rule.referencia_normativa,
    observacoes: rule.observacoes,
    escopo: rule.escopo,
    setor_id: rule.setor_id,
    setor_nome: rule.setor_nome,
    funcao_id: rule.funcao_id,
    funcao_nome: rule.funcao_nome,
    aeronave_modelo: rule.aeronave_modelo,
    ultima_data: evidence?.data_realizacao ?? null,
    data_validade,
    dias_para_vencer,
    status: status_legacy as 'EM_DIA' | 'VENCIDO' | 'EM_FALTA',
    status_compliance,
    evidencia_origem: evidence?.origem ?? null,
    evidencia_id: evidence?.origem_id ?? null,
    curso_ead_titulo: currentLms?.origem_titulo ?? evidence?.origem_titulo ?? null,
    lms_status: currentLms?.lms_status ?? lms?.latestCompleted?.lms_status ?? null,
  };
}

function filterEmployeesByAccess(employees: Employee[], access: EmployeeSectorAccess): Employee[] {
  if (access.mode === 'all') return employees;
  if (access.mode === 'self') {
    return employees.filter((employee) => employee.id === access.funcionarioId);
  }
  if (access.setorIds.length === 0) return [];
  const allowed = new Set(access.setorIds);
  return employees.filter(
    (employee) => employee.setor_id !== null && allowed.has(employee.setor_id),
  );
}

async function buildSnapshot(db: D1Database, empresaId: number, access: EmployeeSectorAccess) {
  const [allEmployees, rules, historyMap, lmsMap] = await Promise.all([
    loadEmployees(db, empresaId),
    loadRules(db, empresaId),
    loadQualificationEvidence(db, empresaId),
    loadLmsEvidence(db, empresaId),
  ]);
  const employees = filterEmployeesByAccess(allEmployees, access);

  const people = employees.map((employee) => {
    const resolved = resolvedRules(rules, employee);
    const requirements = resolved
      .filter((rule) => rule.obrigatoriedade !== 'NAO_APLICA')
      .map((rule) =>
        computeRequirement(
          rule,
          historyMap.get(`${employee.id}:${rule.qualificacao_tipo_id}`),
          lmsMap.get(`${employee.id}:${rule.qualificacao_tipo_id}`),
        ),
      );
    const mandatory = requirements.filter((r) => r.obrigatoriedade === 'OBRIGATORIA');
    const compliant = mandatory.filter(
      (r) => r.status_compliance === 'CONFORME' || r.status_compliance === 'VENCENDO',
    ).length;
    const total = mandatory.length;
    return {
      ...employee,
      requisitos: requirements,
      configurado: resolved.length > 0,
      total_obrigatorios: total,
      conformes: compliant,
      vencendo: mandatory.filter((r) => r.status_compliance === 'VENCENDO').length,
      vencidos: mandatory.filter((r) => r.status_compliance === 'VENCIDO').length,
      nao_realizados: mandatory.filter((r) => r.status_compliance === 'NAO_REALIZADO').length,
      em_andamento: mandatory.filter((r) => r.status_compliance === 'EM_ANDAMENTO').length,
      compliance_pct: total > 0 ? Math.round((compliant / total) * 1000) / 10 : null,
    };
  });

  return { employees, rules, people };
}

type LmsEnrollment = {
  id: number;
  funcionario_id: number;
  curso_id: number;
  curso_titulo: string;
  qualificacao_tipo_id: number | null;
  qualificacao_tipo_nome: string | null;
  qualificacao_tipo_codigo: string | null;
  funcionario_nome: string;
  status: string;
  setor_id: number | null;
  setor_nome: string | null;
  funcao_id: number | null;
  funcao_nome: string | null;
};

type ReconciliationDecision = {
  matricula_id: number;
  decisao: 'MANTER_AVULSA';
  observacoes: string | null;
  updated_at: string;
};

async function loadLmsEnrollments(db: D1Database, empresaId: number): Promise<LmsEnrollment[]> {
  if (!(await tableExists(db, 'lms_matriculas')) || !(await tableExists(db, 'lms_cursos')))
    return [];
  const funcionarioCols = await columnSet(db, 'funcionarios');
  const activeExpr = funcionarioCols.has('ativo') ? 'AND COALESCE(f.ativo, 1) = 1' : '';
  const statusExpr = funcionarioCols.has('status')
    ? "AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'"
    : '';
  const deletedFuncionario = funcionarioCols.has('deleted_at') ? 'AND f.deleted_at IS NULL' : '';
  const { results } = await db
    .prepare(
      `SELECT m.id, m.funcionario_id, m.curso_id, c.titulo AS curso_titulo,
              c.qualificacao_tipo_id, qt.nome AS qualificacao_tipo_nome, qt.codigo AS qualificacao_tipo_codigo,
              f.nome AS funcionario_nome, m.status,
              f.setor_id, s.nome AS setor_nome, f.funcao_id, fn.nome AS funcao_nome
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id AND c.deleted_at IS NULL
         LEFT JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id AND qt.deleted_at IS NULL
         JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
         LEFT JOIN setores s ON s.id=f.setor_id AND s.empresa_id=f.empresa_id AND s.deleted_at IS NULL
         LEFT JOIN funcoes fn ON fn.id=f.funcao_id AND fn.empresa_id=f.empresa_id AND fn.deleted_at IS NULL
        WHERE m.empresa_id=? AND m.deleted_at IS NULL
          AND UPPER(COALESCE(m.status,'')) <> 'CANCELADO'
          ${deletedFuncionario} ${activeExpr} ${statusExpr}
        ORDER BY c.titulo, f.nome, m.id`,
    )
    .bind(empresaId)
    .all<LmsEnrollment>();
  return results || [];
}

async function loadReconciliationDecisions(
  db: D1Database,
  empresaId: number,
): Promise<Map<number, ReconciliationDecision>> {
  const map = new Map<number, ReconciliationDecision>();
  if (!(await tableExists(db, 'treinamento_matricula_reconciliacoes'))) return map;
  const { results } = await db
    .prepare(
      `SELECT matricula_id, decisao, observacoes, updated_at
         FROM treinamento_matricula_reconciliacoes
        WHERE empresa_id=? AND ativo=1 AND deleted_at IS NULL`,
    )
    .bind(empresaId)
    .all<ReconciliationDecision>();
  for (const row of results || []) map.set(Number(row.matricula_id), row);
  return map;
}

async function loadActiveLmsCourses(db: D1Database, empresaId: number) {
  if (!(await tableExists(db, 'lms_cursos')))
    return [] as Array<{ id: number; titulo: string; qualificacao_tipo_id: number }>;
  const cols = await columnSet(db, 'lms_cursos');
  const ativoExpr = cols.has('ativo') ? 'AND COALESCE(ativo,1)=1' : '';
  const deletedExpr = cols.has('deleted_at') ? 'AND deleted_at IS NULL' : '';
  const { results } = await db
    .prepare(
      `SELECT id,titulo,qualificacao_tipo_id FROM lms_cursos
        WHERE empresa_id=? AND qualificacao_tipo_id IS NOT NULL ${ativoExpr} ${deletedExpr}
        ORDER BY titulo`,
    )
    .bind(empresaId)
    .all<{ id: number; titulo: string; qualificacao_tipo_id: number }>();
  return results || [];
}

function orgRuleApplies(
  rule: Rule,
  setorId: number,
  funcaoId: number | null,
  aeronaveModelo: string | null,
): boolean {
  if (rule.aeronave_modelo && rule.aeronave_modelo !== aeronaveModelo) return false;
  if (rule.escopo === 'FUNCIONARIO') return false;
  if (rule.escopo === 'EMPRESA') return true;
  if (rule.escopo === 'SETOR') return rule.setor_id === setorId;
  if (rule.escopo === 'FUNCAO') return Boolean(funcaoId && rule.funcao_id === funcaoId);
  return Boolean(funcaoId && rule.setor_id === setorId && rule.funcao_id === funcaoId);
}

function aggregateCompliancePeople(people: Awaited<ReturnType<typeof buildSnapshot>>['people']) {
  const total = people.reduce((sum, p) => sum + p.total_obrigatorios, 0);
  const conformes = people.reduce((sum, p) => sum + p.conformes, 0);
  return {
    pessoas: people.length,
    pessoas_sem_configuracao: people.filter((p) => !p.configurado).length,
    requisitos_obrigatorios: total,
    conformes,
    vencendo: people.reduce((sum, p) => sum + p.vencendo, 0),
    vencidos: people.reduce((sum, p) => sum + p.vencidos, 0),
    nao_realizados: people.reduce((sum, p) => sum + p.nao_realizados, 0),
    em_andamento: people.reduce((sum, p) => sum + p.em_andamento, 0),
    compliance_pct: total > 0 ? Math.round((conformes / total) * 1000) / 10 : null,
  };
}

async function validateRuleReferences(
  db: D1Database,
  empresaId: number,
  payload: Record<string, unknown>,
) {
  const qualificacaoTipoId = asPositiveInt(payload.qualificacao_tipo_id);
  if (!qualificacaoTipoId) throw new ApiError('qualificacao_tipo_id é obrigatório', 400);
  const tipo = await db
    .prepare(
      'SELECT id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(qualificacaoTipoId, empresaId)
    .first<{ id: number }>();
  if (!tipo) throw new ApiError('Tipo de qualificação inválido para a empresa atual', 400);

  const escopo = normalizeEnum(payload.escopo, SCOPES, 'FUNCAO');
  const setorId = asPositiveInt(payload.setor_id);
  const funcaoId = asPositiveInt(payload.funcao_id);
  const funcionarioId = asPositiveInt(payload.funcionario_id);
  const aeronaveModelo = normalizeAircraftModel(payload.aeronave_modelo);

  if ((escopo === 'SETOR' || escopo === 'SETOR_FUNCAO') && !setorId)
    throw new ApiError('setor_id é obrigatório para o escopo selecionado', 400);
  if ((escopo === 'FUNCAO' || escopo === 'SETOR_FUNCAO') && !funcaoId)
    throw new ApiError('funcao_id é obrigatório para o escopo selecionado', 400);
  if (escopo === 'FUNCIONARIO' && !funcionarioId)
    throw new ApiError('funcionario_id é obrigatório para o escopo selecionado', 400);

  if (setorId) {
    const setor = await db
      .prepare(
        'SELECT id FROM setores WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND COALESCE(ativo,1)=1',
      )
      .bind(setorId, empresaId)
      .first();
    if (!setor) throw new ApiError('Setor inválido para a empresa atual', 400);
  }
  if (funcaoId) {
    const funcao = await db
      .prepare(
        'SELECT id FROM funcoes WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND COALESCE(ativo,1)=1',
      )
      .bind(funcaoId, empresaId)
      .first();
    if (!funcao) throw new ApiError('Função inválida para a empresa atual', 400);
  }
  if (
    escopo === 'SETOR_FUNCAO' &&
    setorId &&
    funcaoId &&
    (await tableExists(db, 'setores_funcoes'))
  ) {
    const pair = await db
      .prepare(
        `SELECT 1 AS ok FROM setores_funcoes
          WHERE empresa_id=? AND setor_id=? AND funcao_id=? AND ativo=1 AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(empresaId, setorId, funcaoId)
      .first<{ ok: number }>();
    if (!pair) throw new ApiError('Cargo/função não pertence ao setor selecionado', 400);
  }
  if (funcionarioId) {
    const funcionario = await db
      .prepare('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(funcionarioId, empresaId)
      .first();
    if (!funcionario) throw new ApiError('Funcionário inválido para a empresa atual', 400);
  }
  if (aeronaveModelo) {
    if (!(await tableExists(db, 'aeronaves'))) {
      throw new ApiError('Cadastro de aeronaves indisponível para validar o equipamento', 409);
    }
    const aircraftCols = await columnSet(db, 'aeronaves');
    const aircraftDeletedExpr = aircraftCols.has('deleted_at') ? 'AND deleted_at IS NULL' : '';
    const aircraft = await db
      .prepare(
        `SELECT id FROM aeronaves
          WHERE empresa_id=? AND UPPER(TRIM(modelo))=? ${aircraftDeletedExpr} LIMIT 1`,
      )
      .bind(empresaId, aeronaveModelo)
      .first<{ id: number }>();
    if (!aircraft) throw new ApiError('Aeronave/equipamento inválido para a empresa atual', 400);
  }

  return {
    qualificacao_tipo_id: qualificacaoTipoId,
    escopo,
    setor_id: escopo === 'SETOR' || escopo === 'SETOR_FUNCAO' ? setorId : null,
    funcao_id: escopo === 'FUNCAO' || escopo === 'SETOR_FUNCAO' ? funcaoId : null,
    funcionario_id: escopo === 'FUNCIONARIO' ? funcionarioId : null,
    aeronave_modelo: aeronaveModelo,
    obrigatoriedade: normalizeEnum(payload.obrigatoriedade, OBRIGATORIEDADES, 'OBRIGATORIA'),
    critico_operacional: payload.critico_operacional ? 1 : 0,
    origem: normalizeEnum(payload.origem, ORIGENS, 'REGULATORIO'),
    referencia_normativa: payload.referencia_normativa
      ? String(payload.referencia_normativa).trim()
      : null,
    observacoes: payload.observacoes ? String(payload.observacoes).trim() : null,
    vigencia_inicio: payload.vigencia_inicio ? String(payload.vigencia_inicio).slice(0, 10) : null,
    vigencia_fim: payload.vigencia_fim ? String(payload.vigencia_fim).slice(0, 10) : null,
    prazo_inicial_dias:
      payload.prazo_inicial_dias === null || payload.prazo_inicial_dias === undefined
        ? null
        : Math.max(0, Number(payload.prazo_inicial_dias) || 0),
    auto_matricular_ead: payload.auto_matricular_ead ? 1 : 0,
  };
}

function assertRuleWriteWithinAccess(
  access: EmployeeSectorAccess,
  data: Awaited<ReturnType<typeof validateRuleReferences>>,
): void {
  if (access.mode === 'all') return;
  if (access.mode === 'self') {
    throw new ApiError('Acesso negado para editar requisitos de compliance', 403);
  }
  if (data.escopo === 'EMPRESA' || data.escopo === 'FUNCAO') {
    throw new ApiError(
      'Gestor setorial não pode alterar requisito global da empresa ou da função',
      403,
    );
  }
  if (data.setor_id) {
    const allowed = filterRequestedSetorIdsByAccess([data.setor_id], access);
    if (allowed.length !== 1) throw new ApiError('Setor fora do escopo do gestor', 403);
  }
}

async function assertIndividualRuleWithinAccess(
  db: D1Database,
  empresaId: number,
  access: EmployeeSectorAccess,
  data: Awaited<ReturnType<typeof validateRuleReferences>>,
): Promise<void> {
  assertRuleWriteWithinAccess(access, data);
  if (data.funcionario_id) {
    await assertFuncionarioInScope(db, empresaId, data.funcionario_id, access);
  }
}

app.get('/capabilities', async (c) => {
  const db = c.env.DB;
  const schemaReady = await tableExists(db, 'treinamento_requisitos');
  const aircraftScopeReady = schemaReady
    ? (await columnSet(db, 'treinamento_requisitos')).has('aeronave_modelo')
    : false;
  return c.json({
    success: true,
    data: {
      schema_ready: schemaReady,
      aircraft_scope_ready: aircraftScopeReady,
      reconciliation_ready: await tableExists(db, 'treinamento_matricula_reconciliacoes'),
      scopes: SCOPES,
      obrigatoriedades: OBRIGATORIEDADES,
      origens: ORIGENS,
    },
  });
});

app.get('/catalogos', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const allEmployees = await loadEmployees(db, empresaId);
  const employees = filterEmployeesByAccess(allEmployees, access);

  const sectorSql =
    access.mode === 'all'
      ? `SELECT id, codigo, nome FROM setores
       WHERE empresa_id = ? AND deleted_at IS NULL AND COALESCE(ativo,1)=1
       ORDER BY nome`
      : access.setorIds.length > 0
        ? `SELECT id, codigo, nome FROM setores
         WHERE empresa_id = ? AND id IN (${access.setorIds.map(() => '?').join(',')})
           AND deleted_at IS NULL AND COALESCE(ativo,1)=1
         ORDER BY nome`
        : `SELECT id, codigo, nome FROM setores WHERE 1=0`;
  const sectorBindings = access.mode === 'all' ? [empresaId] : [empresaId, ...access.setorIds];
  const sectors = await db
    .prepare(sectorSql)
    .bind(...sectorBindings)
    .all<{
      id: number;
      codigo: string | null;
      nome: string;
    }>();

  const functions = await db
    .prepare(
      `SELECT id, codigo, nome FROM funcoes
       WHERE empresa_id = ? AND deleted_at IS NULL AND COALESCE(ativo,1)=1
       ORDER BY nome`,
    )
    .bind(empresaId)
    .all<{ id: number; codigo: string | null; nome: string }>();
  const hasCanonicalSetorFuncoes = await tableExists(db, 'setores_funcoes');
  let setorFuncoes: Array<{ setor_id: number; funcao_id: number }>;
  if (hasCanonicalSetorFuncoes) {
    const mapSql =
      access.mode === 'all'
        ? `SELECT sf.setor_id,sf.funcao_id
             FROM setores_funcoes sf
            WHERE sf.empresa_id=? AND sf.deleted_at IS NULL AND COALESCE(sf.ativo,1)=1
            ORDER BY sf.setor_id,sf.funcao_id`
        : access.setorIds.length > 0
          ? `SELECT sf.setor_id,sf.funcao_id
               FROM setores_funcoes sf
              WHERE sf.empresa_id=? AND sf.setor_id IN (${access.setorIds.map(() => '?').join(',')})
                AND sf.deleted_at IS NULL AND COALESCE(sf.ativo,1)=1
              ORDER BY sf.setor_id,sf.funcao_id`
          : `SELECT setor_id,funcao_id FROM setores_funcoes WHERE 1=0`;
    const mapBindings = access.mode === 'all' ? [empresaId] : [empresaId, ...access.setorIds];
    const mapped = await db
      .prepare(mapSql)
      .bind(...mapBindings)
      .all<{ setor_id: number; funcao_id: number }>();
    setorFuncoes = mapped.results || [];
  } else {
    setorFuncoes = Array.from(
      new Map(
        employees
          .filter((employee) => employee.setor_id !== null && employee.funcao_id !== null)
          .map((employee) => [
            `${employee.setor_id}:${employee.funcao_id}`,
            { setor_id: employee.setor_id as number, funcao_id: employee.funcao_id as number },
          ]),
      ).values(),
    );
  }
  const allowedFunctionIds = new Set(setorFuncoes.map((pair) => Number(pair.funcao_id)));
  const functionRows = (functions.results || []).filter((funcao) =>
    hasCanonicalSetorFuncoes
      ? allowedFunctionIds.has(Number(funcao.id))
      : access.mode === 'all' || allowedFunctionIds.has(Number(funcao.id)),
  );
  const aircraftModels = await loadAircraftModelsCatalog(db, empresaId);

  return c.json({
    success: true,
    data: {
      setores: sectors.results || [],
      funcoes: functionRows,
      setor_funcoes: setorFuncoes,
      aeronaves_modelos: aircraftModels,
      access_mode: access.mode,
    },
  });
});

app.get('/regras', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const rules = await loadRules(c.env.DB, empresaId);
  const scopedEmployees = filterEmployeesByAccess(await loadEmployees(c.env.DB, empresaId), access);
  const scopedEmployeeIds = new Set(scopedEmployees.map((employee) => employee.id));
  const tipoId = asPositiveInt(c.req.query('qualificacao_tipo_id'));
  const setorId = asPositiveInt(c.req.query('setor_id'));
  const funcaoId = asPositiveInt(c.req.query('funcao_id'));
  const aeronaveModelo = normalizeAircraftModel(c.req.query('aeronave_modelo'));
  const escopo = String(c.req.query('escopo') || '').toUpperCase();
  const scopedFunctionIds = new Set(
    scopedEmployees.map((employee) => employee.funcao_id).filter((id): id is number => id !== null),
  );
  const data = rules.filter((rule) => {
    const visibleByAccess =
      access.mode === 'all' ||
      rule.escopo === 'EMPRESA' ||
      (rule.escopo === 'FUNCAO' &&
        rule.funcao_id !== null &&
        scopedFunctionIds.has(rule.funcao_id)) ||
      (rule.setor_id !== null && access.setorIds.includes(rule.setor_id)) ||
      (rule.funcionario_id !== null && scopedEmployeeIds.has(rule.funcionario_id));
    return (
      visibleByAccess &&
      (!tipoId || rule.qualificacao_tipo_id === tipoId) &&
      (!setorId || rule.setor_id === setorId) &&
      (!funcaoId || rule.funcao_id === funcaoId) &&
      (!aeronaveModelo || rule.aeronave_modelo === aeronaveModelo) &&
      (!escopo || rule.escopo === escopo)
    );
  });
  return c.json({
    success: true,
    data,
    meta: {
      schema_ready: await tableExists(c.env.DB, 'treinamento_requisitos'),
      aircraft_scope_ready: (await columnSet(c.env.DB, 'treinamento_requisitos')).has('aeronave_modelo'),
    },
  });
});

app.post('/regras', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  if (!(await tableExists(db, 'treinamento_requisitos')))
    throw new ApiError('Schema de compliance de treinamentos ainda não aplicado', 409);
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const data = await validateRuleReferences(db, empresaId, payload);
  const ruleCols = await columnSet(db, 'treinamento_requisitos');
  const aircraftScopeReady = ruleCols.has('aeronave_modelo');
  if (data.aeronave_modelo && !aircraftScopeReady) {
    throw new ApiError('Schema de compliance por aeronave ainda não aplicado', 409);
  }
  const access = await getEmployeeSectorAccess(c, empresaId);
  await assertIndividualRuleWithinAccess(db, empresaId, access, data);
  const result = aircraftScopeReady
    ? await db
        .prepare(
          `INSERT INTO treinamento_requisitos
          (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, funcionario_id, aeronave_modelo, obrigatoriedade, critico_operacional, origem, referencia_normativa, observacoes, vigencia_inicio, vigencia_fim, prazo_inicial_dias, auto_matricular_ead)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          empresaId,
          data.qualificacao_tipo_id,
          data.escopo,
          data.setor_id,
          data.funcao_id,
          data.funcionario_id,
          data.aeronave_modelo,
          data.obrigatoriedade,
          data.critico_operacional,
          data.origem,
          data.referencia_normativa,
          data.observacoes,
          data.vigencia_inicio,
          data.vigencia_fim,
          data.prazo_inicial_dias,
          data.auto_matricular_ead,
        )
        .run()
    : await db
        .prepare(
          `INSERT INTO treinamento_requisitos
          (empresa_id, qualificacao_tipo_id, escopo, setor_id, funcao_id, funcionario_id, obrigatoriedade, critico_operacional, origem, referencia_normativa, observacoes, vigencia_inicio, vigencia_fim, prazo_inicial_dias, auto_matricular_ead)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          empresaId,
          data.qualificacao_tipo_id,
          data.escopo,
          data.setor_id,
          data.funcao_id,
          data.funcionario_id,
          data.obrigatoriedade,
          data.critico_operacional,
          data.origem,
          data.referencia_normativa,
          data.observacoes,
          data.vigencia_inicio,
          data.vigencia_fim,
          data.prazo_inicial_dias,
          data.auto_matricular_ead,
        )
        .run();
  const id = Number(result.meta.last_row_id);
  await registrarAuditoria({
    db,
    tabela: 'treinamento_requisitos',
    acao: 'INSERT',
    registro_id: id,
    dados_novos: { empresa_id: empresaId, ...data },
    ...extrairUsuarioAuditoria(c),
  });
  return c.json({ success: true, data: { id } }, 201);
});

app.put('/regras/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = asPositiveInt(c.req.param('id'));
  if (!id) throw new ApiError('ID inválido', 400);
  const existing = await db
    .prepare(
      'SELECT * FROM treinamento_requisitos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(id, empresaId)
    .first<Record<string, unknown>>();
  if (!existing) throw new ApiError('Regra não encontrada', 404);
  const patch = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const access = await getEmployeeSectorAccess(c, empresaId);
  const existingData = await validateRuleReferences(db, empresaId, existing);
  await assertIndividualRuleWithinAccess(db, empresaId, access, existingData);
  const merged = { ...existing, ...patch };
  const data = await validateRuleReferences(db, empresaId, merged);
  await assertIndividualRuleWithinAccess(db, empresaId, access, data);
  const ruleCols = await columnSet(db, 'treinamento_requisitos');
  const aircraftScopeReady = ruleCols.has('aeronave_modelo');
  if (data.aeronave_modelo && !aircraftScopeReady) {
    throw new ApiError('Schema de compliance por aeronave ainda não aplicado', 409);
  }
  if (aircraftScopeReady) {
    await db
      .prepare(
        `UPDATE treinamento_requisitos SET
        qualificacao_tipo_id=?, escopo=?, setor_id=?, funcao_id=?, funcionario_id=?, aeronave_modelo=?, obrigatoriedade=?, critico_operacional=?, origem=?, referencia_normativa=?, observacoes=?, vigencia_inicio=?, vigencia_fim=?, prazo_inicial_dias=?, auto_matricular_ead=?, updated_at=datetime('now')
        WHERE id=? AND empresa_id=?`,
      )
      .bind(
        data.qualificacao_tipo_id,
        data.escopo,
        data.setor_id,
        data.funcao_id,
        data.funcionario_id,
        data.aeronave_modelo,
        data.obrigatoriedade,
        data.critico_operacional,
        data.origem,
        data.referencia_normativa,
        data.observacoes,
        data.vigencia_inicio,
        data.vigencia_fim,
        data.prazo_inicial_dias,
        data.auto_matricular_ead,
        id,
        empresaId,
      )
      .run();
  } else {
    await db
      .prepare(
        `UPDATE treinamento_requisitos SET
        qualificacao_tipo_id=?, escopo=?, setor_id=?, funcao_id=?, funcionario_id=?, obrigatoriedade=?, critico_operacional=?, origem=?, referencia_normativa=?, observacoes=?, vigencia_inicio=?, vigencia_fim=?, prazo_inicial_dias=?, auto_matricular_ead=?, updated_at=datetime('now')
        WHERE id=? AND empresa_id=?`,
      )
      .bind(
        data.qualificacao_tipo_id,
        data.escopo,
        data.setor_id,
        data.funcao_id,
        data.funcionario_id,
        data.obrigatoriedade,
        data.critico_operacional,
        data.origem,
        data.referencia_normativa,
        data.observacoes,
        data.vigencia_inicio,
        data.vigencia_fim,
        data.prazo_inicial_dias,
        data.auto_matricular_ead,
        id,
        empresaId,
      )
      .run();
  }
  await registrarAuditoria({
    db,
    tabela: 'treinamento_requisitos',
    acao: 'UPDATE',
    registro_id: id,
    dados_anteriores: existing,
    dados_novos: { empresa_id: empresaId, ...data },
    ...extrairUsuarioAuditoria(c),
  });
  return c.json({ success: true });
});

app.delete('/regras/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = asPositiveInt(c.req.param('id'));
  if (!id) throw new ApiError('ID inválido', 400);
  const existing = await db
    .prepare(
      'SELECT * FROM treinamento_requisitos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(id, empresaId)
    .first<Record<string, unknown>>();
  if (!existing) throw new ApiError('Regra não encontrada', 404);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const existingData = await validateRuleReferences(db, empresaId, existing);
  await assertIndividualRuleWithinAccess(db, empresaId, access, existingData);
  await db
    .prepare(
      "UPDATE treinamento_requisitos SET ativo=0, deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND empresa_id=?",
    )
    .bind(id, empresaId)
    .run();
  await registrarAuditoria({
    db,
    tabela: 'treinamento_requisitos',
    acao: 'DELETE',
    registro_id: id,
    dados_anteriores: existing,
    ...extrairUsuarioAuditoria(c),
  });
  return c.json({ success: true });
});

app.get('/funcionarios/:id', async (c) => {
  const empresaId = getEmpresaId(c);
  const funcionarioId = asPositiveInt(c.req.param('id'));
  if (!funcionarioId) throw new ApiError('Funcionário inválido', 400);
  const access = await getEmployeeSectorAccess(c, empresaId);
  await assertFuncionarioInScope(c.env.DB, empresaId, funcionarioId, access);
  const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
  const person = snapshot.people.find((item) => item.id === funcionarioId);
  if (!person) throw new ApiError('Funcionário não encontrado', 404);
  return c.json({
    success: true,
    data: person,
    meta: { schema_ready: await tableExists(c.env.DB, 'treinamento_requisitos') },
  });
});

app.get('/pessoas', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const setorId = asPositiveInt(c.req.query('setor_id'));
  const funcaoId = asPositiveInt(c.req.query('funcao_id'));
  const aeronaveModelo = normalizeAircraftModel(c.req.query('aeronave_modelo'));
  const qualificacaoTipoId = asPositiveInt(c.req.query('qualificacao_tipo_id'));
  const statusCompliance = String(c.req.query('status') || '')
    .trim()
    .toUpperCase();
  const allowedStatus = new Set([
    'CONFORME',
    'VENCENDO',
    'VENCIDO',
    'NAO_REALIZADO',
    'EM_ANDAMENTO',
  ]);
  if (statusCompliance && !allowedStatus.has(statusCompliance)) {
    throw new ApiError('Status de compliance inválido', 400);
  }
  const q = String(c.req.query('q') || '')
    .trim()
    .toLowerCase();
  const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
  const data = snapshot.people
    .filter((person) => {
      const matchesRequirement =
        !qualificacaoTipoId && !statusCompliance
          ? true
          : person.requisitos.some(
              (requisito) =>
                requisito.obrigatoriedade === 'OBRIGATORIA' &&
                (!qualificacaoTipoId || requisito.qualificacao_tipo_id === qualificacaoTipoId) &&
                (!statusCompliance || requisito.status_compliance === statusCompliance),
            );
      return (
        (!setorId || person.setor_id === setorId) &&
        (!funcaoId || person.funcao_id === funcaoId) &&
        (!aeronaveModelo || person.aeronaves_modelos.includes(aeronaveModelo)) &&
        (!q || person.nome.toLowerCase().includes(q)) &&
        matchesRequirement
      );
    })
    .map(({ requisitos: _requisitos, ...person }) => person);
  return c.json({ success: true, data });
});

app.get('/treinamentos', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const setorId = asPositiveInt(c.req.query('setor_id'));
  const funcaoId = asPositiveInt(c.req.query('funcao_id'));
  const aeronaveModelo = normalizeAircraftModel(c.req.query('aeronave_modelo'));
  const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
  const people = snapshot.people.filter(
    (p) =>
      (!setorId || p.setor_id === setorId) &&
      (!funcaoId || p.funcao_id === funcaoId) &&
      (!aeronaveModelo || p.aeronaves_modelos.includes(aeronaveModelo)),
  );
  const map = new Map<
    number,
    {
      qualificacao_tipo_id: number;
      qualificacao_tipo_nome: string | null;
      qualificacao_tipo_codigo: string | null;
      pessoas: number;
      conformes: number;
      vencendo: number;
      vencidos: number;
      nao_realizados: number;
      em_andamento: number;
    }
  >();
  for (const person of people) {
    for (const req of person.requisitos.filter((r) => r.obrigatoriedade === 'OBRIGATORIA')) {
      const current = map.get(req.qualificacao_tipo_id) || {
        qualificacao_tipo_id: req.qualificacao_tipo_id,
        qualificacao_tipo_nome: req.qualificacao_tipo_nome,
        qualificacao_tipo_codigo: req.qualificacao_tipo_codigo,
        pessoas: 0,
        conformes: 0,
        vencendo: 0,
        vencidos: 0,
        nao_realizados: 0,
        em_andamento: 0,
      };
      current.pessoas = Number(current.pessoas) + 1;
      if (req.status_compliance === 'CONFORME') current.conformes = Number(current.conformes) + 1;
      if (req.status_compliance === 'VENCENDO') {
        current.conformes = Number(current.conformes) + 1;
        current.vencendo = Number(current.vencendo) + 1;
      }
      if (req.status_compliance === 'VENCIDO') current.vencidos = Number(current.vencidos) + 1;
      if (req.status_compliance === 'NAO_REALIZADO')
        current.nao_realizados = Number(current.nao_realizados) + 1;
      if (req.status_compliance === 'EM_ANDAMENTO')
        current.em_andamento = Number(current.em_andamento) + 1;
      map.set(req.qualificacao_tipo_id, current);
    }
  }
  const data = Array.from(map.values())
    .map((row) => ({
      ...row,
      compliance_pct:
        Number(row.pessoas) > 0
          ? Math.round((Number(row.conformes) / Number(row.pessoas)) * 1000) / 10
          : 100,
    }))
    .sort((a, b) =>
      String(a.qualificacao_tipo_nome || '').localeCompare(
        String(b.qualificacao_tipo_nome || ''),
        'pt-BR',
      ),
    );
  return c.json({ success: true, data });
});

app.get('/setores', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
  const requestedSetorId = asPositiveInt(c.req.query('setor_id'));
  const people = snapshot.people.filter(
    (person) => !requestedSetorId || person.setor_id === requestedSetorId,
  );
  const sectors = new Map<
    number | null,
    { setor_id: number | null; setor_nome: string; people: typeof people }
  >();
  for (const person of people) {
    const key = person.setor_id;
    const current = sectors.get(key) || {
      setor_id: key,
      setor_nome: person.setor_nome || 'Sem setor',
      people: [],
    };
    current.people.push(person);
    sectors.set(key, current);
  }
  const data = Array.from(sectors.values())
    .map((sector) => {
      const cargos = new Map<
        number | null,
        { funcao_id: number | null; funcao_nome: string; people: typeof people }
      >();
      for (const person of sector.people) {
        const key = person.funcao_id;
        const current = cargos.get(key) || {
          funcao_id: key,
          funcao_nome: person.funcao_nome || 'Sem cargo',
          people: [],
        };
        current.people.push(person);
        cargos.set(key, current);
      }
      return {
        setor_id: sector.setor_id,
        setor_nome: sector.setor_nome,
        ...aggregateCompliancePeople(sector.people),
        cargos: Array.from(cargos.values())
          .map((cargo) => ({
            funcao_id: cargo.funcao_id,
            funcao_nome: cargo.funcao_nome,
            ...aggregateCompliancePeople(cargo.people),
          }))
          .sort((a, b) => a.funcao_nome.localeCompare(b.funcao_nome, 'pt-BR')),
      };
    })
    .sort((a, b) => a.setor_nome.localeCompare(b.setor_nome, 'pt-BR'));
  return c.json({ success: true, data });
});

app.get('/matriz-organizacao', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const setorId = asPositiveInt(c.req.query('setor_id'));
  const funcaoId = asPositiveInt(c.req.query('funcao_id'));
  const aeronaveModelo = normalizeAircraftModel(c.req.query('aeronave_modelo'));
  if (!setorId) throw new ApiError('setor_id é obrigatório', 400);
  if (access.mode !== 'all' && !filterRequestedSetorIdsByAccess([setorId], access).length) {
    throw new ApiError('Setor fora do escopo do gestor', 403);
  }
  if (funcaoId && (await tableExists(db, 'setores_funcoes'))) {
    const pair = await db
      .prepare(
        `SELECT 1 AS ok FROM setores_funcoes
          WHERE empresa_id=? AND setor_id=? AND funcao_id=? AND ativo=1 AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(empresaId, setorId, funcaoId)
      .first<{ ok: number }>();
    if (!pair) throw new ApiError('Cargo/função não pertence ao setor selecionado', 400);
  }
  if (aeronaveModelo) {
    const catalog = await loadAircraftModelsCatalog(db, empresaId);
    if (!catalog.some((item) => item.modelo === aeronaveModelo)) {
      throw new ApiError('Aeronave/equipamento inválido para a empresa atual', 400);
    }
  }
  const tipoCols = await columnSet(db, 'qualificacoes_tipos');
  const tipoAtivoExpr = tipoCols.has('ativo') ? 'AND COALESCE(ativo,1)=1' : '';
  const tipoDeletedExpr = tipoCols.has('deleted_at') ? 'AND deleted_at IS NULL' : '';
  const [rules, tiposResult, allEmployees, historyMap, lmsMap] = await Promise.all([
    loadRules(db, empresaId),
    db
      .prepare(
        `SELECT id,codigo,nome FROM qualificacoes_tipos
          WHERE empresa_id=? ${tipoDeletedExpr} ${tipoAtivoExpr}
          ORDER BY nome`,
      )
      .bind(empresaId)
      .all<{ id: number; codigo: string | null; nome: string }>(),
    loadEmployees(db, empresaId),
    loadQualificationEvidence(db, empresaId),
    loadLmsEvidence(db, empresaId),
  ]);
  const selectedEmployees = filterEmployeesByAccess(allEmployees, access).filter(
    (employee) =>
      employee.setor_id === setorId &&
      (!funcaoId || employee.funcao_id === funcaoId) &&
      (!aeronaveModelo || employee.aeronaves_modelos.includes(aeronaveModelo)),
  );
  const directScope: Scope = funcaoId ? 'SETOR_FUNCAO' : 'SETOR';
  const directPriority = specificity(directScope) + (aeronaveModelo ? 5 : 0);
  const data = (tiposResult.results || []).map((tipo) => {
    const candidates = rules
      .filter(
        (rule) =>
          rule.qualificacao_tipo_id === Number(tipo.id) &&
          orgRuleApplies(rule, setorId, funcaoId, aeronaveModelo),
      )
      .sort((a, b) => rulePriority(b) - rulePriority(a) || b.id - a.id);
    const effective = candidates[0] || null;
    const direct =
      rules.find(
        (rule) =>
          rule.qualificacao_tipo_id === Number(tipo.id) &&
          rule.escopo === directScope &&
          rule.setor_id === setorId &&
          (directScope === 'SETOR' || rule.funcao_id === funcaoId) &&
          rule.aeronave_modelo === aeronaveModelo,
      ) || null;
    const preview = selectedEmployees.map((employee) => {
      const employeeEffective = rules
        .filter(
          (rule) => rule.qualificacao_tipo_id === Number(tipo.id) && ruleApplies(rule, employee),
        )
        .sort((a, b) => rulePriority(b) - rulePriority(a) || b.id - a.id)[0];
      const requirement =
        employeeEffective && employeeEffective.obrigatoriedade !== 'NAO_APLICA'
          ? computeRequirement(
              employeeEffective,
              historyMap.get(`${employee.id}:${tipo.id}`),
              lmsMap.get(`${employee.id}:${tipo.id}`),
            )
          : null;
      return {
        employee,
        effective: employeeEffective || null,
        requirement,
        overriddenByMoreSpecific: Boolean(
          employeeEffective && rulePriority(employeeEffective) > directPriority,
        ),
      };
    });
    const impact = {
      pessoas: selectedEmployees.length,
      atingidas_neste_nivel: preview.filter((item) => !item.overriddenByMoreSpecific).length,
      override_mais_especifico: preview.filter((item) => item.overriddenByMoreSpecific).length,
      com_requisito: preview.filter((item) => item.requirement !== null).length,
      sem_requisito: preview.filter((item) => item.requirement === null).length,
      conformes: preview.filter((item) => item.requirement?.status_compliance === 'CONFORME')
        .length,
      vencendo: preview.filter((item) => item.requirement?.status_compliance === 'VENCENDO').length,
      vencidos: preview.filter((item) => item.requirement?.status_compliance === 'VENCIDO').length,
      nunca_realizados: preview.filter(
        (item) => item.requirement?.status_compliance === 'NAO_REALIZADO',
      ).length,
      em_andamento: preview.filter((item) => item.requirement?.status_compliance === 'EM_ANDAMENTO')
        .length,
      matriculados: selectedEmployees.filter((employee) =>
        Boolean(lmsMap.get(`${employee.id}:${tipo.id}`)?.latest),
      ).length,
      sem_matricula: selectedEmployees.filter(
        (employee) => !lmsMap.get(`${employee.id}:${tipo.id}`)?.latest,
      ).length,
    };
    return {
      qualificacao_tipo_id: Number(tipo.id),
      qualificacao_tipo_codigo: tipo.codigo,
      qualificacao_tipo_nome: tipo.nome,
      impacto: impact,
      efetiva: effective
        ? {
            id: effective.id,
            escopo: effective.escopo,
            obrigatoriedade: effective.obrigatoriedade,
            aeronave_modelo: effective.aeronave_modelo,
          }
        : null,
      direta: direct
        ? {
            id: direct.id,
            escopo: direct.escopo,
            obrigatoriedade: direct.obrigatoriedade,
            aeronave_modelo: direct.aeronave_modelo,
          }
        : null,
    };
  });
  return c.json({
    success: true,
    data,
    meta: { escopo_direto: directScope, aeronave_modelo: aeronaveModelo },
  });
});

app.get('/reconciliacao', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const setorId = asPositiveInt(c.req.query('setor_id'));
  const funcaoId = asPositiveInt(c.req.query('funcao_id'));
  const aeronaveModelo = normalizeAircraftModel(c.req.query('aeronave_modelo'));
  const snapshot = await buildSnapshot(db, empresaId, access);
  const people = snapshot.people.filter(
    (person) =>
      (!setorId || person.setor_id === setorId) &&
      (!funcaoId || person.funcao_id === funcaoId) &&
      (!aeronaveModelo || person.aeronaves_modelos.includes(aeronaveModelo)),
  );
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const allowedIds = new Set(people.map((person) => person.id));
  const [allEnrollments, decisions, courses] = await Promise.all([
    loadLmsEnrollments(db, empresaId),
    loadReconciliationDecisions(db, empresaId),
    loadActiveLmsCourses(db, empresaId),
  ]);
  const enrollments = allEnrollments.filter((row) => allowedIds.has(Number(row.funcionario_id)));
  // A matrícula concluída é evidência histórica e não pode bloquear uma nova
  // matrícula de renovação quando o requisito estiver vencido/vencendo.
  const blockingEnrollmentKeys = new Set(
    enrollments
      .filter(
        (row) =>
          row.qualificacao_tipo_id !== null &&
          !['CONCLUIDO', 'CONCLUIDA'].includes(String(row.status || '').trim().toUpperCase()),
      )
      .map((row) => `${row.funcionario_id}:${row.qualificacao_tipo_id}`),
  );
  const courseByType = new Map<number, Array<{ id: number; titulo: string }>>();
  for (const course of courses) {
    const key = Number(course.qualificacao_tipo_id);
    const current = courseByType.get(key) || [];
    current.push({ id: Number(course.id), titulo: course.titulo });
    courseByType.set(key, current);
  }
  const gaps = new Map<
    number,
    {
      qualificacao_tipo_id: number;
      qualificacao_tipo_nome: string | null;
      qualificacao_tipo_codigo: string | null;
      funcionarios: Array<{ id: number; nome: string; status_compliance: ComplianceStatus }>;
    }
  >();
  let requisitosSemMatricula = 0;
  for (const person of people) {
    for (const req of person.requisitos) {
      const key = `${person.id}:${req.qualificacao_tipo_id}`;
      if (blockingEnrollmentKeys.has(key)) continue;
      requisitosSemMatricula += 1;
      if (!['NAO_REALIZADO', 'VENCIDO', 'VENCENDO'].includes(req.status_compliance)) continue;
      const current = gaps.get(req.qualificacao_tipo_id) || {
        qualificacao_tipo_id: req.qualificacao_tipo_id,
        qualificacao_tipo_nome: req.qualificacao_tipo_nome,
        qualificacao_tipo_codigo: req.qualificacao_tipo_codigo,
        funcionarios: [],
      };
      current.funcionarios.push({
        id: person.id,
        nome: person.nome,
        status_compliance: req.status_compliance,
      });
      gaps.set(req.qualificacao_tipo_id, current);
    }
  }
  const matriculasRevisao = [] as Array<Record<string, unknown>>;
  let alinhadas = 0;
  let avulsasReconciliadas = 0;
  for (const enrollment of enrollments) {
    const employee = peopleById.get(Number(enrollment.funcionario_id));
    if (!employee) continue;
    const effective = enrollment.qualificacao_tipo_id
      ? resolvedRules(snapshot.rules, employee).find(
          (rule) => rule.qualificacao_tipo_id === Number(enrollment.qualificacao_tipo_id),
        )
      : undefined;
    let situacao:
      | 'MATRICULA_COM_REQUISITO'
      | 'MATRICULADO_SEM_REQUISITO'
      | 'NAO_APLICA_MATRICULADO'
      | 'CURSO_SEM_MODELO'
      | 'MATRICULA_AVULSA_RECONCILIADA';
    if (!enrollment.qualificacao_tipo_id) situacao = 'CURSO_SEM_MODELO';
    else if (effective?.obrigatoriedade === 'NAO_APLICA') situacao = 'NAO_APLICA_MATRICULADO';
    else if (effective) situacao = 'MATRICULA_COM_REQUISITO';
    else if (decisions.get(Number(enrollment.id))?.decisao === 'MANTER_AVULSA') {
      situacao = 'MATRICULA_AVULSA_RECONCILIADA';
    } else situacao = 'MATRICULADO_SEM_REQUISITO';
    if (situacao === 'MATRICULA_COM_REQUISITO') {
      alinhadas += 1;
      continue;
    }
    if (situacao === 'MATRICULA_AVULSA_RECONCILIADA') avulsasReconciliadas += 1;
    matriculasRevisao.push({
      matricula_id: Number(enrollment.id),
      funcionario_id: Number(enrollment.funcionario_id),
      funcionario_nome: enrollment.funcionario_nome,
      setor_id: enrollment.setor_id,
      setor_nome: enrollment.setor_nome,
      funcao_id: enrollment.funcao_id,
      funcao_nome: enrollment.funcao_nome,
      curso_id: Number(enrollment.curso_id),
      curso_titulo: enrollment.curso_titulo,
      qualificacao_tipo_id: enrollment.qualificacao_tipo_id,
      qualificacao_tipo_nome: enrollment.qualificacao_tipo_nome,
      qualificacao_tipo_codigo: enrollment.qualificacao_tipo_codigo,
      matricula_status: enrollment.status,
      situacao,
      regra_efetiva: effective
        ? {
            id: effective.id,
            escopo: effective.escopo,
            obrigatoriedade: effective.obrigatoriedade,
            aeronave_modelo: effective.aeronave_modelo,
          }
        : null,
      decisao: decisions.get(Number(enrollment.id)) || null,
    });
  }
  const gapsMatricula = Array.from(gaps.values())
    .map((gap) => ({
      ...gap,
      pessoas: gap.funcionarios.length,
      vencendo: gap.funcionarios.filter((p) => p.status_compliance === 'VENCENDO').length,
      vencidos: gap.funcionarios.filter((p) => p.status_compliance === 'VENCIDO').length,
      nunca_realizados: gap.funcionarios.filter((p) => p.status_compliance === 'NAO_REALIZADO')
        .length,
      cursos_ead: courseByType.get(gap.qualificacao_tipo_id) || [],
    }))
    .sort((a, b) =>
      String(a.qualificacao_tipo_nome || '').localeCompare(
        String(b.qualificacao_tipo_nome || ''),
        'pt-BR',
      ),
    );
  const convitesMatricula = enrollments
    .filter((row) => String(row.status || '').toUpperCase() === 'NAO_INICIADO')
    .map((row) => ({
      matricula_id: Number(row.id),
      funcionario_id: Number(row.funcionario_id),
      funcionario_nome: row.funcionario_nome,
      curso_id: Number(row.curso_id),
      curso_titulo: row.curso_titulo,
      qualificacao_tipo_id: row.qualificacao_tipo_id,
      qualificacao_tipo_nome: row.qualificacao_tipo_nome,
      setor_id: row.setor_id,
      setor_nome: row.setor_nome,
      funcao_id: row.funcao_id,
      funcao_nome: row.funcao_nome,
    }));
  const summary = {
    matriculas_ativas: enrollments.length,
    matriculas_alinhadas: alinhadas,
    requisitos_sem_matricula: requisitosSemMatricula,
    gaps_matricula_acionaveis: gapsMatricula.reduce((sum, item) => sum + item.pessoas, 0),
    matriculados_sem_requisito: matriculasRevisao.filter(
      (r) => r.situacao === 'MATRICULADO_SEM_REQUISITO',
    ).length,
    nao_aplica_matriculados: matriculasRevisao.filter(
      (r) => r.situacao === 'NAO_APLICA_MATRICULADO',
    ).length,
    cursos_sem_modelo: matriculasRevisao.filter((r) => r.situacao === 'CURSO_SEM_MODELO').length,
    matriculas_avulsas_reconciliadas: avulsasReconciliadas,
  };
  return c.json({
    success: true,
    data: {
      resumo: summary,
      gaps_matricula: gapsMatricula,
      matriculas_revisao: matriculasRevisao,
      convites_matricula: convitesMatricula,
    },
    meta: { reconciliation_ready: await tableExists(db, 'treinamento_matricula_reconciliacoes') },
  });
});

app.post('/reconciliacao/:matriculaId/decisao', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  if (!(await tableExists(db, 'treinamento_matricula_reconciliacoes'))) {
    throw new ApiError('Schema de reconciliação de matrículas ainda não aplicado', 409);
  }
  const matriculaId = asPositiveInt(c.req.param('matriculaId'));
  if (!matriculaId) throw new ApiError('Matrícula inválida', 400);
  const enrollment = await db
    .prepare(
      `SELECT id,funcionario_id FROM lms_matriculas
        WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND UPPER(COALESCE(status,''))<>'CANCELADO'`,
    )
    .bind(matriculaId, empresaId)
    .first<{ id: number; funcionario_id: number }>();
  if (!enrollment) throw new ApiError('Matrícula não encontrada', 404);
  const access = await getEmployeeSectorAccess(c, empresaId);
  await assertFuncionarioInScope(db, empresaId, Number(enrollment.funcionario_id), access);
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const decisao = String(payload.decisao || '')
    .trim()
    .toUpperCase();
  if (decisao !== 'MANTER_AVULSA') throw new ApiError('Decisão de reconciliação inválida', 400);
  const observacoes = payload.observacoes
    ? String(payload.observacoes).trim().slice(0, 1000)
    : null;
  const existing = await db
    .prepare(
      `SELECT id FROM treinamento_matricula_reconciliacoes
        WHERE empresa_id=? AND matricula_id=? AND ativo=1 AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, matriculaId)
    .first<{ id: number }>();
  const userIdRaw = c.get('userId' as never) as unknown;
  const userId = Number(userIdRaw);
  let id: number;
  if (existing) {
    id = Number(existing.id);
    await db
      .prepare(
        `UPDATE treinamento_matricula_reconciliacoes
            SET decisao='MANTER_AVULSA',observacoes=?,decidido_por=?,updated_at=datetime('now')
          WHERE id=? AND empresa_id=?`,
      )
      .bind(observacoes, Number.isInteger(userId) && userId > 0 ? userId : null, id, empresaId)
      .run();
  } else {
    const result = await db
      .prepare(
        `INSERT INTO treinamento_matricula_reconciliacoes
          (empresa_id,matricula_id,decisao,observacoes,decidido_por)
         VALUES (?,?,'MANTER_AVULSA',?,?)`,
      )
      .bind(
        empresaId,
        matriculaId,
        observacoes,
        Number.isInteger(userId) && userId > 0 ? userId : null,
      )
      .run();
    id = Number(result.meta.last_row_id);
  }
  await registrarAuditoria({
    db,
    tabela: 'treinamento_matricula_reconciliacoes',
    acao: existing ? 'UPDATE' : 'INSERT',
    registro_id: id,
    dados_novos: {
      empresa_id: empresaId,
      matricula_id: matriculaId,
      decisao: 'MANTER_AVULSA',
      observacoes,
    },
    ...extrairUsuarioAuditoria(c),
  });
  return c.json({
    success: true,
    data: { id, matricula_id: matriculaId, decisao: 'MANTER_AVULSA' },
  });
});

app.delete('/reconciliacao/:matriculaId/decisao', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const matriculaId = asPositiveInt(c.req.param('matriculaId'));
  if (!matriculaId) throw new ApiError('Matrícula inválida', 400);
  if (!(await tableExists(db, 'treinamento_matricula_reconciliacoes')))
    return c.json({ success: true });
  const enrollment = await db
    .prepare('SELECT funcionario_id FROM lms_matriculas WHERE id=? AND empresa_id=? LIMIT 1')
    .bind(matriculaId, empresaId)
    .first<{ funcionario_id: number }>();
  if (!enrollment) throw new ApiError('Matrícula não encontrada', 404);
  const access = await getEmployeeSectorAccess(c, empresaId);
  await assertFuncionarioInScope(db, empresaId, Number(enrollment.funcionario_id), access);
  const existing = await db
    .prepare(
      `SELECT id,decisao,observacoes FROM treinamento_matricula_reconciliacoes
        WHERE empresa_id=? AND matricula_id=? AND ativo=1 AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, matriculaId)
    .first<Record<string, unknown>>();
  if (existing) {
    await db
      .prepare(
        `UPDATE treinamento_matricula_reconciliacoes
            SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now')
          WHERE id=? AND empresa_id=?`,
      )
      .bind(Number(existing.id), empresaId)
      .run();
    await registrarAuditoria({
      db,
      tabela: 'treinamento_matricula_reconciliacoes',
      acao: 'DELETE',
      registro_id: Number(existing.id),
      dados_anteriores: existing,
      ...extrairUsuarioAuditoria(c),
    });
  }
  return c.json({ success: true });
});

app.get('/resumo', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const setorId = asPositiveInt(c.req.query('setor_id'));
  const funcaoId = asPositiveInt(c.req.query('funcao_id'));
  const aeronaveModelo = normalizeAircraftModel(c.req.query('aeronave_modelo'));
  const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
  const people = snapshot.people.filter(
    (p) =>
      (!setorId || p.setor_id === setorId) &&
      (!funcaoId || p.funcao_id === funcaoId) &&
      (!aeronaveModelo || p.aeronaves_modelos.includes(aeronaveModelo)),
  );
  const totalObrigatorios = people.reduce((sum, p) => sum + p.total_obrigatorios, 0);
  const conformes = people.reduce((sum, p) => sum + p.conformes, 0);
  const bySector = new Map<
    number | null,
    {
      setor_id: number | null;
      setor_nome: string;
      pessoas: number;
      pessoas_sem_configuracao: number;
      total: number;
      conformes: number;
    }
  >();
  for (const person of people) {
    const key = person.setor_id;
    const current = bySector.get(key) || {
      setor_id: key,
      setor_nome: person.setor_nome || 'Sem setor',
      pessoas: 0,
      pessoas_sem_configuracao: 0,
      total: 0,
      conformes: 0,
    };
    current.pessoas += 1;
    if (!person.configurado) current.pessoas_sem_configuracao += 1;
    current.total += person.total_obrigatorios;
    current.conformes += person.conformes;
    bySector.set(key, current);
  }
  const setores = Array.from(bySector.values())
    .map((s) => ({
      ...s,
      compliance_pct: s.total > 0 ? Math.round((s.conformes / s.total) * 1000) / 10 : null,
    }))
    .sort((a, b) => a.setor_nome.localeCompare(b.setor_nome, 'pt-BR'));
  const setoresSemMatriz = setores.filter(
    (setor) => setor.pessoas > 0 && setor.pessoas_sem_configuracao === setor.pessoas,
  ).length;
  const byRole = new Map<string, { pessoas: number; sem: number }>();
  for (const person of people) {
    const key = `${person.setor_id ?? 0}:${person.funcao_id ?? 0}`;
    const current = byRole.get(key) || { pessoas: 0, sem: 0 };
    current.pessoas += 1;
    if (!person.configurado) current.sem += 1;
    byRole.set(key, current);
  }
  const cargosSemMatriz = Array.from(byRole.values()).filter(
    (cargo) => cargo.pessoas > 0 && cargo.sem === cargo.pessoas,
  ).length;
  let matriculasSemRequisito = 0;
  if (await tableExists(c.env.DB, 'lms_matriculas')) {
    const [enrollments, decisions] = await Promise.all([
      loadLmsEnrollments(c.env.DB, empresaId),
      loadReconciliationDecisions(c.env.DB, empresaId),
    ]);
    const peopleById = new Map(people.map((person) => [person.id, person]));
    for (const enrollment of enrollments) {
      const employee = peopleById.get(Number(enrollment.funcionario_id));
      if (!employee || !enrollment.qualificacao_tipo_id) continue;
      const effective = resolvedRules(snapshot.rules, employee).find(
        (rule) => rule.qualificacao_tipo_id === Number(enrollment.qualificacao_tipo_id),
      );
      if (!effective && decisions.get(Number(enrollment.id))?.decisao !== 'MANTER_AVULSA')
        matriculasSemRequisito += 1;
    }
  }
  return c.json({
    success: true,
    data: {
      pessoas: people.length,
      pessoas_sem_configuracao: people.filter((p) => !p.configurado).length,
      setores_sem_matriz: setoresSemMatriz,
      cargos_sem_matriz: cargosSemMatriz,
      matriculas_sem_requisito: matriculasSemRequisito,
      requisitos_obrigatorios: totalObrigatorios,
      conformes,
      vencendo: people.reduce((sum, p) => sum + p.vencendo, 0),
      vencidos: people.reduce((sum, p) => sum + p.vencidos, 0),
      nao_realizados: people.reduce((sum, p) => sum + p.nao_realizados, 0),
      em_andamento: people.reduce((sum, p) => sum + p.em_andamento, 0),
      compliance_pct:
        totalObrigatorios > 0 ? Math.round((conformes / totalObrigatorios) * 1000) / 10 : null,
      setores,
    },
    meta: { schema_ready: await tableExists(c.env.DB, 'treinamento_requisitos') },
  });
});

export default app;
