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

function specificity(scope: Scope): number {
  if (scope === 'FUNCIONARIO') return 50;
  if (scope === 'SETOR_FUNCAO') return 40;
  if (scope === 'FUNCAO') return 30;
  if (scope === 'SETOR') return 20;
  return 10;
}

function ruleApplies(rule: Rule, employee: Employee): boolean {
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

function resolvedRules(rules: Rule[], employee: Employee): Rule[] {
  const byType = new Map<number, Rule>();
  for (const rule of rules) {
    if (!ruleApplies(rule, employee)) continue;
    const previous = byType.get(rule.qualificacao_tipo_id);
    if (
      !previous ||
      specificity(rule.escopo) > specificity(previous.escopo) ||
      (specificity(rule.escopo) === specificity(previous.escopo) && rule.id > previous.id)
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
    .all<Employee>();
  return results || [];
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
    return results || [];
  }

  const { results } = await db
    .prepare(
      `SELECT tr.id, tr.empresa_id, tr.qualificacao_tipo_id,
              qt.nome AS qualificacao_tipo_nome,
              qt.codigo AS qualificacao_tipo_codigo,
              ${validadeExpr} AS validade_meses,
              tr.escopo, tr.setor_id, s.nome AS setor_nome,
              tr.funcao_id, fn.nome AS funcao_nome,
              tr.funcionario_id, fu.nome AS funcionario_nome,
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
  return results || [];
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
  } else if (
    currentLms &&
    ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(String(currentLms.lms_status || '').toUpperCase())
  ) {
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
  if (funcionarioId) {
    const funcionario = await db
      .prepare('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(funcionarioId, empresaId)
      .first();
    if (!funcionario) throw new ApiError('Funcionário inválido para a empresa atual', 400);
  }

  return {
    qualificacao_tipo_id: qualificacaoTipoId,
    escopo,
    setor_id: escopo === 'SETOR' || escopo === 'SETOR_FUNCAO' ? setorId : null,
    funcao_id: escopo === 'FUNCAO' || escopo === 'SETOR_FUNCAO' ? funcaoId : null,
    funcionario_id: escopo === 'FUNCIONARIO' ? funcionarioId : null,
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
  return c.json({
    success: true,
    data: {
      schema_ready: schemaReady,
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
  const allowedFunctionIds =
    access.mode === 'all'
      ? null
      : new Set(
          employees.map((employee) => employee.funcao_id).filter((id): id is number => id !== null),
        );
  const functionRows = (functions.results || []).filter(
    (funcao) => allowedFunctionIds === null || allowedFunctionIds.has(Number(funcao.id)),
  );
  const setorFuncoes = Array.from(
    new Map(
      employees
        .filter((employee) => employee.setor_id !== null && employee.funcao_id !== null)
        .map((employee) => [
          `${employee.setor_id}:${employee.funcao_id}`,
          { setor_id: employee.setor_id as number, funcao_id: employee.funcao_id as number },
        ]),
    ).values(),
  );

  return c.json({
    success: true,
    data: {
      setores: sectors.results || [],
      funcoes: functionRows,
      setor_funcoes: setorFuncoes,
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
      (!escopo || rule.escopo === escopo)
    );
  });
  return c.json({
    success: true,
    data,
    meta: { schema_ready: await tableExists(c.env.DB, 'treinamento_requisitos') },
  });
});

app.post('/regras', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  if (!(await tableExists(db, 'treinamento_requisitos')))
    throw new ApiError('Schema de compliance de treinamentos ainda não aplicado', 409);
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const data = await validateRuleReferences(db, empresaId, payload);
  const access = await getEmployeeSectorAccess(c, empresaId);
  await assertIndividualRuleWithinAccess(db, empresaId, access, data);
  const result = await db
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
  const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
  const people = snapshot.people.filter(
    (p) => (!setorId || p.setor_id === setorId) && (!funcaoId || p.funcao_id === funcaoId),
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

app.get('/resumo', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const setorId = asPositiveInt(c.req.query('setor_id'));
  const funcaoId = asPositiveInt(c.req.query('funcao_id'));
  const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
  const people = snapshot.people.filter(
    (p) => (!setorId || p.setor_id === setorId) && (!funcaoId || p.funcao_id === funcaoId),
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
  return c.json({
    success: true,
    data: {
      pessoas: people.length,
      pessoas_sem_configuracao: people.filter((p) => !p.configurado).length,
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
