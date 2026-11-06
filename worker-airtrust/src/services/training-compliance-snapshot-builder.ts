import { trainingComplianceHistoryIdentitySql, trainingComplianceHistoricalModalitySql } from './training-compliance-history-identity';
import { CANCELLED_STATUS_VALUES, PLANNED_QUALIFICATION_STATUS_VALUES, sqlStatusEqualsAny } from '../lib/status/status-codes';
import { classificarStatusPorVencimento, diasEntreDatas } from '../lib/status/operational-status';
import { getSchemaColumns, hasSchemaTable } from '../utils/db-schema';
import { withD1Retry } from '../utils/d1-resilience';
import { type EmployeeSectorAccess } from '../middleware/employee-sector-access';
import { normalizeAircraftModel, parseLegacyAircraftModels, resolveEmployeeAircraftModels } from './training-compliance-aircraft';
import {
  TRAINING_COMPLIANCE_SCOPES,
  resolveTrainingComplianceRules,
  trainingComplianceRuleApplies,
  hydrateTrainingComplianceConditions,
  trainingComplianceEvidenceMeetsRequiredModality,
  trainingComplianceEligibleCategorySql,
  type TrainingComplianceScope,
} from './training-compliance-rule-engine';
import { buildQualificationEvidenceProfileSql } from './training-compliance-evidence-profile';
import { getTodayIsoSaoPaulo } from '../utils/qualificacoes-alerta-config';
import { trainingComplianceEvidenceIsRealizedBy } from './training-compliance-enrollment-policy';

