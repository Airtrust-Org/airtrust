/**
 * Dashboard Service - Queries D1 para métricas operacionais
 * Sistema AirTrust - Conformidade Aeronáutica
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  DashboardMetrics,
  AlertaCritico,
  ComplianceScore,
  DemandaTreinamento,
  AtividadeRecente,
  TaxaConclusaoMensal,
  UtilizacaoSimuladores,
  SystemHealth,
} from '../../../src/react-app/types/dashboard.types';
import {
  CANCELLED_STATUS_VALUES,
  COMPLETED_STATUS_SQL,
  PLANNED_QUALIFICATION_STATUS_VALUES,
  SCHEDULED_SESSION_STATUS_SQL,
  sqlStatusEqualsAny,
} from '../lib/status/status-codes';
import {
  getTaxaConclusaoMensalMetricRows,
  getUtilizacaoSimuladoresMetricRows,
} from '../repositories/dashboardMetricsRepository';
import { buildFuncionarioScopeWhere, type EmployeeSectorAccess } from './employee-sector-access';
import {
  getQualificacoesAlertaDias,
  getTodayIsoSaoPaulo,
  getQualificacoesVencimentoExpr,
} from '../utils/qualificacoes-alerta-config';

const SIMULADORES_OPERATIONAL_TIMEZONE = 'America/Sao_Paulo';

function buildCurrentOperationalQualificationPredicate(alias = 'qh'): string {
  const statusExpr = `UPPER(COALESCE(${alias}.status, ''))`;
  const cancelled = sqlStatusEqualsAny(statusExpr, CANCELLED_STATUS_VALUES);
  const planned = sqlStatusEqualsAny(statusExpr, PLANNED_QUALIFICATION_STATUS_VALUES);
  const successorStatusExpr = "UPPER(COALESCE(qh_next.status, ''))";
  const successorCancelled = sqlStatusEqualsAny(successorStatusExpr, CANCELLED_STATUS_VALUES);
  const successorPlanned = sqlStatusEqualsAny(
    successorStatusExpr,
    PLANNED_QUALIFICATION_STATUS_VALUES,
  );

  return `(${alias}.deleted_at IS NULL
    AND NOT (${cancelled})
    AND NOT (${planned})
    AND ${alias}.data_conclusao IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM qualificacoes_historico qh_next
      WHERE qh_next.empresa_id = ${alias}.empresa_id
        AND qh_next.renovacao_de = ${alias}.id
        AND qh_next.deleted_at IS NULL
        AND qh_next.data_conclusao IS NOT NULL
        AND NOT (${successorCancelled})
        AND NOT (${successorPlanned})
    ))`;
}

function buildHistoricalOperationalQualificationPredicate(
  alias: string,
  cutoffSql: string,
): string {
  const statusExpr = `UPPER(COALESCE(${alias}.status, ''))`;
  const cancelled = sqlStatusEqualsAny(statusExpr, CANCELLED_STATUS_VALUES);
  const planned = sqlStatusEqualsAny(statusExpr, PLANNED_QUALIFICATION_STATUS_VALUES);
  const successorStatusExpr = "UPPER(COALESCE(qh_next.status, ''))";
  const successorCancelled = sqlStatusEqualsAny(successorStatusExpr, CANCELLED_STATUS_VALUES);
  const successorPlanned = sqlStatusEqualsAny(
    successorStatusExpr,
    PLANNED_QUALIFICATION_STATUS_VALUES,
  );

  return `(${alias}.deleted_at IS NULL
    AND NOT (${cancelled})
    AND NOT (${planned})
    AND ${alias}.data_conclusao IS NOT NULL
    AND date(${alias}.data_conclusao) <= date(${cutoffSql})
    AND NOT EXISTS (
      SELECT 1
      FROM qualificacoes_historico qh_next
      WHERE qh_next.empresa_id = ${alias}.empresa_id
        AND qh_next.renovacao_de = ${alias}.id
        AND qh_next.deleted_at IS NULL
        AND qh_next.data_conclusao IS NOT NULL
        AND date(qh_next.data_conclusao) <= date(${cutoffSql})
        AND NOT (${successorCancelled})
        AND NOT (${successorPlanned})
    ))`;
}

function getSaoPauloDateTimeKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SIMULADORES_OPERATIONAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name = ?
       LIMIT 1`,
    )
    .bind(tableName)
    .first<{ name?: string }>()
    .catch(() => null);

  return Boolean(row?.name);
}

export interface DashboardSimuladoresAlertasResumo {
  fichas_pendentes_avaliacao: number;
  fichas_aguardando_assinatura_aluno: number;
  fichas_aguardando_assinatura_instrutor: number;
  fichas_aguardando_assinatura: number;
  sessoes_proximas_sem_ficha_completa: number;
  edicoes_pendentes: number;
  janela_sessoes_proximas_horas: number;
}

const DASHBOARD_FICHA_STATUS_SQL = `CASE
  WHEN f.assinatura_instrutor_timestamp IS NOT NULL THEN
    CASE
      WHEN f.resultado_final = 'REPROVADO' THEN 'NAO_APROVADO'
      WHEN f.resultado_final = 'APROVADO' THEN 'APROVADO'
      WHEN f.aprovado = 0 AND f.resultado_final != 'PENDENTE' THEN 'NAO_APROVADO'
      WHEN f.aprovado = 1 THEN 'APROVADO'
      ELSE 'APROVADO'
    END
  WHEN f.assinatura_aluno_timestamp IS NOT NULL THEN 'AGUARDANDO_ASSINATURA_INSTRUTOR'
  WHEN f.status IN ('AGUARDANDO_ASSINATURA_ALUNO', 'AGUARDANDO_ASSINATURA_INSTRUTOR', 'AVALIACAO_PENDENTE', 'APROVADO', 'NAO_APROVADO') THEN f.status
  WHEN f.status IN ('AGUARDANDO_ASSINATURAS', 'AVALIADA') THEN 'AGUARDANDO_ASSINATURA_ALUNO'
  WHEN f.status IN ('ASSINADA_ALUNO') THEN 'AGUARDANDO_ASSINATURA_INSTRUTOR'
  WHEN f.status IN ('ASSINADA_TOTAL', 'APROVADA', 'CONCLUIDA') THEN
    CASE
      WHEN f.resultado_final = 'REPROVADO' THEN 'NAO_APROVADO'
      WHEN f.resultado_final = 'APROVADO' THEN 'APROVADO'
      WHEN f.aprovado = 0 AND f.resultado_final != 'PENDENTE' THEN 'NAO_APROVADO'
      WHEN f.aprovado = 1 THEN 'APROVADO'
      ELSE 'APROVADO'
    END
  ELSE 'AVALIACAO_PENDENTE'
END`;

const DASHBOARD_UPCOMING_SESSION_STATUSES_SQL =
  "('AGENDADO', 'AGENDADA', 'PENDENTE', 'PENDING', 'CONFIRMADO', 'CONFIRMADA')";
const DASHBOARD_FINALIZED_FICHA_STATUSES_SQL = "('APROVADO', 'NAO_APROVADO')";
const DASHBOARD_SIMULADORES_ALERT_WINDOW_HOURS = 24;

function getFullDashboardAccess(): EmployeeSectorAccess {
  return { mode: 'all', setorIds: [], funcionarioId: null };
}

function resolveDashboardAccess(access?: EmployeeSectorAccess): EmployeeSectorAccess {
  return access ?? getFullDashboardAccess();
}

function buildEmployeeScopeSql(
  access: EmployeeSectorAccess | undefined,
  funcionarioAlias = 'f',
): { clause: string; bindings: number[] } {
  return buildFuncionarioScopeWhere(resolveDashboardAccess(access), funcionarioAlias);
}

function buildSessionScopeSql(
  access: EmployeeSectorAccess | undefined,
  sessionAlias = 'sa',
): { clause: string; bindings: number[] } {
  const normalizedAccess = resolveDashboardAccess(access);
  if (normalizedAccess.mode === 'all') {
    return { clause: '1 = 1', bindings: [] };
  }

  const scope = buildFuncionarioScopeWhere(normalizedAccess, 'f_scope');
  return {
    clause: `EXISTS (
      SELECT 1
      FROM sessoes_participantes sp_scope
      JOIN funcionarios f_scope
        ON f_scope.id = sp_scope.funcionario_id
       AND f_scope.deleted_at IS NULL
      WHERE sp_scope.sessao_id = ${sessionAlias}.id
        AND sp_scope.deleted_at IS NULL
        AND ${scope.clause}
    )`,
    bindings: scope.bindings,
  };
}

function buildFichaScopeSql(
  access: EmployeeSectorAccess | undefined,
  fichaAlias = 'f',
): { clause: string; bindings: number[] } {
  const normalizedAccess = resolveDashboardAccess(access);
  if (normalizedAccess.mode === 'all') {
    return { clause: '1 = 1', bindings: [] };
  }

  const scope = buildFuncionarioScopeWhere(normalizedAccess, 'f_alert_scope');
  return {
    clause: `EXISTS (
      SELECT 1
      FROM funcionarios f_alert_scope
      WHERE f_alert_scope.id = ${fichaAlias}.colaborador_id_aluno
        AND f_alert_scope.deleted_at IS NULL
        AND ${scope.clause}
    )`,
    bindings: scope.bindings,
  };
}

function buildEscalaScopeSql(
  access: EmployeeSectorAccess | undefined,
  escalaAlias = 'em',
): { clause: string; bindings: number[] } {
  const normalizedAccess = resolveDashboardAccess(access);
  if (normalizedAccess.mode === 'all') {
    return { clause: '1 = 1', bindings: [] };
  }

  const scope = buildFuncionarioScopeWhere(normalizedAccess, 'f_scope');
  return {
    clause: `(
      EXISTS (
        SELECT 1
        FROM escala_alocacoes ea
        JOIN funcionarios f_scope
          ON f_scope.id = ea.funcionario_id
         AND f_scope.deleted_at IS NULL
        WHERE ea.escala_id = ${escalaAlias}.id
          AND ea.deleted_at IS NULL
          AND ea.status != 'cancelado'
          AND ${scope.clause}
      )
      OR EXISTS (
        SELECT 1
        FROM escala_tripulacoes et
        JOIN funcionarios f_scope
          ON (f_scope.id = et.pic_id OR f_scope.id = et.sic_id)
         AND f_scope.deleted_at IS NULL
        WHERE et.escala_id = ${escalaAlias}.id
          AND et.deleted_at IS NULL
          AND ${scope.clause}
      )
    )`,
    bindings: [...scope.bindings, ...scope.bindings],
  };
}

/**
 * Busca métricas principais do dashboard
 * NOTA: Usa cálculo DINÂMICO de data_vencimento via data_conclusao + validade
 * para manter consistência com o endpoint /qualificacoes/historico
 */
