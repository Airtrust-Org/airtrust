import { Hono } from 'hono';
import {
  createTrainingComplianceReconciliationActions,
  loadReconciliationDecisions,
  type LmsEnrollment,
} from './compliance-treinamentos-reconciliation-actions';
import {
  reconcileTrainingComplianceRuleEnrollment,
  sanitizeComplianceEnrollmentResponse,
} from '../services/training-compliance-rule-enrollment';
import { reconcileFdmMaintenance72 } from '../services/training-compliance-fdm72-reconciliation';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import { createTrainingComplianceIntelligenceRoutes } from './compliance-treinamentos-intelligence';
import { aggregateDistinctMandatoryRequirements, createTrainingComplianceRequirementRoutes } from './compliance-treinamentos-requirements';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../utils/auditoria';
import { matchesSearchText, normalizeSearchText } from '../utils/text-search';
import { withD1Retry } from '../utils/d1-resilience';
import {
  assertFuncionarioInScope,
  filterRequestedSetorIdsByAccess,
  getEmployeeSectorAccess,
  type EmployeeSectorAccess,
} from '../middleware/employee-sector-access';
import {
  insertTrainingComplianceRequirement,
  isGovernedTrainingComplianceRequirement,
  updateTrainingComplianceRequirement,
} from '../services/training-compliance-rule-write';
import { normalizeAircraftModel } from '../services/training-compliance-aircraft';
import {
  trainingComplianceRulePriority,
  withTrainingComplianceRuleImpact,
  normalizeTrainingComplianceRequiredModality,
  trainingComplianceEligibleCategorySql,
} from '../services/training-compliance-rule-engine';
import {
  TRAINING_COMPLIANCE_ENROLLMENT_RENEWAL_WINDOW_DAYS,
  trainingComplianceNeedsEnrollment,
} from '../services/training-compliance-enrollment-policy';
import { summarizeTrainingComplianceCourses } from '../services/training-compliance-training-summary';
import {
  SCOPES,
  OBRIGATORIEDADES,
  ORIGENS,
  type Scope,
  type ComplianceStatus,
  type Rule,
  tableExists,
  columnSet,
  asPositiveInt,
  normalizeEnum,
  resolvedRules,
  ruleApplies,
  loadEmployees,
  loadAircraftModelsCatalog,
  loadRules,
  loadQualificationEvidence,
  loadLmsEvidence,
  computeRequirement,
  filterEmployeesByAccess,
  buildSnapshot,
} from '../services/training-compliance-snapshot-builder';
import conditionsRouter from './compliance-treinamentos-conditions';
// O motor do snapshot vive em services/training-compliance-snapshot-builder.
// Re-exportado aqui para os consumidores que ainda importam desta rota.
export { buildSnapshot, ruleApplies, resolvedRules, type TrainingComplianceSnapshot } from '../services/training-compliance-snapshot-builder';
const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