export const SCOPES = TRAINING_COMPLIANCE_SCOPES;
export const OBRIGATORIEDADES = ['OBRIGATORIA', 'RECOMENDADA', 'NAO_APLICA'] as const;
export const ORIGENS = [
  'REGULATORIO',
  'PTO',
  'MANUAL',
  'SGSO',
  'RH',
  'CLIENTE',
  'EMPRESA',
  'OUTRO',
] as const;
export type Scope = TrainingComplianceScope;
type Obrigatoriedade = (typeof OBRIGATORIEDADES)[number];
type Origem = (typeof ORIGENS)[number];
export type ComplianceStatus = 'CONFORME' | 'VENCENDO' | 'VENCIDO' | 'NAO_REALIZADO' | 'EM_ANDAMENTO';
type Employee = {
  id: number;
  nome: string;
  cpf: string | null;
  matricula: string | null;
  email: string | null;
  telefone: string | null;
  setor_id: number | null;
  setor_nome: string | null;
  funcao_id: number | null;
  funcao_nome: string | null;
  aeronaves_modelos: string[];
  condicoes_ids: number[];
};
export type Rule = {
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
  condicao_id: number | null;
  condicao_codigo: string | null;
  condicao_nome: string | null;
  justificativa: string | null;
  perfil_competencia: string | null;
  modalidade_requerida: string | null;
  fundamento_tipo: string | null;
  fundamento_documento: string | null;
  fundamento_item: string | null;
  validade_fonte: 'MODELO' | 'EVIDENCIA';
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
  progresso_pct?: number | null;
  modalidade?: string | null;
  // undefined = schema anterior a 0519 (compatibilidade de rollout); null = evidência sem perfil gravado.
  perfil_competencia?: string | null;
};
export const tableExists = hasSchemaTable;
export const columnSet = getSchemaColumns;
export function asPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
export function normalizeEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  const normalized = String(value || '').trim().toUpperCase();
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T[number]) : fallback;
}
export const ruleApplies = trainingComplianceRuleApplies;
export const resolvedRules = resolveTrainingComplianceRules;
export async function loadEmployees(db: D1Database, empresaId: number): Promise<Employee[]> {
  const cols = await columnSet(db, 'funcionarios');
  const hasSetorId = cols.has('setor_id');
  const hasFuncaoId = cols.has('funcao_id');
  const statusExpr = cols.has('status') ? "UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'" : '1 = 1';
  const ativoExpr = cols.has('ativo') ? 'AND COALESCE(f.ativo, 1) = 1' : '';
  const deletedExpr = cols.has('deleted_at') ? 'AND f.deleted_at IS NULL' : '';
  const { results } = await withD1Retry(() =>
    db
      .prepare(
        `SELECT f.id, f.nome,
              ${cols.has('cpf') ? 'f.cpf' : 'NULL'} AS cpf,
              ${cols.has('matricula') ? 'f.matricula' : 'NULL'} AS matricula,
              ${cols.has('email') ? 'f.email' : 'NULL'} AS email,
              ${cols.has('telefone') ? 'f.telefone' : 'NULL'} AS telefone,
              ${hasSetorId ? 'f.setor_id' : 'NULL'} AS setor_id,
              ${hasFuncaoId ? 'f.funcao_id' : 'NULL'} AS funcao_id,
              ${cols.has('aeronave') ? 'f.aeronave' : 'NULL'} AS aeronave_legacy,
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
      .all<Omit<Employee, 'aeronaves_modelos'> & { aeronave_legacy: string | null }>(),
  );

  const legacyAircraftByEmployee = new Map<number, string[]>();
  const employees: Employee[] = (results || []).map((row) => {
    legacyAircraftByEmployee.set(Number(row.id), parseLegacyAircraftModels(row.aeronave_legacy));
    const { aeronave_legacy: _legacyAircraft, ...employee } = row;
    return {
      ...employee,
      aeronaves_modelos: [],
      condicoes_ids: [],
    };
  });
  if (!(await tableExists(db, 'funcionarios_aeronaves')) || !(await tableExists(db, 'aeronaves'))) {
    return hydrateTrainingComplianceConditions(db, empresaId, employees);
  }
  const faCols = await columnSet(db, 'funcionarios_aeronaves');
  const aircraftCols = await columnSet(db, 'aeronaves');
  if (!aircraftCols.has('modelo'))
    return hydrateTrainingComplianceConditions(db, empresaId, employees);
  const faDeletedExpr = faCols.has('deleted_at') ? 'AND fa.deleted_at IS NULL' : '';
  const faActiveExpr = faCols.has('ativo') ? 'AND COALESCE(fa.ativo,1)=1' : '';
  const faStartExpr = faCols.has('data_inicio')
    ? "AND (fa.data_inicio IS NULL OR date(fa.data_inicio) <= date('now'))"
    : '';
  const faEndExpr = faCols.has('data_fim')
    ? "AND (fa.data_fim IS NULL OR date(fa.data_fim) >= date('now'))"
    : '';
  const aircraftDeletedExpr = aircraftCols.has('deleted_at') ? 'AND a.deleted_at IS NULL' : '';
  const modelRows = await withD1Retry(() =>
    db
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
      .all<{ funcionario_id: number; modelo: string }>(),
  );
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  for (const row of modelRows.results || []) {
    const employee = byId.get(Number(row.funcionario_id));
    const model = normalizeAircraftModel(row.modelo);
    if (!employee || !model || employee.aeronaves_modelos.includes(model)) continue;
    employee.aeronaves_modelos.push(model);
  }
  for (const employee of employees) {
    employee.aeronaves_modelos = resolveEmployeeAircraftModels(
      employee.aeronaves_modelos,
      legacyAircraftByEmployee.get(employee.id)?.join(' / ') || null,
    );
  }
  return hydrateTrainingComplianceConditions(db, empresaId, employees);
}

export async function loadAircraftModelsCatalog(db: D1Database, empresaId: number) {
  if (!(await tableExists(db, 'aeronaves')))
    return [] as Array<{ modelo: string; aeronaves: number }>;
  const cols = await columnSet(db, 'aeronaves');
  if (!cols.has('modelo')) return [] as Array<{ modelo: string; aeronaves: number }>;
  const deletedExpr = cols.has('deleted_at') ? 'AND deleted_at IS NULL' : '';
  const { results } = await withD1Retry(() =>
    db
      .prepare(
        `SELECT UPPER(TRIM(modelo)) AS modelo, COUNT(*) AS aeronaves
         FROM aeronaves
        WHERE empresa_id=? AND TRIM(COALESCE(modelo,''))<>'' ${deletedExpr}
        GROUP BY UPPER(TRIM(modelo))
        ORDER BY UPPER(TRIM(modelo))`,
      )
      .bind(empresaId)
      .all<{ modelo: string; aeronaves: number }>(),
  );
  return (results || [])
    .map((row) => ({
      modelo: normalizeAircraftModel(row.modelo) || '',
      aeronaves: Number(row.aeronaves),
    }))
    .filter((row) => Boolean(row.modelo));
}

export async function loadRules(db: D1Database, empresaId: number): Promise<Rule[]> {
  const hasV2 = await tableExists(db, 'treinamento_requisitos');
  const tipoCols = await columnSet(db, 'qualificacoes_tipos');
  const validadeExpr = tipoCols.has('validade')
    ? 'qt.validade'
    : tipoCols.has('validade_meses')
      ? 'qt.validade_meses'
      : 'NULL';
  if (!hasV2) {
    if (!(await tableExists(db, 'matriz_treinamento_funcao'))) return [];
    const { results } = await withD1Retry(() =>
      db
        .prepare(
          `SELECT m.id, m.empresa_id, m.qualificacao_tipo_id,
                qt.nome AS qualificacao_tipo_nome, qt.codigo AS qualificacao_tipo_codigo,
                ${validadeExpr} AS validade_meses,
                'FUNCAO' AS escopo, NULL AS setor_id, NULL AS setor_nome,
                m.funcao_id, fn.nome AS funcao_nome,
                NULL AS funcionario_id, NULL AS funcionario_nome,
                NULL AS aeronave_modelo,
                NULL AS condicao_id, NULL AS condicao_codigo, NULL AS condicao_nome,
                NULL AS justificativa, NULL AS perfil_competencia, NULL AS modalidade_requerida, NULL AS fundamento_tipo, NULL AS fundamento_documento, NULL AS fundamento_item, 'EVIDENCIA' AS validade_fonte,
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
            AND ${trainingComplianceEligibleCategorySql('qt.categoria')}
          ORDER BY qt.nome ASC, m.id ASC`,
        )
        .bind(empresaId)
        .all<Rule>(),
    );
    return (results || []).map((rule) => ({ ...rule, aeronave_modelo: null }));
  }

  const ruleCols = await columnSet(db, 'treinamento_requisitos');
  const aircraftExpr = ruleCols.has('aeronave_modelo') ? 'tr.aeronave_modelo' : 'NULL';
  const hasConditions =
    ruleCols.has('condicao_id') && (await tableExists(db, 'compliance_condicoes'));
  const conditionIdExpr = ruleCols.has('condicao_id') ? 'tr.condicao_id' : 'NULL';
  const justificationExpr = ruleCols.has('justificativa') ? 'tr.justificativa' : 'NULL';
  const profileExpr = ruleCols.has('perfil_competencia') ? 'tr.perfil_competencia' : 'NULL';
  const modalityExpr = ruleCols.has('modalidade_requerida') ? 'tr.modalidade_requerida' : 'NULL';
  const foundationTypeExpr = ruleCols.has('fundamento_tipo') ? 'tr.fundamento_tipo' : 'NULL';
  const foundationDocumentExpr = ruleCols.has('fundamento_documento')
    ? 'tr.fundamento_documento'
    : 'NULL';
  const foundationItemExpr = ruleCols.has('fundamento_item') ? 'tr.fundamento_item' : 'NULL';
  const validitySourceExpr = ruleCols.has('validade_fonte') ? 'tr.validade_fonte' : "'EVIDENCIA'";
  const { results } = await withD1Retry(() =>
    db
      .prepare(
        `SELECT tr.id, tr.empresa_id, tr.qualificacao_tipo_id,
              qt.nome AS qualificacao_tipo_nome,
              qt.codigo AS qualificacao_tipo_codigo,
              ${validadeExpr} AS validade_meses,
              tr.escopo, tr.setor_id, s.nome AS setor_nome,
              tr.funcao_id, fn.nome AS funcao_nome,
              tr.funcionario_id, fu.nome AS funcionario_nome,
              ${aircraftExpr} AS aeronave_modelo,
              ${conditionIdExpr} AS condicao_id,
              ${hasConditions ? 'cc.codigo' : 'NULL'} AS condicao_codigo,
              ${hasConditions ? 'cc.nome' : 'NULL'} AS condicao_nome,
              ${justificationExpr} AS justificativa,
              ${profileExpr} AS perfil_competencia,
              ${modalityExpr} AS modalidade_requerida,
              ${foundationTypeExpr} AS fundamento_tipo,
              ${foundationDocumentExpr} AS fundamento_documento,
              ${foundationItemExpr} AS fundamento_item,
              ${validitySourceExpr} AS validade_fonte,
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
         ${hasConditions ? 'LEFT JOIN compliance_condicoes cc ON cc.id = tr.condicao_id AND cc.empresa_id = tr.empresa_id AND cc.deleted_at IS NULL' : ''}
        WHERE tr.empresa_id = ?
          AND tr.ativo = 1
          AND tr.deleted_at IS NULL
          AND ${trainingComplianceEligibleCategorySql('qt.categoria')}
          AND (tr.vigencia_inicio IS NULL OR date(tr.vigencia_inicio) <= date('now'))
          AND (tr.vigencia_fim IS NULL OR date(tr.vigencia_fim) >= date('now'))
        ORDER BY qt.nome ASC, tr.id ASC`,
      )
      .bind(empresaId)
      .all<Rule>(),
  );
  return (results || []).map((rule) => ({
    ...rule,
    aeronave_modelo: normalizeAircraftModel(rule.aeronave_modelo),
    condicao_id: rule.condicao_id ? Number(rule.condicao_id) : null,
    validade_fonte: rule.validade_fonte === 'MODELO' ? 'MODELO' : 'EVIDENCIA',
  }));
}

export async function loadQualificationEvidence(
  db: D1Database,
  empresaId: number,
): Promise<Map<string, Evidence[]>> {
  const map = new Map<string, Evidence[]>();
  if (!(await tableExists(db, 'qualificacoes_historico'))) return map;
  const cols = await columnSet(db, 'qualificacoes_historico');
  const tipoCol = ['tipo_qualificacao_id', 'qualificacao_id', 'tipo_id'].find((name) =>
    cols.has(name)) ?? null;
  if (!tipoCol) return map;
  const dataCol = ['data_realizacao', 'data_conclusao'].find((name) =>
    cols.has(name)) ?? null;
  const vencCol = ['data_vencimento', 'data_validade'].find((name) =>
    cols.has(name)) ?? null;
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
  const qualificationTypeCols = await columnSet(db, 'qualificacoes_tipos');
  const modalitySelect = trainingComplianceHistoricalModalitySql(
    cols.has('formato_codigo'), qualificationTypeCols.has('tipo'), cols.has('qualificacao_codigo'), qualificationTypeCols.has('categoria'),
  );
  const { joins: typeIdentityJoins, resolvedTypeSql: resolvedTipoSelect } = trainingComplianceHistoryIdentitySql(
    tipoCol, cols.has('qualificacao_codigo'), qualificationTypeCols.has('ativo'),
  );
  const profileSql = await buildQualificationEvidenceProfileSql(db, cols);

  const { results } = await withD1Retry(() =>
    db
      .prepare(
        `SELECT qh.id, qh.funcionario_id, ${resolvedTipoSelect} AS tipo_id,
              qh.${dataCol} AS data_realizacao, ${vencSelect} AS data_vencimento,
              ${modalitySelect} AS modalidade, ${profileSql.select} AS perfil_competencia
         FROM qualificacoes_historico qh
         JOIN funcionarios f ON f.id = qh.funcionario_id
         ${typeIdentityJoins}
         ${profileSql.joins}
        WHERE ${empresaExpr}
          ${deletedExpr}
          AND NOT (${sqlStatusEqualsAny(statusExpr, CANCELLED_STATUS_VALUES)})
          AND NOT (${sqlStatusEqualsAny(statusExpr, PLANNED_QUALIFICATION_STATUS_VALUES)})
        ORDER BY qh.funcionario_id, ${resolvedTipoSelect},
                 datetime(COALESCE(qh.${dataCol}, ${updatedExpr}, ${vencSelect})) DESC, qh.id DESC`,
      )
      .bind(empresaId)
      .all<{
        id: number;
        funcionario_id: number;
        tipo_id: number;
        data_realizacao: string | null;
        data_vencimento: string | null;
        modalidade: string | null;
        perfil_competencia: string | null;
      }>(),
  );

  for (const row of results || []) {
    const key = `${row.funcionario_id}:${row.tipo_id}`;
    const bucket = map.get(key) || [];
    bucket.push({
      funcionario_id: row.funcionario_id,
      tipo_id: row.tipo_id,
      data_realizacao: row.data_realizacao,
      data_vencimento: row.data_vencimento,
      origem: 'QUALIFICACAO',
      origem_id: row.id,
      origem_titulo: null,
      modalidade: row.modalidade || null,
      perfil_competencia: profileSql.available ? row.perfil_competencia || null : undefined,
    });
    map.set(key, bucket);
  }
  return map;
}

export async function loadLmsEvidence(
  db: D1Database,
  empresaId: number,
): Promise<Map<string, Evidence[]>> {
  const map = new Map<string, Evidence[]>();
  if (!(await tableExists(db, 'lms_matriculas')) || !(await tableExists(db, 'lms_cursos')))
    return map;
  const matriculaCols = await columnSet(db, 'lms_matriculas');
  const hasProfile = matriculaCols.has('perfil_competencia');
  const profileSelect = hasProfile ? 'm.perfil_competencia' : 'NULL';
  const { results } = await withD1Retry(() =>
    db
      .prepare(
        `SELECT m.id, m.funcionario_id, c.qualificacao_tipo_id AS tipo_id,
              m.status, m.progresso_pct, m.data_conclusao, m.updated_at, c.titulo, 'EAD' AS modalidade,
              ${profileSelect} AS perfil_competencia
         FROM lms_matriculas m
         JOIN lms_cursos c
           ON c.id = m.curso_id
          AND c.empresa_id = m.empresa_id
          AND c.deleted_at IS NULL
        WHERE m.empresa_id = ?
          AND m.deleted_at IS NULL
          AND c.qualificacao_tipo_id IS NOT NULL
          AND UPPER(COALESCE(m.status, '')) <> 'CANCELADO'
        ORDER BY m.funcionario_id, c.qualificacao_tipo_id,
                 datetime(COALESCE(m.data_conclusao, m.updated_at, m.created_at)) DESC, m.id DESC`,
      )
      .bind(empresaId)
      .all<{
        id: number;
        funcionario_id: number;
        tipo_id: number;
        status: string;
        progresso_pct: number | null;
        data_conclusao: string | null;
        titulo: string | null;
        modalidade: string | null;
        perfil_competencia: string | null;
      }>(),
  );
  for (const row of results || []) {
    const key = `${row.funcionario_id}:${row.tipo_id}`;
    const bucket = map.get(key) || [];
    bucket.push({
      funcionario_id: row.funcionario_id,
      tipo_id: row.tipo_id,
      data_realizacao: row.data_conclusao,
      data_vencimento: null,
      origem: 'LMS',
      origem_id: row.id,
      origem_titulo: row.titulo,
      lms_status: row.status,
      progresso_pct: row.progresso_pct,
      modalidade: row.modalidade || 'EAD',
      perfil_competencia: hasProfile ? row.perfil_competencia || null : undefined,
    });
    map.set(key, bucket);
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

function normalizeCompetencyProfile(value: unknown): string | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized || null;
}

function evidenceMatchesCompetencyProfile(
  requiredProfile: string | null | undefined,
  evidence: Evidence,
): boolean {
  const required = normalizeCompetencyProfile(requiredProfile);
  if (!required) return true;
  // Compatibilidade transitória: antes da migration 0518 a coluna não existe.
  // Depois de 0518, NULL significa evidência realmente não classificada e não
  // pode satisfazer um requisito perfilado.
  if (evidence.perfil_competencia === undefined) return true;
  return normalizeCompetencyProfile(evidence.perfil_competencia) === required;
}

function newestEvidence(items: Evidence[]): Evidence | undefined {
  return items[0];
}

/** Corte "evidência não é futura": nunca atrás da data operacional, aceita a data UTC dos gravadores. */
function resolveRealizedCutoff(today: string): string {
  const utcToday = new Date().toISOString().slice(0, 10);
  return utcToday > today ? utcToday : today;
}

export function computeRequirement(
  rule: Rule,
  historyItems: Evidence[] | undefined,
  lmsItems: Evidence[] | undefined,
  options?: { today?: string; realizedCutoff?: string },
) {
  // Vencimento é classificado pela data operacional (America/Sao_Paulo): a data UTC adianta o
  // "hoje" entre 21h e 24h BRT e marcava VENCIDO, nessas horas, um item que ainda vence hoje.
  const today = options?.today ?? getTodayIsoSaoPaulo();
  // As conclusões (LMS/Histórico) são gravadas com a data UTC. O corte "evidência não é futura"
  // precisa aceitá-las no mesmo dia civil UTC, senão uma conclusão de 21h–24h BRT sumiria até a
  // meia-noite. O corte nunca fica atrás da data operacional.
  const realizedCutoff = options?.realizedCutoff ?? options?.today ?? resolveRealizedCutoff(today);
  const allHistory = historyItems || [];
  const allLms = lmsItems || [];
  const historyForProfile = allHistory.filter(
    (item) => evidenceMatchesCompetencyProfile(rule.perfil_competencia, item) && trainingComplianceEvidenceIsRealizedBy(item.data_realizacao, realizedCutoff),
  );
  const lmsForProfile = allLms.filter((item) =>
    evidenceMatchesCompetencyProfile(rule.perfil_competencia, item),
  );
  const completedLmsForProfile = lmsForProfile.filter(
    (item) => String(item.lms_status || '').toUpperCase() === 'CONCLUIDO' && trainingComplianceEvidenceIsRealizedBy(item.data_realizacao, realizedCutoff),
  );
  const compatibleHistory = historyForProfile.filter((item) =>
    trainingComplianceEvidenceMeetsRequiredModality(rule.modalidade_requerida, item.modalidade),
  );
  const compatibleCompletedLms = completedLmsForProfile.filter((item) =>
    trainingComplianceEvidenceMeetsRequiredModality(rule.modalidade_requerida, item.modalidade),
  );
  const candidateEvidence = latestEvidence(
    newestEvidence(historyForProfile),
    newestEvidence(completedLmsForProfile),
  );
  const evidence = latestEvidence(
    newestEvidence(compatibleHistory),
    newestEvidence(compatibleCompletedLms),
  );
  const profileMismatch = Boolean(
    normalizeCompetencyProfile(rule.perfil_competencia) &&
    (allHistory.length > 0 || allLms.length > 0) &&
    historyForProfile.length === 0 &&
    lmsForProfile.length === 0,
  );
  const modalityMismatch = Boolean(candidateEvidence && !evidence && rule.modalidade_requerida);
  const currentLms = newestEvidence(lmsForProfile);
  let status_compliance: ComplianceStatus = 'NAO_REALIZADO';
  let data_validade: string | null = null;
  let dias_para_vencer: number | null = null;

  if (evidence?.data_realizacao) {
    if (evidence.data_vencimento && (rule.validade_fonte === 'EVIDENCIA' || (rule.qualificacao_tipo_codigo === 'AVSEC_CONSC' && !rule.validade_meses))) {
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
    !profileMismatch &&
    !modalityMismatch &&
    currentLms &&
    trainingComplianceEvidenceMeetsRequiredModality(
      rule.modalidade_requerida,
      currentLms.modalidade,
    ) &&
    String(currentLms.lms_status || '').toUpperCase() === 'EM_ANDAMENTO'
  ) {
    status_compliance = 'EM_ANDAMENTO';
  }

  const evidenceReviewReason =
    status_compliance !== 'NAO_REALIZADO' ? null :
    modalityMismatch && candidateEvidence?.data_realizacao ? 'MODALIDADE' :
    profileMismatch && allHistory.some((item) => trainingComplianceEvidenceIsRealizedBy(item.data_realizacao, realizedCutoff)) ? 'PERFIL' : null;

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
    condicao_id: rule.condicao_id,
    condicao_codigo: rule.condicao_codigo,
    condicao_nome: rule.condicao_nome,
    justificativa: rule.justificativa,
    perfil_competencia: rule.perfil_competencia,
    modalidade_requerida: rule.modalidade_requerida,
    auto_matricular_ead: rule.auto_matricular_ead,
    fundamento_tipo: rule.fundamento_tipo,
    fundamento_documento: rule.fundamento_documento,
    fundamento_item: rule.fundamento_item,
    validade_fonte: rule.validade_fonte,
    ultima_data: evidence?.data_realizacao ?? null,
    data_validade,
    dias_para_vencer,
    status: status_legacy as 'EM_DIA' | 'VENCIDO' | 'EM_FALTA',
    status_compliance,
    evidencia_origem: evidence?.origem ?? null,
    evidencia_perfil_competencia:
      evidence?.perfil_competencia ?? candidateEvidence?.perfil_competencia ?? null,
    evidencia_perfil_incompativel: profileMismatch,
    evidencia_modalidade: evidence?.modalidade ?? candidateEvidence?.modalidade ?? null,
    evidencia_modalidade_incompativel: modalityMismatch,
    evidencia_pendente_validacao: evidenceReviewReason !== null,
    evidencia_pendente_motivo: evidenceReviewReason,
    evidencia_id: evidence?.origem_id ?? null,
    curso_ead_titulo: currentLms?.origem_titulo ?? evidence?.origem_titulo ?? null,
    progresso_pct: status_compliance === 'EM_ANDAMENTO' && currentLms?.progresso_pct != null && Number.isFinite(Number(currentLms.progresso_pct))
      ? Math.max(0, Math.min(100, Math.round(Number(currentLms.progresso_pct))))
      : null,
    lms_status:
      currentLms?.lms_status ?? newestEvidence(completedLmsForProfile)?.lms_status ?? null,
  };
}

export function filterEmployeesByAccess(employees: Employee[], access: EmployeeSectorAccess): Employee[] {
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

export type TrainingComplianceTargetFilter = {
  setorId?: number | null;
  funcaoId?: number | null;
  funcionarioId?: number | null;
};

export async function buildSnapshot(
  db: D1Database,
  empresaId: number,
  access: EmployeeSectorAccess,
  targetFilter?: TrainingComplianceTargetFilter,
) {
  const [allEmployees, rules, historyMap, lmsMap] = await Promise.all([
    loadEmployees(db, empresaId),
    loadRules(db, empresaId),
    loadQualificationEvidence(db, empresaId),
    loadLmsEvidence(db, empresaId),
  ]);
  let employees = filterEmployeesByAccess(allEmployees, access);
  if (targetFilter?.setorId != null) {
    employees = employees.filter((employee) => employee.setor_id === targetFilter.setorId);
  }
  if (targetFilter?.funcaoId != null) {
    employees = employees.filter((employee) => employee.funcao_id === targetFilter.funcaoId);
  }
  if (targetFilter?.funcionarioId != null) {
    employees = employees.filter((employee) => employee.id === targetFilter.funcionarioId);
  }
  // Datas de referência calculadas uma vez por snapshot, não por par funcionário×requisito.
  const today = getTodayIsoSaoPaulo();
  const dateOptions = { today, realizedCutoff: resolveRealizedCutoff(today) };

  const people = employees.map((employee) => {
    const resolved = resolvedRules(rules, employee);
    const requirements = resolved
      .filter((rule) => rule.obrigatoriedade !== 'NAO_APLICA')
      .map((rule) =>
        computeRequirement(
          rule,
          historyMap.get(`${employee.id}:${rule.qualificacao_tipo_id}`),
          lmsMap.get(`${employee.id}:${rule.qualificacao_tipo_id}`),
          dateOptions,
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

export type TrainingComplianceSnapshot = Awaited<ReturnType<typeof buildSnapshot>>;