export async function getDashboardMetrics(
  db: D1Database,
  empresaId: number,
  access?: EmployeeSectorAccess,
): Promise<DashboardMetrics> {
  try {
    const thresholdDias = await getQualificacoesAlertaDias(db, empresaId);
    const hojeSp = getTodayIsoSaoPaulo();
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');
    const currentQualificationPredicate = buildCurrentOperationalQualificationPredicate('qh');
    const employeeScope = buildEmployeeScopeSql(access, 'f');
    const sessionScope = buildSessionScopeSql(access, 'simulador_agendamentos');

    // Query otimizada: busca todas as métricas em uma única execução paralela
    const [tripulantes, qualificacoes, taxaConclusao, demanda, lmsStats] = await Promise.all([
      // Tripulantes Ativos
      db
        .prepare(
          `SELECT COUNT(*) as total
           FROM funcionarios
           WHERE deleted_at IS NULL
           AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
           AND empresa_id = ?
           AND ${employeeScope.clause}`,
        )
        .bind(empresaId, ...employeeScope.bindings)
        .first<{ total: number }>(),

      // Qualificações: contagem por status usando cálculo DINÂMICO de vencimento
      // Usa data_conclusao + qt.validade (meses) para calcular data de vencimento real
      db
        .prepare(
          `SELECT
             COUNT(*) as total_qualificacoes,
             SUM(CASE
               WHEN ${vencimentoExpr} IS NULL THEN 1
               WHEN date(${vencimentoExpr}) > date(?, '+' || ? || ' days') THEN 1
               ELSE 0
             END) as validas,
             SUM(CASE
               WHEN ${vencimentoExpr} IS NULL THEN 0
               WHEN date(${vencimentoExpr}) >= date(?)
                AND date(${vencimentoExpr}) <= date(?, '+' || ? || ' days') THEN 1
               ELSE 0
             END) as vencendo_30,
             SUM(CASE
               WHEN ${vencimentoExpr} IS NULL THEN 0
               WHEN date(${vencimentoExpr}) < date(?) THEN 1
               ELSE 0
             END) as vencidas,
             COUNT(DISTINCT CASE
               WHEN ${vencimentoExpr} IS NOT NULL
               AND date(${vencimentoExpr}) BETWEEN date(?) AND date(?, '+' || ? || ' days')
               THEN qh.funcionario_id
             END) as tripulantes_vencendo,
             COUNT(DISTINCT CASE
               WHEN ${vencimentoExpr} IS NOT NULL
               AND date(${vencimentoExpr}) < date(?)
               THEN qh.funcionario_id
             END) as tripulantes_vencidos
           FROM qualificacoes_historico qh
           JOIN funcionarios f ON f.id = qh.funcionario_id
           JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
           WHERE qh.deleted_at IS NULL
           AND ${currentQualificationPredicate}
           AND f.deleted_at IS NULL
           AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           AND f.empresa_id = ?
           AND qh.empresa_id = f.empresa_id
           AND ${employeeScope.clause}`,
        )
        .bind(
          hojeSp,
          thresholdDias,
          hojeSp,
          hojeSp,
          thresholdDias,
          hojeSp,
          hojeSp,
          hojeSp,
          thresholdDias,
          hojeSp,
          empresaId,
          ...employeeScope.bindings,
        )
        .first<{
          total_qualificacoes: number;
          validas: number;
          vencendo_30: number;
          vencidas: number;
          tripulantes_vencendo: number;
          tripulantes_vencidos: number;
        }>(),

      // Taxa de Conclusão (último mês completo)
      db
        .prepare(
          `SELECT
             COALESCE(
               COUNT(CASE WHEN status IN ${COMPLETED_STATUS_SQL} THEN 1 END) * 100.0 /
               NULLIF(COUNT(*), 0),
               0
             ) as taxa_conclusao
           FROM simulador_agendamentos
           WHERE deleted_at IS NULL
           AND empresa_id = ?
           AND ${sessionScope.clause}
           AND strftime('%Y-%m', data) = strftime('%Y-%m', date('now', '-1 month'))`,
        )
        .bind(empresaId, ...sessionScope.bindings)
        .first<{ taxa_conclusao: number }>(),

      // Demanda Futura
      db
        .prepare(
          `SELECT
             COUNT(CASE WHEN data BETWEEN date('now') AND date('now', '+30 days') THEN 1 END) as proximos_30,
             COUNT(CASE WHEN data BETWEEN date('now', '+31 days') AND date('now', '+60 days') THEN 1 END) as dias_31_60,
             COUNT(CASE WHEN data BETWEEN date('now', '+61 days') AND date('now', '+90 days') THEN 1 END) as dias_61_90
           FROM simulador_agendamentos
           WHERE deleted_at IS NULL
           AND empresa_id = ?
           AND ${sessionScope.clause}
           AND status IN ${SCHEDULED_SESSION_STATUS_SQL}
           AND data >= date('now')`,
        )
        .bind(empresaId, ...sessionScope.bindings)
        .first<{ proximos_30: number; dias_31_60: number; dias_61_90: number }>(),

      db
        .prepare(
          `SELECT
             COUNT(DISTINCT c.id) AS total_cursos,
             COUNT(m.id) AS total_matriculas,
             SUM(CASE WHEN m.status = 'CONCLUIDO' THEN 1 ELSE 0 END) AS concluidos,
             SUM(CASE WHEN m.status = 'EM_ANDAMENTO' THEN 1 ELSE 0 END) AS em_andamento,
             ROUND(
               100.0 * SUM(CASE WHEN m.status = 'CONCLUIDO' THEN 1 ELSE 0 END)
               / NULLIF(COUNT(m.id), 0),
               1
             ) AS taxa_conclusao_pct
           FROM lms_cursos c
           LEFT JOIN lms_matriculas m ON m.curso_id = c.id AND m.deleted_at IS NULL
           LEFT JOIN funcionarios f ON f.id = m.funcionario_id
             AND f.deleted_at IS NULL
             AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           WHERE c.empresa_id = ? AND c.deleted_at IS NULL`,
        )
        .bind(empresaId)
        .first<{
          total_cursos: number;
          total_matriculas: number;
          concluidos: number;
          em_andamento: number;
          taxa_conclusao_pct: number | null;
        }>(),
    ]);

    // Calcular tendência comparando com mês anterior
    let tendencia: 'subindo' | 'descendo' | 'estavel' = 'estavel';
    try {
      const taxaAnterior = await db
        .prepare(
          `SELECT
             COALESCE(
               COUNT(CASE WHEN status IN ${COMPLETED_STATUS_SQL} THEN 1 END) * 100.0 /
               NULLIF(COUNT(*), 0), 0
             ) as taxa
           FROM simulador_agendamentos
           WHERE deleted_at IS NULL
           AND empresa_id = ?
           AND ${sessionScope.clause}
           AND strftime('%Y-%m', data) = strftime('%Y-%m', date('now', '-2 months'))`,
        )
        .bind(empresaId, ...sessionScope.bindings)
        .first<{ taxa: number }>();
      const taxaAtual = taxaConclusao?.taxa_conclusao || 0;
      const taxaPrev = taxaAnterior?.taxa || 0;
      if (taxaAtual > taxaPrev + 5) tendencia = 'subindo';
      else if (taxaAtual < taxaPrev - 5) tendencia = 'descendo';
    } catch {
      /* ignore */
    }

    return {
      tripulantesAtivos: tripulantes?.total || 0,
      tripulantesComQualificacoesVencendo: qualificacoes?.tripulantes_vencendo || 0,
      tripulantesComQualificacoesVencidas: qualificacoes?.tripulantes_vencidos || 0,
      qualificacoesAVencer: qualificacoes?.vencendo_30 || 0,
      qualificacoesVencidas: qualificacoes?.vencidas || 0,
      // NOVO: campos adicionais para exibição correta no dashboard
      qualificacoesValidas: qualificacoes?.validas || 0,
      totalQualificacoes: qualificacoes?.total_qualificacoes || 0,
      taxaConclusaoTreinamento: Math.round(taxaConclusao?.taxa_conclusao || 0),
      demandaFutura30Dias: demanda?.proximos_30 || 0,
      demandaFutura60Dias: demanda?.dias_31_60 || 0,
      demandaFutura90Dias: demanda?.dias_61_90 || 0,
      tendenciaConclusao: tendencia,
      lms: {
        totalCursos: Number(lmsStats?.total_cursos || 0),
        totalMatriculas: Number(lmsStats?.total_matriculas || 0),
        concluidos: Number(lmsStats?.concluidos || 0),
        emAndamento: Number(lmsStats?.em_andamento || 0),
        taxaConclusaoPct: Number(lmsStats?.taxa_conclusao_pct || 0),
      },
    };
  } catch (error) {
    console.error('[DASHBOARD] Erro ao buscar métricas:', error);
    throw error;
  }
}