async function loadLmsEnrollments(db: D1Database, empresaId: number): Promise<LmsEnrollment[]> {
  try {
    if (!(await tableExists(db, 'lms_matriculas')) || !(await tableExists(db, 'lms_cursos')))
      return [];
    const funcionarioCols = await columnSet(db, 'funcionarios');
    const activeExpr = funcionarioCols.has('ativo') ? 'AND COALESCE(f.ativo, 1) = 1' : '';
    const statusExpr = funcionarioCols.has('status')
      ? "AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'"
      : '';
    const deletedFuncionario = funcionarioCols.has('deleted_at') ? 'AND f.deleted_at IS NULL' : '';
    const { results } = await withD1Retry(() =>
      db
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
            AND UPPER(TRIM(COALESCE(m.status,''))) IN ('NAO_INICIADO','EM_ANDAMENTO')
            AND (qt.id IS NULL OR ${trainingComplianceEligibleCategorySql('qt.categoria')})
            ${deletedFuncionario} ${activeExpr} ${statusExpr}
          ORDER BY c.titulo, f.nome, m.id`,
        )
        .bind(empresaId)
        .all<LmsEnrollment>(),
    );
    return results || [];
  } catch (err) {
    console.warn('[RECONCILIACAO] Falha ao carregar matrículas LMS:', (err as Error).message);
    return [];
  }
}

async function loadActiveLmsCourses(db: D1Database, empresaId: number) {
  try {
    if (!(await tableExists(db, 'lms_cursos')))
      return [] as Array<{ id: number; titulo: string; qualificacao_tipo_id: number }>;
    const cols = await columnSet(db, 'lms_cursos');
    const ativoExpr = cols.has('ativo') ? 'AND COALESCE(ativo,1)=1' : '';
    const deletedExpr = cols.has('deleted_at') ? 'AND deleted_at IS NULL' : '';
    const { results } = await withD1Retry(() =>
      db
        .prepare(
          `SELECT id,titulo,qualificacao_tipo_id FROM lms_cursos
          WHERE empresa_id=? AND qualificacao_tipo_id IS NOT NULL ${ativoExpr} ${deletedExpr}
          ORDER BY titulo`,
        )
        .bind(empresaId)
        .all<{ id: number; titulo: string; qualificacao_tipo_id: number }>(),
    );
    return results || [];
  } catch (err) {
    console.warn('[RECONCILIACAO] Falha ao carregar cursos ativos LMS:', (err as Error).message);
    return [] as Array<{ id: number; titulo: string; qualificacao_tipo_id: number }>;
  }
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
  const tipo = await db.prepare(
    `SELECT id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND ${trainingComplianceEligibleCategorySql('categoria')}`,
  ).bind(qualificacaoTipoId, empresaId).first<{ id: number }>();
  if (!tipo) throw new ApiError('Tipo de qualificação inválido ou categoria excluída do Compliance', 400);

  const escopo = normalizeEnum(payload.escopo, SCOPES, 'FUNCAO');
  const setorId = asPositiveInt(payload.setor_id);
  const funcaoId = asPositiveInt(payload.funcao_id);
  const funcionarioId = asPositiveInt(payload.funcionario_id);
  const aeronaveModelo = normalizeAircraftModel(payload.aeronave_modelo);
  const condicaoId = asPositiveInt(payload.condicao_id);

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
  if (condicaoId) {
    if (!(await tableExists(db, 'compliance_condicoes')))
      throw new ApiError('Schema de condições ainda não aplicado', 409);
    const condition = await db
      .prepare(
        'SELECT id FROM compliance_condicoes WHERE id=? AND empresa_id=? AND ativo=1 AND deleted_at IS NULL',
      )
      .bind(condicaoId, empresaId)
      .first();
    if (!condition) throw new ApiError('Condição inválida para a empresa atual', 400);
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
    condicao_id: condicaoId,
    justificativa: payload.justificativa ? String(payload.justificativa).trim() : null,
    perfil_competencia: payload.perfil_competencia
      ? String(payload.perfil_competencia).trim()
      : null,
    modalidade_requerida: normalizeTrainingComplianceRequiredModality(payload.modalidade_requerida),
    fundamento_tipo: payload.fundamento_tipo ? String(payload.fundamento_tipo).trim() : null,
    fundamento_documento: payload.fundamento_documento
      ? String(payload.fundamento_documento).trim()
      : null,
    fundamento_item: payload.fundamento_item ? String(payload.fundamento_item).trim() : null,
    validade_fonte:
      String(payload.validade_fonte || 'MODELO').toUpperCase() === 'EVIDENCIA'
        ? ('EVIDENCIA' as const)
        : ('MODELO' as const),
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

app.route('/', createTrainingComplianceIntelligenceRoutes({ buildSnapshot, tableExists }));
app.route('/', createTrainingComplianceRequirementRoutes({ buildSnapshot }));
app.route('/', conditionsRouter);

app.get('/capabilities', async (c) => {
  const db = c.env.DB;
  const schemaReady = await tableExists(db, 'treinamento_requisitos');
  const requirementColumns = schemaReady
    ? await columnSet(db, 'treinamento_requisitos')
    : new Set<string>();
  const aircraftScopeReady = requirementColumns.has('aeronave_modelo');
  const conditionalScopeReady =
    requirementColumns.has('condicao_id') &&
    requirementColumns.has('justificativa') &&
    requirementColumns.has('perfil_competencia') &&
    requirementColumns.has('modalidade_requerida') &&
    requirementColumns.has('fundamento_tipo') &&
    requirementColumns.has('fundamento_documento') &&
    requirementColumns.has('fundamento_item') &&
    requirementColumns.has('validade_fonte') &&
    (await tableExists(db, 'compliance_condicoes')) &&
    (await tableExists(db, 'funcionarios_compliance_condicoes'));
  return c.json({
    success: true,
    data: {
      schema_ready: schemaReady,
      aircraft_scope_ready: aircraftScopeReady,
      conditional_scope_ready: conditionalScopeReady,
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
      funcionarios: employees.map((employee) => ({
        id: employee.id,
        nome: employee.nome,
        matricula: employee.matricula,
        setor_id: employee.setor_id,
        funcao_id: employee.funcao_id,
      })),
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
  const visibleRules = rules.filter((rule) => {
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
  const data = withTrainingComplianceRuleImpact(visibleRules, rules, scopedEmployees);
  return c.json({
    success: true,
    data,
    meta: {
      schema_ready: await tableExists(c.env.DB, 'treinamento_requisitos'),
      aircraft_scope_ready: (await columnSet(c.env.DB, 'treinamento_requisitos')).has(
        'aeronave_modelo',
      ),
    },
  });
});

app.post('/reconciliacao/fdm-mnt72/sincronizar', requireRole('admin'), async (c) => {
  const payload = await c.req.json().catch(() => null);
  if (payload?.scope !== 'FDM_MNT_72' || payload?.course_id !== 72) throw new ApiError('Escopo inválido', 400);
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const data = await reconcileFdmMaintenance72(c.env.DB, empresaId, access, extrairUsuarioAuditoria(c), buildSnapshot);
  return c.json({ success: true, data });
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
  const result = await insertTrainingComplianceRequirement(db, empresaId, data);
  const id = Number(result.meta.last_row_id);
  await registrarAuditoria({
    db,
    tabela: 'treinamento_requisitos',
    acao: 'INSERT',
    registro_id: id,
    dados_novos: { empresa_id: empresaId, ...data },
    ...extrairUsuarioAuditoria(c),
  });
  const rawEnrollment = await reconcileTrainingComplianceRuleEnrollment(db, empresaId, id, access, extrairUsuarioAuditoria(c), buildSnapshot);
  const enrollment = sanitizeComplianceEnrollmentResponse(rawEnrollment, c.env.ENVIRONMENT);
  return c.json({ success: true, data: { id, ...enrollment } }, 201);
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
  if (isGovernedTrainingComplianceRequirement(existing)) throw new ApiError('Regra governada por designação regulatória; altere os ocupantes na área de designações.', 409);
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
  await updateTrainingComplianceRequirement(db, empresaId, id, data);
  await registrarAuditoria({
    db,
    tabela: 'treinamento_requisitos',
    acao: 'UPDATE',
    registro_id: id,
    dados_anteriores: existing,
    dados_novos: { empresa_id: empresaId, ...data },
    ...extrairUsuarioAuditoria(c),
  });
  const rawEnrollment = await reconcileTrainingComplianceRuleEnrollment(
    db, empresaId, id, access, extrairUsuarioAuditoria(c), buildSnapshot,
  );
  const enrollment = sanitizeComplianceEnrollmentResponse(rawEnrollment, c.env.ENVIRONMENT);
  return c.json({ success: true, data: enrollment });
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
  if (isGovernedTrainingComplianceRequirement(existing)) throw new ApiError('Regra governada por designação regulatória; altere os ocupantes na área de designações.', 409);
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
  const snapshot = await buildSnapshot(c.env.DB, empresaId, access, { funcionarioId });
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
  const rawConfigurado = String(c.req.query('configurado') || '').trim().toLowerCase();
  const configurado = rawConfigurado === 'true' ? true : rawConfigurado === 'false' ? false : null;
  if (rawConfigurado && configurado === null) throw new ApiError('Filtro configurado inválido', 400);
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
  const q = normalizeSearchText(c.req.query('q'));
  const snapshot = await buildSnapshot(c.env.DB, empresaId, access, { setorId, funcaoId });
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
        (configurado === null || person.configurado === configurado) &&
        (!q || normalizeSearchText(person.nome).includes(q)) &&
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
  const q = normalizeSearchText(c.req.query('q'));
  const [snapshot, activeEnrollments] = await Promise.all([
    buildSnapshot(c.env.DB, empresaId, access, { setorId, funcaoId }),
    loadLmsEnrollments(c.env.DB, empresaId),
  ]);
  const people = snapshot.people.filter(
    (p) =>
      (!setorId || p.setor_id === setorId) &&
      (!funcaoId || p.funcao_id === funcaoId) &&
      (!aeronaveModelo || p.aeronaves_modelos.includes(aeronaveModelo)) &&
      (!q || normalizeSearchText(p.nome).includes(q)),
  );
  const data = summarizeTrainingComplianceCourses(people, activeEnrollments);
  return c.json({ success: true, data });
});

app.get('/setores', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const snapshot = await buildSnapshot(c.env.DB, empresaId, access);
  const requestedSetorId = asPositiveInt(c.req.query('setor_id'));
  const people = snapshot.people.filter(
    (person) => (!requestedSetorId || person.setor_id === requestedSetorId) && matchesSearchText(person.nome, c.req.query('q')),
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
          funcao_nome: person.funcao_nome || 'Sem função',
          people: [],
        };
        current.people.push(person);
        cargos.set(key, current);
      }
      return {
        setor_id: sector.setor_id,
        setor_nome: sector.setor_nome,
        ...aggregateCompliancePeople(sector.people),
        requisitos_distintos: aggregateDistinctMandatoryRequirements(sector.people).length,
        cargos: Array.from(cargos.values())
          .map((cargo) => ({
            funcao_id: cargo.funcao_id,
            funcao_nome: cargo.funcao_nome,
            ...aggregateCompliancePeople(cargo.people),
            requisitos_distintos: aggregateDistinctMandatoryRequirements(cargo.people).length,
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
          WHERE empresa_id=? ${tipoDeletedExpr} ${tipoAtivoExpr} AND ${trainingComplianceEligibleCategorySql('categoria')}
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
  const directPriority =
    directScope === 'SETOR_FUNCAO'
      ? 40 + (aeronaveModelo ? 100 : 0)
      : 20 + (aeronaveModelo ? 100 : 0);
  const data = (tiposResult.results || []).map((tipo) => {
    const candidates = rules
      .filter(
        (rule) =>
          rule.qualificacao_tipo_id === Number(tipo.id) &&
          orgRuleApplies(rule, setorId, funcaoId, aeronaveModelo),
      )
      .sort(
        (a, b) =>
          trainingComplianceRulePriority(b) - trainingComplianceRulePriority(a) || b.id - a.id,
      );
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
      const employeeEffective = resolvedRules(rules, employee).find(
        (rule) => rule.qualificacao_tipo_id === Number(tipo.id),
      );
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
          employeeEffective && trainingComplianceRulePriority(employeeEffective) > directPriority,
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
      matriculados: selectedEmployees.filter(
        (employee) => (lmsMap.get(`${employee.id}:${tipo.id}`)?.length ?? 0) > 0,
      ).length,
      sem_matricula: selectedEmployees.filter(
        (employee) => (lmsMap.get(`${employee.id}:${tipo.id}`)?.length ?? 0) === 0,
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
  const requestId = (c.get as (key: string) => unknown)('requestId') as string || c.req.header('X-Request-ID') || '';

  try {
    const targetFilter = setorId || funcaoId ? { setorId, funcaoId } : undefined;
    const snapshot = await buildSnapshot(db, empresaId, access, targetFilter);
    const people = (snapshot?.people || []).filter(
      (person) =>
        (!setorId || person.setor_id === setorId) &&
        (!funcaoId || person.funcao_id === funcaoId) &&
        (!aeronaveModelo || (person.aeronaves_modelos || []).includes(aeronaveModelo)),
    );
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const allowedIds = new Set(people.map((person) => person.id));
    const [allEnrollments, decisions, courses] = await Promise.all([
      loadLmsEnrollments(db, empresaId),
      loadReconciliationDecisions(db, empresaId),
      loadActiveLmsCourses(db, empresaId),
    ]);
    const enrollments = (allEnrollments || []).filter((row) => allowedIds.has(Number(row.funcionario_id)));
    // A matrícula concluída é evidência histórica e não pode bloquear uma nova
    // matrícula de renovação quando o requisito estiver vencido/vencendo.
    const blockingEnrollmentKeys = new Set(
      enrollments
        .filter(
          (row) =>
            row.qualificacao_tipo_id !== null &&
            row.qualificacao_tipo_id !== undefined &&
            !['CONCLUIDO', 'CONCLUIDA'].includes(
              String(row.status || '')
                .trim()
                .toUpperCase(),
            ),
        )
        .map((row) => `${row.funcionario_id}:${row.qualificacao_tipo_id}`),
    );
    const courseByType = new Map<number, Array<{ id: number; titulo: string }>>();
    for (const course of courses || []) {
      if (!course?.qualificacao_tipo_id) continue;
      const key = Number(course.qualificacao_tipo_id);
      const current = courseByType.get(key) || [];
      current.push({ id: Number(course.id), titulo: course.titulo || '' });
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
      for (const req of person.requisitos || []) {
        const key = `${person.id}:${req.qualificacao_tipo_id}`;
        if (blockingEnrollmentKeys.has(key)) continue;
        if (req.evidencia_pendente_validacao || !trainingComplianceNeedsEnrollment(req.status_compliance, req.dias_para_vencer)) continue;
        // Requisito ja concluido e valido nao deve ser contado como matricula faltante.
        requisitosSemMatricula += 1;
        const current = gaps.get(req.qualificacao_tipo_id) || {
          qualificacao_tipo_id: req.qualificacao_tipo_id,
          qualificacao_tipo_nome: req.qualificacao_tipo_nome ?? null,
          qualificacao_tipo_codigo: req.qualificacao_tipo_codigo ?? null,
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

    // Memoiza resolvedRules por funcionário para evitar N cálculos repetidos
    const resolvedRulesCache = new Map<number, Rule[]>();
    const getEmployeeRules = (emp: typeof people[number]) => {
      let r = resolvedRulesCache.get(emp.id);
      if (!r) {
        r = resolvedRules(snapshot?.rules || [], emp);
        resolvedRulesCache.set(emp.id, r);
      }
      return r;
    };

    const matriculasRevisao = [] as Array<Record<string, unknown>>;
    let alinhadas = 0;
    let avulsasReconciliadas = 0;
    for (const enrollment of enrollments) {
      const employee = peopleById.get(Number(enrollment.funcionario_id));
      if (!employee) continue;
      const effective = enrollment.qualificacao_tipo_id
        ? getEmployeeRules(employee).find(
            (rule) => rule.qualificacao_tipo_id === Number(enrollment.qualificacao_tipo_id),
          )
        : undefined;
      const requirement = (employee.requisitos || []).find((req) => req.qualificacao_tipo_id === Number(enrollment.qualificacao_tipo_id));
      const redundantWithValidEvidence = requirement?.obrigatoriedade === 'OBRIGATORIA'
        && !requirement.evidencia_pendente_validacao && requirement.status_compliance === 'CONFORME'
        && !trainingComplianceNeedsEnrollment(requirement.status_compliance, requirement.dias_para_vencer)
        && enrollment.status === 'NAO_INICIADO';
      let situacao:
        | 'MATRICULA_COM_REQUISITO'
        | 'MATRICULA_REDUNDANTE_EVIDENCIA_VALIDA'
        | 'MATRICULADO_SEM_REQUISITO'
        | 'NAO_APLICA_MATRICULADO'
        | 'CURSO_SEM_MODELO'
        | 'MATRICULA_AVULSA_RECONCILIADA';
      if (!enrollment.qualificacao_tipo_id) situacao = 'CURSO_SEM_MODELO';
      else if (effective?.obrigatoriedade === 'NAO_APLICA') situacao = 'NAO_APLICA_MATRICULADO';
      else if (redundantWithValidEvidence) situacao = 'MATRICULA_REDUNDANTE_EVIDENCIA_VALIDA';
      else if (effective) situacao = 'MATRICULA_COM_REQUISITO';
      else if (decisions?.get(Number(enrollment.id))?.decisao === 'MANTER_AVULSA') {
        situacao = 'MATRICULA_AVULSA_RECONCILIADA';
      } else situacao = 'MATRICULADO_SEM_REQUISITO';
      if (situacao === 'MATRICULA_COM_REQUISITO') {
        alinhadas += 1;
        continue;
      }
      if (situacao === 'MATRICULA_AVULSA_RECONCILIADA') avulsasReconciliadas += 1;
      // Conclusões são evidência histórica, não uma matrícula ativa a cancelar.
      if (['CONCLUIDO', 'CONCLUIDA'].includes(String(enrollment.status || '').trim().toUpperCase())) continue;
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
        decisao: decisions?.get(Number(enrollment.id)) || null,
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
        renovacao_antecipada: gap.funcionarios.filter((p) => p.status_compliance === 'CONFORME').length,
        janela_renovacao_dias: TRAINING_COMPLIANCE_ENROLLMENT_RENEWAL_WINDOW_DAYS,
        cursos_ead: courseByType.get(gap.qualificacao_tipo_id) || [],
      }))
      .sort((a, b) =>
        String(a.qualificacao_tipo_nome || '').localeCompare(
          String(b.qualificacao_tipo_nome || ''),
          'pt-BR',
        ),
      );
    const convitesMatricula = enrollments
      .filter((row) => {
        if (String(row.status || '').trim().toUpperCase() !== 'NAO_INICIADO' || !row.qualificacao_tipo_id) return false;
        const employee = peopleById.get(Number(row.funcionario_id));
        if (!employee) return false;
        const req = (employee.requisitos || []).find(
          (item) => item.qualificacao_tipo_id === Number(row.qualificacao_tipo_id),
        );
        // Nunca convidar alguém já qualificado e válido só porque ainda existe
        // uma matrícula operacional redundante aguardando conciliação.
        return Boolean(
          req?.obrigatoriedade === 'OBRIGATORIA'
          && !req.evidencia_pendente_validacao
          && trainingComplianceNeedsEnrollment(req.status_compliance, req.dias_para_vencer),
        );
      })
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
    let reconciliationReady = false;
    try {
      reconciliationReady = await tableExists(db, 'treinamento_matricula_reconciliacoes');
    } catch {
      reconciliationReady = false;
    }
    return c.json({
      success: true,
      data: {
        resumo: summary,
        gaps_matricula: gapsMatricula,
        matriculas_revisao: matriculasRevisao,
        convites_matricula: convitesMatricula,
      },
      meta: { reconciliation_ready: reconciliationReady },
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.warn('[RECONCILIACAO_HANDLER_ERROR]', {
      error: (err as Error).message,
      stack: (err as Error).stack,
      requestId,
    });
    return c.json({
      success: true,
      data: {
        resumo: {
          matriculas_ativas: 0,
          matriculas_alinhadas: 0,
          requisitos_sem_matricula: 0,
          gaps_matricula_acionaveis: 0,
          matriculados_sem_requisito: 0,
          nao_aplica_matriculados: 0,
          cursos_sem_modelo: 0,
          matriculas_avulsas_reconciliadas: 0,
        },
        gaps_matricula: [],
        matriculas_revisao: [],
        convites_matricula: [],
      },
      meta: { reconciliation_ready: false, degraded: true },
    });
  }
});

// Limpeza governada por demanda: preview por padrão, escrita apenas após confirmação.
// Nunca cancela curso fora da matriz, matrícula concluída ou designação avulsa mantida.
// Uma alteração de cargo/requisito entre preview e aplicação é revalidada no servidor.
app.route('/reconciliacao', createTrainingComplianceReconciliationActions({
  buildSnapshot,
  loadLmsEnrollments,
  loadReconciliationDecisions,
  tableExists,
  isRequired: (snapshot, person, typeId) => resolvedRules(snapshot.rules, person).some(
    (rule) => Number(rule.qualificacao_tipo_id) === typeId && rule.obrigatoriedade !== 'NAO_APLICA',
  ),
}));

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
  const q = normalizeSearchText(c.req.query('q'));
  const snapshot = await buildSnapshot(c.env.DB, empresaId, access, { setorId, funcaoId });
  const people = snapshot.people.filter(
    (p) =>
      (!setorId || p.setor_id === setorId) &&
      (!funcaoId || p.funcao_id === funcaoId) &&
      (!aeronaveModelo || p.aeronaves_modelos.includes(aeronaveModelo)) &&
      (!q || normalizeSearchText(p.nome).includes(q)),
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

  // "Sem qualquer regra" e "sem regra específica" são diagnósticos diferentes.
  // Regras EMPRESA podem configurar todos os funcionários, sem cobrir um escopo
  // particular de SETOR/FUNCAO. Não presumir, porém, que regras específicas sejam
  // obrigatórias: estes números são para revisão, não prova de desconformidade.
  const funcoesComRegraEspecifica = new Map<string, boolean>();
  const setoresComRegraEspecifica = new Map<number, boolean>();
  let pessoasSemRegraEspecificaFuncao = 0;
  for (const person of people) {
    const regraFuncao = snapshot.rules.some(
      (rule) =>
        (rule.escopo === 'FUNCAO' || rule.escopo === 'SETOR_FUNCAO') &&
        ruleApplies(rule, person),
    );
    const regraSetor = snapshot.rules.some(
      (rule) =>
        (rule.escopo === 'SETOR' || rule.escopo === 'SETOR_FUNCAO') &&
        ruleApplies(rule, person),
    );
    if (person.funcao_id !== null) {
      const key = `${person.setor_id ?? 0}:${person.funcao_id}`;
      funcoesComRegraEspecifica.set(
        key,
        Boolean(funcoesComRegraEspecifica.get(key)) || regraFuncao,
      );
      if (!regraFuncao) pessoasSemRegraEspecificaFuncao += 1;
    }
    if (person.setor_id !== null) {
      setoresComRegraEspecifica.set(
        person.setor_id,
        Boolean(setoresComRegraEspecifica.get(person.setor_id)) || regraSetor,
      );
    }
  }
  const funcoesSemRegraEspecifica = [...funcoesComRegraEspecifica.values()].filter(
    (hasRule) => !hasRule,
  ).length;
  const setoresSemRegraEspecifica = [...setoresComRegraEspecifica.values()].filter(
    (hasRule) => !hasRule,
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
      funcoes_sem_regra_especifica: funcoesSemRegraEspecifica,
      setores_sem_regra_especifica: setoresSemRegraEspecifica,
      pessoas_sem_regra_especifica_funcao: pessoasSemRegraEspecificaFuncao,
      matriculas_sem_requisito: matriculasSemRequisito,
      requisitos_obrigatorios: totalObrigatorios,
      requisitos_distintos: aggregateDistinctMandatoryRequirements(people).length,
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