/**
 * Busca alertas críticos ordenados por criticidade
 * Usa cálculo DINÂMICO de vencimento
 */
export async function getDashboardAlerts(
  db: D1Database,
  empresaId: number,
  access?: EmployeeSectorAccess,
): Promise<AlertaCritico[]> {
  try {
    const thresholdDias = await getQualificacoesAlertaDias(db, empresaId);
    const hojeSp = getTodayIsoSaoPaulo();
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');
    const currentQualificationPredicate = buildCurrentOperationalQualificationPredicate('qh');
    const employeeScope = buildEmployeeScopeSql(access, 'f');

    const results = await db
      .prepare(
        `SELECT
           qh.id,
           'qualificacao_vencendo' as tipo,
           ${vencimentoExpr} as data_vencimento_calc,
           CASE
             WHEN CAST(julianday(date(${vencimentoExpr})) - julianday(date(?)) AS INTEGER) <= 0 THEN 'CRITICA'
             WHEN CAST(julianday(date(${vencimentoExpr})) - julianday(date(?)) AS INTEGER) <= 7 THEN 'ALTA'
             WHEN CAST(julianday(date(${vencimentoExpr})) - julianday(date(?)) AS INTEGER) <= 15 THEN 'MEDIA'
             ELSE 'BAIXA'
           END as criticidade,
           f.nome as tripulante_nome,
           f.matricula as tripulante_matricula,
           f.id as tripulante_id,
           qt.nome as qualificacao_nome,
           qt.codigo as qualificacao_codigo,
           CAST(julianday(date(${vencimentoExpr})) - julianday(date(?)) as INTEGER) as dias_restantes,
           datetime('now') as created_at
         FROM qualificacoes_historico qh
         JOIN funcionarios f ON f.id = qh.funcionario_id
         JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
         WHERE qh.deleted_at IS NULL
         AND f.deleted_at IS NULL
         AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
         AND f.empresa_id = ?
         AND qh.empresa_id = f.empresa_id
         AND ${employeeScope.clause}
         AND ${currentQualificationPredicate}
         AND ${vencimentoExpr} IS NOT NULL
         AND date(${vencimentoExpr}) <= date(?, '+' || ? || ' days')
         ORDER BY
           CASE
             WHEN CAST(julianday(date(${vencimentoExpr})) - julianday(date(?)) AS INTEGER) <= 0 THEN 0
             WHEN CAST(julianday(date(${vencimentoExpr})) - julianday(date(?)) AS INTEGER) <= 7 THEN 1
             ELSE 2
           END,
           date(${vencimentoExpr}) ASC
         LIMIT 50`,
      )
      .bind(
        hojeSp,
        hojeSp,
        hojeSp,
        hojeSp,
        empresaId,
        ...employeeScope.bindings,
        hojeSp,
        thresholdDias,
        hojeSp,
        hojeSp,
      )
      .all();

    const alertasQual: AlertaCritico[] = (results.results || []).map(
      (row: Record<string, unknown>) => ({
        id: Number(row.id || 0),
        tipo: row.tipo as AlertaCritico['tipo'],
        criticidade: row.criticidade as AlertaCritico['criticidade'],
        mensagem:
          Number(row.dias_restantes || 0) < 0
            ? `${row.qualificacao_nome} vencida ha ${Math.abs(Number(row.dias_restantes || 0))} dias`
            : `${row.qualificacao_nome} vence em ${Number(row.dias_restantes || 0)} dias`,
        tripulanteId: row.tripulante_id ? Number(row.tripulante_id) : undefined,
        tripulanteNome: row.tripulante_nome ? String(row.tripulante_nome) : undefined,
        tripulanteMatricula: row.tripulante_matricula
          ? String(row.tripulante_matricula)
          : undefined,
        qualificacaoId: row.id ? Number(row.id) : undefined,
        qualificacaoNome: row.qualificacao_nome ? String(row.qualificacao_nome) : undefined,
        dataVencimento: row.data_vencimento_calc ? String(row.data_vencimento_calc) : undefined,
        diasRestantes: Number(row.dias_restantes ?? 0),
        acaoRecomendada: 'Renovar qualificação',
        urlAcao: `/qualificacoes?funcionario_id=${row.tripulante_id}`,
        createdAt: String(row.created_at || new Date().toISOString()),
      }),
    );

    // Alertas de cursos LMS obrigatórios não concluídos
    let alertasLms: AlertaCritico[] = [];
    try {
      const lmsResults = await db
        .prepare(
          `SELECT
             rc.id,
             f.id as tripulante_id,
             f.nome as tripulante_nome,
             f.matricula as tripulante_matricula,
             c.id as curso_id,
             c.titulo as curso_titulo,
             COALESCE(m.status, 'NAO_MATRICULADO') as status_matricula,
             m.data_expiracao as prazo_conclusao
           FROM requisitos_compliance rc
           JOIN lms_cursos c ON CAST(c.id AS TEXT) = rc.referencia AND c.deleted_at IS NULL
           JOIN funcionarios f ON f.empresa_id = rc.empresa_id
             AND f.funcao = rc.funcao
             AND f.deleted_at IS NULL
             AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           LEFT JOIN lms_matriculas m ON m.curso_id = c.id
             AND m.funcionario_id = f.id
             AND m.deleted_at IS NULL
             AND m.status NOT IN ('CANCELADO', 'REPROVADO')
           WHERE rc.empresa_id = ?
             AND ${employeeScope.clause}
             AND rc.deleted_at IS NULL
             AND rc.tipo_recurso = 'curso_lms'
             AND rc.obrigatorio = 1
             AND COALESCE(m.status, 'NAO_MATRICULADO') != 'CONCLUIDO'
           ORDER BY f.nome, c.titulo
           LIMIT 30`,
        )
        .bind(empresaId, ...employeeScope.bindings)
        .all();

      alertasLms = (lmsResults.results || []).map((row: Record<string, unknown>, idx: number) => {
        const status = String(row.status_matricula || 'NAO_MATRICULADO');
        const venceu =
          row.prazo_conclusao &&
          String(row.prazo_conclusao) < new Date().toISOString().slice(0, 10);
        const criticidade: AlertaCritico['criticidade'] = venceu
          ? 'ALTA'
          : status === 'NAO_MATRICULADO'
            ? 'MEDIA'
            : 'BAIXA';
        const statusLabel =
          status === 'NAO_MATRICULADO'
            ? 'não matriculado'
            : status === 'EM_ANDAMENTO'
              ? 'em andamento'
              : status;
        return {
          id: 100000 + idx,
          tipo: 'lms_curso_pendente' as AlertaCritico['tipo'],
          criticidade,
          mensagem: `Curso obrigatório "${row.curso_titulo}" — ${statusLabel}`,
          tripulanteId: row.tripulante_id ? Number(row.tripulante_id) : undefined,
          tripulanteNome: row.tripulante_nome ? String(row.tripulante_nome) : undefined,
          tripulanteMatricula: row.tripulante_matricula
            ? String(row.tripulante_matricula)
            : undefined,
          acaoRecomendada: status === 'NAO_MATRICULADO' ? 'Matricular no curso' : 'Concluir curso',
          urlAcao: `/lms/cursos/${row.curso_id}`,
          createdAt: new Date().toISOString(),
        };
      });
    } catch {
      // tabela requisitos_compliance pode não existir em ambientes antigos
    }

    const alertas = [...alertasQual, ...alertasLms];
    return alertas;
  } catch (error) {
    console.error('[DASHBOARD] Erro ao buscar alertas:', error);
    return [];
  }
}

/**
 * Calcula score de compliance geral
 * Usa cálculo DINÂMICO de vencimento (data_conclusao + validade meses)
 */
export async function getComplianceScore(
  db: D1Database,
  empresaId: number,
  access?: EmployeeSectorAccess,
): Promise<ComplianceScore> {
  try {
    const employeeScope = buildEmployeeScopeSql(access, 'f');
    const sessionScope = buildSessionScopeSql(access, 'simulador_agendamentos');
    const vencimentoExpr = getQualificacoesVencimentoExpr();
    const currentQualificationPredicate = buildCurrentOperationalQualificationPredicate('qh');
    const previousMonthQualificationPredicate = buildHistoricalOperationalQualificationPredicate(
      'qh',
      "date('now', '-1 month')",
    );
    const [qualificacoes, simuladores, qualificacoesAnterior, lmsCompliance] = await Promise.all([
      // % de qualificações válidas (cálculo dinâmico de vencimento)
      db
        .prepare(
          `SELECT
             COALESCE(
               SUM(CASE
                 WHEN ${vencimentoExpr} IS NULL THEN 1
                 WHEN ${vencimentoExpr} >= date('now') THEN 1
                 ELSE 0
               END) * 100.0 /
               NULLIF(COUNT(*), 0),
               100
             ) as percentual_qualificacoes_validas,
             COUNT(*) as total_qualificacoes,
             SUM(CASE
               WHEN ${vencimentoExpr} IS NULL THEN 1
               WHEN ${vencimentoExpr} >= date('now') THEN 1
               ELSE 0
             END) as qualificacoes_validas
           FROM qualificacoes_historico qh
           JOIN funcionarios f ON f.id = qh.funcionario_id
           JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
           WHERE qh.deleted_at IS NULL
           AND ${currentQualificationPredicate}
           AND f.deleted_at IS NULL
           AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           AND f.empresa_id = ?
           AND qh.empresa_id = f.empresa_id
           AND ${employeeScope.clause}`,
        )
        .bind(empresaId, ...employeeScope.bindings)
        .first<{
          percentual_qualificacoes_validas: number;
          total_qualificacoes: number;
          qualificacoes_validas: number;
        }>(),

      // % de sessões concluídas (últimos 3 meses)
      db
        .prepare(
          `SELECT
             COALESCE(
               (SELECT COUNT(*) FROM simulador_agendamentos
               WHERE deleted_at IS NULL
               AND empresa_id = ?
               AND ${sessionScope.clause}
               AND status IN ${COMPLETED_STATUS_SQL}
               AND data >= date('now', '-3 months')) * 100.0 /
               NULLIF((SELECT COUNT(*) FROM simulador_agendamentos
                       WHERE deleted_at IS NULL
                       AND empresa_id = ?
                       AND ${sessionScope.clause}
                       AND data >= date('now', '-3 months')), 0),
               100
             ) as percentual_sessoes_concluidas`,
        )
        .bind(empresaId, ...sessionScope.bindings, empresaId, ...sessionScope.bindings)
        .first<{ percentual_sessoes_concluidas: number }>(),

      // % de qualificações válidas do mês anterior (para calcular tendência)
      db
        .prepare(
          `SELECT
             COALESCE(
               SUM(CASE
                 WHEN ${vencimentoExpr} IS NULL THEN 1
                 WHEN ${vencimentoExpr} >= date('now', '-1 month') THEN 1
                 ELSE 0
               END) * 100.0 /
               NULLIF(COUNT(*), 0),
               100
             ) as percentual_qualificacoes_validas_anterior
           FROM qualificacoes_historico qh
           JOIN funcionarios f ON f.id = qh.funcionario_id
           JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
           WHERE qh.deleted_at IS NULL
           AND ${previousMonthQualificationPredicate}
           AND f.deleted_at IS NULL
           AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           AND f.empresa_id = ?
           AND qh.empresa_id = f.empresa_id
           AND ${employeeScope.clause}`,
        )
        .bind(empresaId, ...employeeScope.bindings)
        .first<{ percentual_qualificacoes_validas_anterior: number }>(),

      // % de cursos LMS obrigatórios concluídos por funcionário ativo
      db
        .prepare(
          `SELECT
             COALESCE(
               CAST(SUM(CASE WHEN m.status = 'CONCLUIDO' THEN 1 ELSE 0 END) AS REAL) * 100.0 /
               NULLIF(COUNT(*), 0),
               100
             ) as percentual_lms_concluido
           FROM requisitos_compliance rc
           JOIN lms_cursos c ON CAST(c.id AS TEXT) = rc.referencia AND c.deleted_at IS NULL
           JOIN funcionarios f ON f.empresa_id = rc.empresa_id
             AND f.funcao = rc.funcao
             AND f.deleted_at IS NULL
             AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           LEFT JOIN lms_matriculas m ON m.curso_id = c.id
             AND m.funcionario_id = f.id
             AND m.deleted_at IS NULL
             AND m.status NOT IN ('CANCELADO', 'REPROVADO')
           WHERE rc.empresa_id = ?
             AND ${employeeScope.clause}
             AND rc.deleted_at IS NULL
             AND rc.tipo_recurso = 'curso_lms'
             AND rc.obrigatorio = 1`,
        )
        .bind(empresaId, ...employeeScope.bindings)
        .first<{ percentual_lms_concluido: number }>(),
    ]);

    const scoreQual = Math.round(qualificacoes?.percentual_qualificacoes_validas || 100);
    const scoreSim = Math.round(simuladores?.percentual_sessoes_concluidas || 100);
    const scoreLms = Math.round(lmsCompliance?.percentual_lms_concluido ?? 100);
    const scoreQualAnterior = Math.round(
      qualificacoesAnterior?.percentual_qualificacoes_validas_anterior || 100,
    );

    // Score geral = média ponderada (qualificações 50%, simuladores 30%, LMS 20%)
    const scoreGeral = Math.round(scoreQual * 0.5 + scoreSim * 0.3 + scoreLms * 0.2);

    // Calcular tendência comparando score atual com score do mês anterior (±5% threshold)
    const diff = scoreQual - scoreQualAnterior;
    const tendencia: 'subindo' | 'estavel' | 'descendo' =
      diff >= 5 ? 'subindo' : diff <= -5 ? 'descendo' : 'estavel';

    return {
      scoreGeral,
      breakdown: {
        qualificacoes: scoreQual,
        treinamentos: scoreLms,
        documentacao: 100, // Módulo de documentação não implementado
        simuladores: scoreSim,
        examesMedicos: 100, // Módulo de exames médicos não implementado
      },
      // Campos extras para o dashboard
      qualificacoesValidas: qualificacoes?.qualificacoes_validas || 0,
      totalQualificacoes: qualificacoes?.total_qualificacoes || 0,
      tendencia,
      metaOrganizacional: 90,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Busca demanda de treinamento estratificada
 */
export async function getDemandaTreinamento(
  db: D1Database,
  empresaId: number,
  access?: EmployeeSectorAccess,
): Promise<DemandaTreinamento> {
  try {
    const sessionScope = buildSessionScopeSql(access, 'simulador_agendamentos');
    const aliasedSessionScope = buildSessionScopeSql(access, 'sa');
    const [periodos, porTipo, porSimulador, instrutores] = await Promise.all([
      // Por período
      db
        .prepare(
          `SELECT
             COUNT(CASE WHEN data BETWEEN date('now') AND date('now', '+30 days') THEN 1 END) as proximos_30,
             COUNT(CASE WHEN data BETWEEN date('now', '+31 days') AND date('now', '+60 days') THEN 1 END) as dias_31_60,
             COUNT(CASE WHEN data BETWEEN date('now', '+61 days') AND date('now', '+90 days') THEN 1 END) as dias_61_90,
             COUNT(*) as total
           FROM simulador_agendamentos
           WHERE deleted_at IS NULL
           AND status IN ${SCHEDULED_SESSION_STATUS_SQL}
           AND empresa_id = ?
           AND ${sessionScope.clause}
           AND data BETWEEN date('now') AND date('now', '+90 days')`,
        )
        .bind(empresaId, ...sessionScope.bindings)
        .first<{ proximos_30: number; dias_31_60: number; dias_61_90: number; total: number }>(),

      // Por tipo de sessão
      db
        .prepare(
          `SELECT
             tipo_sessao,
             COUNT(*) as quantidade
           FROM simulador_agendamentos
           WHERE deleted_at IS NULL
           AND status IN ${SCHEDULED_SESSION_STATUS_SQL}
           AND empresa_id = ?
           AND ${sessionScope.clause}
           AND data BETWEEN date('now') AND date('now', '+90 days')
           GROUP BY tipo_sessao`,
        )
        .bind(empresaId, ...sessionScope.bindings)
        .all(),

      // Por simulador
      db
        .prepare(
          `SELECT
             s.nome as simulador_nome,
             COUNT(sa.id) as quantidade,
             SUM(sa.duracao_minutos) / 60.0 as horas_estimadas
           FROM simulador_agendamentos sa
           JOIN simuladores s ON s.id = sa.simulador_id
           WHERE sa.deleted_at IS NULL
           AND sa.status IN ${SCHEDULED_SESSION_STATUS_SQL}
           AND sa.empresa_id = ?
           AND ${aliasedSessionScope.clause}
           AND sa.data BETWEEN date('now') AND date('now', '+90 days')
           GROUP BY s.id, s.nome
           ORDER BY quantidade DESC`,
        )
        .bind(empresaId, ...aliasedSessionScope.bindings)
        .all(),

      // Por instrutor (agendamentos futuros por instrutor responsável)
      db
        .prepare(
          `SELECT
             COALESCE(f.nome, 'Instrutor Desconhecido') as instrutorNome,
             COUNT(sa.id) as sessoesProgramadas,
             ROUND(SUM(sa.duracao_minutos) / 60.0, 1) as horasCompromissadas
           FROM simulador_agendamentos sa
           LEFT JOIN funcionarios f ON f.id = sa.instrutor_id AND f.deleted_at IS NULL
           WHERE sa.deleted_at IS NULL
           AND sa.status IN ${SCHEDULED_SESSION_STATUS_SQL}
           AND sa.empresa_id = ?
           AND ${aliasedSessionScope.clause}
           AND sa.data BETWEEN date('now') AND date('now', '+90 days')
           AND sa.instrutor_id IS NOT NULL
           GROUP BY sa.instrutor_id, f.nome
           ORDER BY sessoesProgramadas DESC
           LIMIT 20`,
        )
        .bind(empresaId, ...aliasedSessionScope.bindings)
        .all(),
    ]);

    const tipoMap: DemandaTreinamento['porTipo'] = {
      inicial: 0,
      recorrente: 0,
      transicao: 0,
      upgrade: 0,
    };

    (porTipo.results || []).forEach((row: Record<string, unknown>) => {
      const tipo = String(row.tipo_sessao || '').toLowerCase();
      const quantidade = Number(row.quantidade || 0);
      if (tipo.includes('ini')) tipoMap.inicial += quantidade;
      else if (tipo.includes('per') || tipo.includes('rec')) tipoMap.recorrente += quantidade;
      else if (tipo.includes('tra')) tipoMap.transicao += quantidade;
      else tipoMap.recorrente += quantidade; // default
    });

    return {
      total: periodos?.total || 0,
      porPeriodo: {
        proximos30Dias: periodos?.proximos_30 || 0,
        dias31a60: periodos?.dias_31_60 || 0,
        dias61a90: periodos?.dias_61_90 || 0,
      },
      porTipo: tipoMap,
      porSimulador: (porSimulador.results || []).map((row: Record<string, unknown>) => ({
        simuladorNome: String(row.simulador_nome || 'Simulador'),
        quantidade: Number(row.quantidade || 0),
        horasEstimadas: Math.round(Number(row.horas_estimadas || 0)),
      })),
      porInstrutor: (instrutores.results || []).map((row: Record<string, unknown>) => ({
        instrutorNome: String(row.instrutorNome || 'Instrutor Desconhecido'),
        sessoesProgramadas: Number(row.sessoesProgramadas || 0),
        horasCompromissadas: Number(row.horasCompromissadas || 0),
        disponibilidade: 100,
      })),
    };
  } catch (error) {
    console.error('[DASHBOARD] Erro ao buscar demanda de treinamento:', error);
    throw error;
  }
}

/**
 * Busca atividades recentes do sistema
 */
export async function getAtividadesRecentes(
  db: D1Database,
  empresaId: number,
  access?: EmployeeSectorAccess,
): Promise<AtividadeRecente[]> {
  try {
    const sessionScope = buildSessionScopeSql(access, 'sa');
    const employeeScope = buildEmployeeScopeSql(access, 'f');
    // Buscar últimas sessões concluídas e qualificações emitidas
    const [sessoes, qualificacoes] = await Promise.all([
      db
        .prepare(
          `SELECT
             sa.id,
             'sessao_concluida' as tipo,
             f.nome as tripulante_nome,
             f.matricula as tripulante_matricula,
             sa.updated_at as timestamp,
             sa.tipo_sessao,
             s.nome as simulador_nome
           FROM simulador_agendamentos sa
           JOIN funcionarios f ON f.id = sa.instrutor_id
           LEFT JOIN simuladores s ON s.id = sa.simulador_id
           WHERE sa.deleted_at IS NULL
           AND sa.status IN ${COMPLETED_STATUS_SQL}
           AND f.empresa_id = ?
           AND ${sessionScope.clause}
           ORDER BY sa.updated_at DESC
           LIMIT 10`,
        )
        .bind(empresaId, ...sessionScope.bindings)
        .all(),

      db
        .prepare(
          `SELECT
             qh.id,
             'qualificacao_emitida' as tipo,
             f.nome as tripulante_nome,
             f.matricula as tripulante_matricula,
             qh.created_at as timestamp,
             qt.nome as qualificacao_nome
           FROM qualificacoes_historico qh
           JOIN funcionarios f
             ON f.id = qh.funcionario_id
            AND f.empresa_id = qh.empresa_id
           JOIN qualificacoes_tipos qt
             ON qt.id = qh.qualificacao_id
            AND qt.empresa_id = qh.empresa_id
            AND qt.deleted_at IS NULL
           WHERE ${buildCurrentOperationalQualificationPredicate('qh')}
           AND f.deleted_at IS NULL
           AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           AND f.empresa_id = ?
           AND ${employeeScope.clause}
           ORDER BY qh.created_at DESC
           LIMIT 10`,
        )
        .bind(empresaId, ...employeeScope.bindings)
        .all(),
    ]);

    const atividades: AtividadeRecente[] = [];

    (sessoes.results || []).forEach((row: Record<string, unknown>) => {
      atividades.push({
        id: Number(row.id || 0),
        tipo: 'sessao_concluida',
        descricao: `Sessão ${row.tipo_sessao} concluída - ${row.simulador_nome || 'Simulador'}`,
        tripulanteNome: row.tripulante_nome ? String(row.tripulante_nome) : undefined,
        tripulanteMatricula: row.tripulante_matricula
          ? String(row.tripulante_matricula)
          : undefined,
        timestamp: String(row.timestamp || new Date().toISOString()),
        icone: 'CheckCircle',
        cor: 'green',
      });
    });

    (qualificacoes.results || []).forEach((row: Record<string, unknown>) => {
      atividades.push({
        id: Number(row.id || 0),
        tipo: 'qualificacao_emitida',
        descricao: `Qualificação emitida: ${row.qualificacao_nome}`,
        tripulanteNome: row.tripulante_nome ? String(row.tripulante_nome) : undefined,
        tripulanteMatricula: row.tripulante_matricula
          ? String(row.tripulante_matricula)
          : undefined,
        timestamp: String(row.timestamp || new Date().toISOString()),
        icone: 'Award',
        cor: 'blue',
      });
    });

    // Ordenar por timestamp mais recente
    atividades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return atividades.slice(0, 20);
  } catch (error) {
    console.error('[DASHBOARD] Erro ao buscar atividades recentes:', error);
    throw error;
  }
}

/**
 * Busca taxa de conclusão mensal (últimos 6 meses)
 */
export async function getTaxaConclusaoMensal(
  db: D1Database,
  empresaId: number,
  access?: EmployeeSectorAccess,
): Promise<TaxaConclusaoMensal> {
  try {
    const meses: string[] = [];
    const taxas: number[] = [];
    const rows = await getTaxaConclusaoMensalMetricRows(db, empresaId, access);

    rows.forEach((row) => {
      // Converter YYYY-MM para nome do mês
      const mesRaw = String(row.mes || '');
      const [, mes] = mesRaw.split('-');
      const mesesNomes = [
        'Jan',
        'Fev',
        'Mar',
        'Abr',
        'Mai',
        'Jun',
        'Jul',
        'Ago',
        'Set',
        'Out',
        'Nov',
        'Dez',
      ];
      meses.push(mesesNomes[parseInt(mes) - 1]);
      taxas.push(Math.round(Number(row.taxa || 0)));
    });

    return {
      meses,
      taxas,
      meta: 90,
    };
  } catch (error) {
    console.error('[DASHBOARD] Erro ao buscar taxa de conclusão mensal:', error);
    return {
      meses: [],
      taxas: [],
      meta: 90,
    };
  }
}

/**
 * Busca utilização de simuladores
 */
export async function getUtilizacaoSimuladores(
  db: D1Database,
  empresaId: number,
  access?: EmployeeSectorAccess,
): Promise<UtilizacaoSimuladores> {
  try {
    const rows = await getUtilizacaoSimuladoresMetricRows(db, empresaId, access);

    const simuladores = rows.map((row) => ({
      id: Number(row.id || 0),
      nome: String(row.nome || ''),
      fabricante: String(row.fabricante || ''),
      modelo: String(row.modelo || ''),
      horasProgramadas: Math.round(Number(row.horas_programadas || 0)),
      horasDisponiveis: Number(row.horas_disponiveis || 0),
      taxaUtilizacao: Math.round(Number(row.taxa_utilizacao || 0)),
      status: (row.status ||
        'operacional') as UtilizacaoSimuladores['simuladores'][number]['status'],
    }));

    return { simuladores };
  } catch (error) {
    console.error('[DASHBOARD] Erro ao buscar utilização de simuladores:', error);
    return { simuladores: [] };
  }
}

export async function getDashboardSimuladoresAlertas(
  db: D1Database,
  empresaId: number,
  access?: EmployeeSectorAccess,
): Promise<DashboardSimuladoresAlertasResumo> {
  const employeeScope = buildEmployeeScopeSql(access, 'aluno');
  const sessionScope = buildSessionScopeSql(access, 'sa');
  const nowSpKey = getSaoPauloDateTimeKey();
  const endWindowKey = getSaoPauloDateTimeKey(
    new Date(Date.now() + DASHBOARD_SIMULADORES_ALERT_WINDOW_HOURS * 60 * 60 * 1000),
  );

  const [fichasResumo, sessoesSemFichaCompleta, hasEdicoesTable] = await Promise.all([
    db
      .prepare(
        `SELECT
           SUM(CASE
             WHEN ${DASHBOARD_FICHA_STATUS_SQL} = 'AVALIACAO_PENDENTE'
              AND (
                UPPER(COALESCE(sa.status, '')) IN ${COMPLETED_STATUS_SQL}
                OR (
                  COALESCE(sa.data, f.data_sessao) IS NOT NULL
                  AND datetime(COALESCE(sa.data, f.data_sessao) || ' ' || COALESCE(sa.hora_inicio, '00:00')) <= datetime(?)
                )
              )
             THEN 1 ELSE 0
           END) as fichas_pendentes_avaliacao,
           SUM(CASE WHEN ${DASHBOARD_FICHA_STATUS_SQL} = 'AGUARDANDO_ASSINATURA_ALUNO' THEN 1 ELSE 0 END) as fichas_aguardando_assinatura_aluno,
           SUM(CASE WHEN ${DASHBOARD_FICHA_STATUS_SQL} = 'AGUARDANDO_ASSINATURA_INSTRUTOR' THEN 1 ELSE 0 END) as fichas_aguardando_assinatura_instrutor
         FROM fichas_sessao f
         INNER JOIN funcionarios aluno
           ON aluno.id = f.colaborador_id_aluno
          AND aluno.deleted_at IS NULL
         LEFT JOIN simulador_agendamentos sa
           ON sa.id = f.agendamento_slot_id
          AND sa.deleted_at IS NULL
         WHERE f.deleted_at IS NULL
           AND COALESCE(f.empresa_id, aluno.empresa_id, sa.empresa_id) = ?
           AND ${employeeScope.clause}`,
      )
      .bind(nowSpKey, empresaId, ...employeeScope.bindings)
      .first<{
        fichas_pendentes_avaliacao?: number | null;
        fichas_aguardando_assinatura_aluno?: number | null;
        fichas_aguardando_assinatura_instrutor?: number | null;
      }>(),
    db
      .prepare(
        `SELECT COUNT(*) as total
         FROM simulador_agendamentos sa
         WHERE sa.deleted_at IS NULL
           AND sa.empresa_id = ?
           AND ${sessionScope.clause}
           AND UPPER(COALESCE(sa.status, '')) IN ${DASHBOARD_UPCOMING_SESSION_STATUSES_SQL}
           AND sa.data IS NOT NULL
           AND datetime(sa.data || ' ' || COALESCE(sa.hora_inicio, '00:00')) >= datetime(?)
           AND datetime(sa.data || ' ' || COALESCE(sa.hora_inicio, '00:00')) <= datetime(?)
           AND NOT EXISTS (
             SELECT 1
             FROM fichas_sessao f
             WHERE f.agendamento_slot_id = sa.id
               AND f.deleted_at IS NULL
               AND ${DASHBOARD_FICHA_STATUS_SQL} IN ${DASHBOARD_FINALIZED_FICHA_STATUSES_SQL}
           )`,
      )
      .bind(empresaId, ...sessionScope.bindings, nowSpKey, endWindowKey)
      .first<{ total?: number | null }>(),
    tableExists(db, 'fichas_sessao_edicoes'),
  ]);

  const edicoesPendentes = hasEdicoesTable
    ? await db
        .prepare(
          `SELECT COUNT(*) as total
           FROM fichas_sessao_edicoes fe
           INNER JOIN fichas_sessao f
             ON f.id = fe.ficha_id
            AND f.deleted_at IS NULL
           INNER JOIN funcionarios aluno
             ON aluno.id = f.colaborador_id_aluno
            AND aluno.deleted_at IS NULL
           WHERE fe.deleted_at IS NULL
             AND fe.status = 'PENDENTE'
             AND COALESCE(fe.empresa_id, f.empresa_id, aluno.empresa_id) = ?
             AND ${employeeScope.clause}`,
        )
        .bind(empresaId, ...employeeScope.bindings)
        .first<{ total?: number | null }>()
    : null;

  const fichasAguardandoAssinaturaAluno = Number(
    fichasResumo?.fichas_aguardando_assinatura_aluno || 0,
  );
  const fichasAguardandoAssinaturaInstrutor = Number(
    fichasResumo?.fichas_aguardando_assinatura_instrutor || 0,
  );

  return {
    fichas_pendentes_avaliacao: Number(fichasResumo?.fichas_pendentes_avaliacao || 0),
    fichas_aguardando_assinatura_aluno: fichasAguardandoAssinaturaAluno,
    fichas_aguardando_assinatura_instrutor: fichasAguardandoAssinaturaInstrutor,
    fichas_aguardando_assinatura:
      fichasAguardandoAssinaturaAluno + fichasAguardandoAssinaturaInstrutor,
    sessoes_proximas_sem_ficha_completa: Number(sessoesSemFichaCompleta?.total || 0),
    edicoes_pendentes: Number(edicoesPendentes?.total || 0),
    janela_sessoes_proximas_horas: DASHBOARD_SIMULADORES_ALERT_WINDOW_HOURS,
  };
}

export async function getDashboardFrmsAlerts(
  db: D1Database,
  empresaId: number,
  access: EmployeeSectorAccess | undefined,
  dataInicio: string,
  limit = 200,
): Promise<Array<Record<string, unknown>>> {
  const employeeScope = buildEmployeeScopeSql(access, 'f');
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 200;

  const results = await db
    .prepare(
      `SELECT
         a.id,
         a.tripulante_id,
         a.nivel,
         a.descricao,
         a.tipo,
         a.data_jornada,
         a.resolvido,
         COALESCE(f.nome, a.nome_tripulante, 'Tripulante') as nome_tripulante
       FROM frms_alerta a
       JOIN funcionarios f
         ON f.id = CAST(a.tripulante_id AS INTEGER)
        AND f.deleted_at IS NULL
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
       WHERE a.deleted_at IS NULL
         AND COALESCE(a.resolvido, 0) = 0
         AND f.empresa_id = ?
         AND ${employeeScope.clause}
         AND date(a.data_jornada) >= date(?)
       ORDER BY date(a.data_jornada) DESC, a.created_at DESC
       LIMIT ?`,
    )
    .bind(empresaId, ...employeeScope.bindings, dataInicio, safeLimit)
    .all<Record<string, unknown>>();

  return results.results || [];
}

export async function getDashboardUpcomingSessions(
  db: D1Database,
  empresaId: number,
  access: EmployeeSectorAccess | undefined,
  dataInicio: string,
  limit = 24,
): Promise<Array<Record<string, unknown>>> {
  const sessionScope = buildSessionScopeSql(access, 'sa');
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 24;

  const results = await db
    .prepare(
      `SELECT
         sa.id,
         sa.data,
         sa.hora_inicio as horario_inicio,
         sa.hora_fim as horario_fim,
         sa.tipo_sessao,
         sa.nome as tema_sessao,
         sa.status,
         s.nome as simulador_nome,
         s.modelo as simulador_modelo,
         fi.nome as instrutor_nome
       FROM simulador_agendamentos sa
       LEFT JOIN simuladores s
         ON sa.simulador_id = s.id
        AND s.deleted_at IS NULL
       INNER JOIN funcionarios fi
         ON sa.instrutor_id = fi.id
        AND fi.deleted_at IS NULL
       WHERE sa.deleted_at IS NULL
         AND sa.empresa_id = ?
         AND ${sessionScope.clause}
         AND sa.data >= date(?)
         AND UPPER(COALESCE(sa.status, '')) IN ('AGENDADO', 'PENDENTE', 'CONFIRMADO')
       ORDER BY sa.data ASC, sa.hora_inicio ASC
       LIMIT ?`,
    )
    .bind(empresaId, ...sessionScope.bindings, dataInicio, safeLimit)
    .all<Record<string, unknown>>();

  return results.results || [];
}

export async function getDashboardSimuladoresAlerts(
  db: D1Database,
  empresaId: number,
  access: EmployeeSectorAccess | undefined,
  horizonHours = 24,
): Promise<Record<string, number>> {
  const sessionScope = buildSessionScopeSql(access, 'sa');
  const fichaScope = buildFichaScopeSql(access, 'f');
  const participantScope = buildEmployeeScopeSql(access, 'f_alert_participant');
  const nowKey = getSaoPauloDateTimeKey();
  const safeHorizonHours =
    Number.isInteger(horizonHours) && horizonHours > 0 ? Math.min(horizonHours, 168) : 24;
  const windowEndKey = getSaoPauloDateTimeKey(
    new Date(Date.now() + safeHorizonHours * 60 * 60 * 1000),
  );
  const hasEdicoesTable = await tableExists(db, 'fichas_sessao_edicoes');

  const normalizedStatusSql = `
    CASE
      WHEN f.assinatura_instrutor_timestamp IS NOT NULL THEN
        CASE
          WHEN f.resultado_final = 'REPROVADO' THEN 'NAO_APROVADO'
          WHEN f.resultado_final = 'APROVADO' THEN 'APROVADO'
          WHEN f.aprovado = 0 AND f.resultado_final != 'PENDENTE' THEN 'NAO_APROVADO'
          WHEN f.aprovado = 1 THEN 'APROVADO'
          ELSE 'APROVADO'
        END
      WHEN f.assinatura_aluno_timestamp IS NOT NULL THEN 'AGUARDANDO_ASSINATURA_INSTRUTOR'
      WHEN f.status IN ('AGUARDANDO_ASSINATURA_ALUNO', 'AGUARDANDO_ASSINATURA_INSTRUTOR', 'AVALIACAO_PENDENTE', 'APROVADO', 'NAO_APROVADO') THEN f.status
      WHEN f.status IN ('AGUARDANDO_ASSINATURAS', 'AVALIADA') THEN 'AGUARDANDO_ASSINATURA_ALUNO'
      WHEN f.status IN ('ASSINADA_ALUNO') THEN 'AGUARDANDO_ASSINATURA_INSTRUTOR'
      WHEN f.status IN ('ASSINADA_TOTAL', 'APROVADA', 'CONCLUIDA') THEN
        CASE
          WHEN f.resultado_final = 'REPROVADO' THEN 'NAO_APROVADO'
          WHEN f.resultado_final = 'APROVADO' THEN 'APROVADO'
          WHEN f.aprovado = 0 AND f.resultado_final != 'PENDENTE' THEN 'NAO_APROVADO'
          WHEN f.aprovado = 1 THEN 'APROVADO'
          ELSE 'APROVADO'
        END
      ELSE 'AVALIACAO_PENDENTE'
    END
  `;
  const sessionKeySql = `strftime('%Y-%m-%d %H:%M', COALESCE(sa.data, f.data_sessao) || ' ' || COALESCE(sa.hora_inicio, '00:00'))`;
  const sessionKeyOnlySql = `strftime('%Y-%m-%d %H:%M', sa.data || ' ' || COALESCE(sa.hora_inicio, '00:00'))`;

  const [fichasResumo, sessoesIncompletas, edicoesPendentes] = await Promise.all([
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN ${sessionKeySql} <= ? AND ${normalizedStatusSql} = 'AVALIACAO_PENDENTE' THEN 1 ELSE 0 END) AS fichas_pendentes_avaliacao,
           SUM(CASE WHEN ${sessionKeySql} <= ? AND ${normalizedStatusSql} = 'AGUARDANDO_ASSINATURA_ALUNO' THEN 1 ELSE 0 END) AS fichas_aguardando_assinatura_aluno,
           SUM(CASE WHEN ${sessionKeySql} <= ? AND ${normalizedStatusSql} = 'AGUARDANDO_ASSINATURA_INSTRUTOR' THEN 1 ELSE 0 END) AS fichas_aguardando_assinatura_instrutor
         FROM fichas_sessao f
         INNER JOIN simulador_agendamentos sa
           ON sa.id = f.agendamento_slot_id
          AND sa.deleted_at IS NULL
         WHERE f.deleted_at IS NULL
           AND f.empresa_id = ?
           AND sa.empresa_id = ?
           AND UPPER(COALESCE(sa.status, '')) NOT IN ('CANCELADA', 'CANCELADO')
           AND ${sessionScope.clause}
           AND ${fichaScope.clause}`,
      )
      .bind(
        nowKey,
        nowKey,
        nowKey,
        empresaId,
        empresaId,
        ...sessionScope.bindings,
        ...fichaScope.bindings,
      )
      .first<{
        fichas_pendentes_avaliacao: number;
        fichas_aguardando_assinatura_aluno: number;
        fichas_aguardando_assinatura_instrutor: number;
      }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM (
           SELECT
             sa.id,
             SUM(CASE WHEN f.id IS NULL OR ${normalizedStatusSql} NOT IN ('APROVADO', 'NAO_APROVADO') THEN 1 ELSE 0 END) AS fichas_incompletas
           FROM simulador_agendamentos sa
           INNER JOIN sessoes_participantes sp_alert
             ON sp_alert.sessao_id = sa.id
            AND sp_alert.deleted_at IS NULL
           INNER JOIN funcionarios f_alert_participant
             ON f_alert_participant.id = sp_alert.funcionario_id
            AND f_alert_participant.deleted_at IS NULL
           LEFT JOIN fichas_sessao f
             ON f.agendamento_slot_id = sa.id
            AND f.colaborador_id_aluno = sp_alert.funcionario_id
            AND f.deleted_at IS NULL
            AND f.empresa_id = ?
           WHERE sa.deleted_at IS NULL
             AND sa.empresa_id = ?
             AND ${participantScope.clause}
             AND ${sessionKeyOnlySql} > ?
             AND ${sessionKeyOnlySql} <= ?
             AND UPPER(COALESCE(sa.status, '')) IN ('AGENDADO', 'PENDENTE', 'CONFIRMADO')
           GROUP BY sa.id
           HAVING fichas_incompletas > 0
         ) pendencias`,
      )
      .bind(empresaId, empresaId, ...participantScope.bindings, nowKey, windowEndKey)
      .first<{ total: number }>(),
    hasEdicoesTable
      ? db
          .prepare(
            `SELECT COUNT(*) AS total
             FROM fichas_sessao_edicoes fe
             INNER JOIN fichas_sessao f
               ON f.id = fe.ficha_id
              AND f.deleted_at IS NULL
              AND f.empresa_id = ?
             INNER JOIN simulador_agendamentos sa
               ON sa.id = f.agendamento_slot_id
              AND sa.deleted_at IS NULL
              AND sa.empresa_id = ?
             WHERE fe.deleted_at IS NULL
               AND fe.status = 'PENDENTE'
               AND ${sessionScope.clause}
               AND ${fichaScope.clause}`,
          )
          .bind(empresaId, empresaId, ...sessionScope.bindings, ...fichaScope.bindings)
          .first<{ total: number }>()
      : Promise.resolve({ total: 0 }),
  ]);

  const fichasAguardandoAluno = Number(fichasResumo?.fichas_aguardando_assinatura_aluno || 0);
  const fichasAguardandoInstrutor = Number(
    fichasResumo?.fichas_aguardando_assinatura_instrutor || 0,
  );

  return {
    fichas_pendentes_avaliacao: Number(fichasResumo?.fichas_pendentes_avaliacao || 0),
    fichas_aguardando_assinatura_aluno: fichasAguardandoAluno,
    fichas_aguardando_assinatura_instrutor: fichasAguardandoInstrutor,
    fichas_aguardando_assinatura: fichasAguardandoAluno + fichasAguardandoInstrutor,
    sessoes_proximas_sem_ficha_completa: Number(sessoesIncompletas?.total || 0),
    edicoes_pendentes: Number(edicoesPendentes?.total || 0),
    janela_sessoes_proximas_horas: safeHorizonHours,
  };
}

export async function getDashboardEscalasResumo(
  db: D1Database,
  empresaId: number,
  access: EmployeeSectorAccess | undefined,
  mes: number,
  ano: number,
  limit = 6,
): Promise<Array<Record<string, unknown>>> {
  const escalaScope = buildEscalaScopeSql(access, 'em');
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 12) : 6;

  const results = await db
    .prepare(
      `SELECT
         em.id,
         em.mes,
         em.ano,
         em.status,
         COALESCE(
           NULLIF((
             SELECT COUNT(*)
             FROM escala_alocacoes ea
             WHERE ea.escala_id = em.id
               AND ea.deleted_at IS NULL
               AND ea.status != 'cancelado'
               AND ea.situacao_tipo IS NULL
           ), 0),
           (
             SELECT COUNT(*)
             FROM escala_tripulacoes et
             WHERE et.escala_id = em.id
               AND et.deleted_at IS NULL
           )
         ) as total_tripulacoes
       FROM escalas_mensais em
       WHERE em.deleted_at IS NULL
         AND em.empresa_id = ?
         AND em.mes = ?
         AND em.ano = ?
         AND ${escalaScope.clause}
       ORDER BY em.ano DESC, em.mes DESC
       LIMIT ?`,
    )
    .bind(empresaId, mes, ano, ...escalaScope.bindings, safeLimit)
    .all<Record<string, unknown>>();

  return results.results || [];
}

/**
 * Verifica saúde do sistema
 */
export async function getSystemHealth(db: D1Database): Promise<SystemHealth> {
  try {
    const startTime = Date.now();
    const [, latencyCount] = await Promise.all([
      db.prepare('SELECT 1').first(),
      db
        .prepare(
          `SELECT COUNT(*) as total FROM api_latency_samples WHERE created_at >= datetime('now', '-1 hour')`,
        )
        .first<{ total: number }>(),
    ]);
    const dbLatency = Date.now() - startTime;
    const requestsUltima1h = latencyCount?.total || 0;

    return {
      status: 'healthy',
      database: {
        status: dbLatency < 100 ? 'ok' : dbLatency < 300 ? 'slow' : 'down',
        latency: dbLatency,
        ultimaVerificacao: new Date().toISOString(),
      },
      storage: {
        status: 'ok',
        espacoUsado: 0, // R2 não expõe uso de armazenamento via D1
        espacoTotal: 100,
        ultimaVerificacao: new Date().toISOString(),
      },
      workers: {
        status: 'ok',
        requestsUltima1h: requestsUltima1h,
        errorsUltima1h: 0,
        p95Latency: dbLatency,
      },
    };
  } catch (error) {
    console.error('[DASHBOARD] Erro ao verificar saúde do sistema:', error);
    return {
      status: 'critical',
      database: {
        status: 'down',
        latency: 0,
        ultimaVerificacao: new Date().toISOString(),
      },
      storage: {
        status: 'down',
        espacoUsado: 0,
        espacoTotal: 100,
        ultimaVerificacao: new Date().toISOString(),
      },
      workers: {
        status: 'down',
        requestsUltima1h: 0,
        errorsUltima1h: 0,
        p95Latency: 0,
      },
    };
  }
}
