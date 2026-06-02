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
  getQualificacoesAlertaDias,
  getTodayIsoSaoPaulo,
  getQualificacoesVencimentoExpr,
} from '../utils/qualificacoes-alerta-config';

/**
 * Busca métricas principais do dashboard
 * NOTA: Usa cálculo DINÂMICO de data_vencimento via data_conclusao + validade
 * para manter consistência com o endpoint /qualificacoes/historico
 */
export async function getDashboardMetrics(
  db: D1Database,
  empresaId: number,
): Promise<DashboardMetrics> {
  try {
    const thresholdDias = await getQualificacoesAlertaDias(db, empresaId);
    const hojeSp = getTodayIsoSaoPaulo();
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');

    // Query otimizada: busca todas as métricas em uma única execução paralela
    const [tripulantes, qualificacoes, taxaConclusao, demanda, lmsStats] = await Promise.all([
      // Tripulantes Ativos
      db
        .prepare(
          `SELECT COUNT(*) as total
           FROM funcionarios
           WHERE deleted_at IS NULL
           AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
           AND empresa_id = ?`,
        )
        .bind(empresaId)
        .first<{ total: number }>(),

      // Qualificações: contagem por status usando cálculo DINÂMICO de vencimento
      // Usa data_conclusao + qt.validade (meses) para calcular data de vencimento real
      db
        .prepare(
          `SELECT
             COUNT(*) as total_qualificacoes,
             SUM(CASE
               WHEN qh.renovada = 1 THEN 0
               WHEN ${vencimentoExpr} IS NULL THEN 0
               WHEN date(${vencimentoExpr}) > date(?, '+' || ? || ' days') THEN 1
               ELSE 0
             END) as validas,
             SUM(CASE
               WHEN qh.renovada = 1 THEN 0
               WHEN ${vencimentoExpr} IS NULL THEN 0
               WHEN date(${vencimentoExpr}) >= date(?)
                AND date(${vencimentoExpr}) <= date(?, '+' || ? || ' days') THEN 1
               ELSE 0
             END) as vencendo_30,
             SUM(CASE
               WHEN qh.renovada = 1 THEN 0
               WHEN ${vencimentoExpr} IS NULL THEN 0
               WHEN date(${vencimentoExpr}) < date(?) THEN 1
               ELSE 0
             END) as vencidas,
             COUNT(DISTINCT CASE
               WHEN qh.renovada = 0
               AND ${vencimentoExpr} IS NOT NULL
               AND date(${vencimentoExpr}) BETWEEN date(?) AND date(?, '+' || ? || ' days')
               THEN qh.funcionario_id
             END) as tripulantes_vencendo,
             COUNT(DISTINCT CASE
               WHEN qh.renovada = 0
               AND ${vencimentoExpr} IS NOT NULL
               AND date(${vencimentoExpr}) < date(?)
               THEN qh.funcionario_id
             END) as tripulantes_vencidos
           FROM qualificacoes_historico qh
           JOIN funcionarios f ON f.id = qh.funcionario_id
           JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
           WHERE qh.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           AND f.empresa_id = ?`,
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
               COUNT(CASE WHEN status IN ('CONCLUIDA', 'CONCLUIDO') THEN 1 END) * 100.0 /
               NULLIF(COUNT(*), 0),
               0
             ) as taxa_conclusao
           FROM simulador_agendamentos
           WHERE deleted_at IS NULL
           AND empresa_id = ?
           AND strftime('%Y-%m', data) = strftime('%Y-%m', date('now', '-1 month'))`,
        )
        .bind(empresaId)
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
           AND status IN ('AGENDADO', 'PENDENTE')
           AND data >= date('now')`,
        )
        .bind(empresaId)
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
               COUNT(CASE WHEN status IN ('CONCLUIDA', 'CONCLUIDO') THEN 1 END) * 100.0 /
               NULLIF(COUNT(*), 0), 0
             ) as taxa
           FROM simulador_agendamentos
           WHERE deleted_at IS NULL
           AND empresa_id = ?
           AND strftime('%Y-%m', data) = strftime('%Y-%m', date('now', '-2 months'))`,
        )
        .bind(empresaId)
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
): Promise<AlertaCritico[]> {
  try {
    const thresholdDias = await getQualificacoesAlertaDias(db, empresaId);
    const hojeSp = getTodayIsoSaoPaulo();
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');

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
         AND qh.renovada = 0
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
      .bind(hojeSp, hojeSp, hojeSp, hojeSp, empresaId, hojeSp, thresholdDias, hojeSp, hojeSp)
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
             AND rc.deleted_at IS NULL
             AND rc.tipo_recurso = 'curso_lms'
             AND rc.obrigatorio = 1
             AND COALESCE(m.status, 'NAO_MATRICULADO') != 'CONCLUIDO'
           ORDER BY f.nome, c.titulo
           LIMIT 30`,
        )
        .bind(empresaId)
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
): Promise<ComplianceScore> {
  try {
    const [qualificacoes, simuladores, qualificacoesAnterior, lmsCompliance] = await Promise.all([
      // % de qualificações válidas (cálculo dinâmico de vencimento)
      db
        .prepare(
          `SELECT
             COALESCE(
               SUM(CASE
                 WHEN date(qh.data_conclusao, '+' || COALESCE(qt.validade, 12) || ' months') >= date('now') THEN 1
                 ELSE 0
               END) * 100.0 /
               NULLIF(COUNT(*), 0),
               100
             ) as percentual_qualificacoes_validas,
             COUNT(*) as total_qualificacoes,
             SUM(CASE
               WHEN date(qh.data_conclusao, '+' || COALESCE(qt.validade, 12) || ' months') >= date('now') THEN 1
               ELSE 0
             END) as qualificacoes_validas
           FROM qualificacoes_historico qh
           JOIN funcionarios f ON f.id = qh.funcionario_id
           JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
           WHERE qh.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           AND f.empresa_id = ?
           AND qh.renovada = 0
           AND qh.data_conclusao IS NOT NULL`,
        )
        .bind(empresaId)
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
                AND status IN ('CONCLUIDA', 'CONCLUIDO')
                AND data >= date('now', '-3 months')) * 100.0 /
               NULLIF((SELECT COUNT(*) FROM simulador_agendamentos
                       WHERE deleted_at IS NULL
                       AND empresa_id = ?
                       AND data >= date('now', '-3 months')), 0),
               100
             ) as percentual_sessoes_concluidas`,
        )
        .bind(empresaId, empresaId)
        .first<{ percentual_sessoes_concluidas: number }>(),

      // % de qualificações válidas do mês anterior (para calcular tendência)
      db
        .prepare(
          `SELECT
             COALESCE(
               SUM(CASE
                 WHEN date(qh.data_conclusao, '+' || COALESCE(qt.validade, 12) || ' months') >= date('now', '-1 month') THEN 1
                 ELSE 0
               END) * 100.0 /
               NULLIF(COUNT(*), 0),
               100
             ) as percentual_qualificacoes_validas_anterior
           FROM qualificacoes_historico qh
           JOIN funcionarios f ON f.id = qh.funcionario_id
           JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
           WHERE qh.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           AND f.empresa_id = ?
           AND qh.renovada = 0
           AND qh.data_conclusao IS NOT NULL
           AND qh.data_conclusao <= date('now', '-1 month')`,
        )
        .bind(empresaId)
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
             AND rc.deleted_at IS NULL
             AND rc.tipo_recurso = 'curso_lms'
             AND rc.obrigatorio = 1`,
        )
        .bind(empresaId)
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
): Promise<DemandaTreinamento> {
  try {
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
           AND status IN ('AGENDADO', 'PENDENTE')
           AND empresa_id = ?
           AND data BETWEEN date('now') AND date('now', '+90 days')`,
        )
        .bind(empresaId)
        .first<{ proximos_30: number; dias_31_60: number; dias_61_90: number; total: number }>(),

      // Por tipo de sessão
      db
        .prepare(
          `SELECT
             tipo_sessao,
             COUNT(*) as quantidade
           FROM simulador_agendamentos
           WHERE deleted_at IS NULL
           AND status IN ('AGENDADO', 'PENDENTE')
           AND empresa_id = ?
           AND data BETWEEN date('now') AND date('now', '+90 days')
           GROUP BY tipo_sessao`,
        )
        .bind(empresaId)
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
           AND sa.status IN ('AGENDADO', 'PENDENTE')
           AND sa.empresa_id = ?
           AND sa.data BETWEEN date('now') AND date('now', '+90 days')
           GROUP BY s.id, s.nome
           ORDER BY quantidade DESC`,
        )
        .bind(empresaId)
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
           AND sa.status IN ('AGENDADO', 'PENDENTE')
           AND sa.empresa_id = ?
           AND sa.data BETWEEN date('now') AND date('now', '+90 days')
           AND sa.instrutor_id IS NOT NULL
           GROUP BY sa.instrutor_id, f.nome
           ORDER BY sessoesProgramadas DESC
           LIMIT 20`,
        )
        .bind(empresaId)
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
): Promise<AtividadeRecente[]> {
  try {
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
           AND sa.status IN ('CONCLUIDA', 'CONCLUIDO')
           AND f.empresa_id = ?
           ORDER BY sa.updated_at DESC
           LIMIT 10`,
        )
        .bind(empresaId)
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
           JOIN funcionarios f ON f.id = qh.funcionario_id
           JOIN qualificacoes_tipos qt ON qt.codigo = qh.qualificacao_codigo
           WHERE qh.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           AND f.empresa_id = ?
           ORDER BY qh.created_at DESC
           LIMIT 10`,
        )
        .bind(empresaId)
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
): Promise<TaxaConclusaoMensal> {
  try {
    const results = await db
      .prepare(
        `SELECT
           strftime('%Y-%m', data) as mes,
           COUNT(CASE WHEN status IN ('CONCLUIDA', 'CONCLUIDO') THEN 1 END) * 100.0 /
           NULLIF(COUNT(*), 0) as taxa
         FROM simulador_agendamentos
         WHERE deleted_at IS NULL
         AND empresa_id = ?
         AND data >= date('now', '-6 months')
         GROUP BY strftime('%Y-%m', data)
         ORDER BY mes ASC`,
      )
      .bind(empresaId)
      .all();

    const meses: string[] = [];
    const taxas: number[] = [];

    (results.results || []).forEach((row: Record<string, unknown>) => {
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
): Promise<UtilizacaoSimuladores> {
  try {
    const results = await db
      .prepare(
        `SELECT
           s.id,
           s.nome,
           s.fabricante,
           s.modelo,
           COALESCE(SUM(CASE WHEN sa.status IN ('AGENDADO', 'CONCLUIDA', 'CONCLUIDO') THEN sa.duracao_minutos END), 0) / 60.0 as horas_programadas,
           720 as horas_disponiveis,
           COALESCE(SUM(CASE WHEN sa.status IN ('AGENDADO', 'CONCLUIDA', 'CONCLUIDO') THEN sa.duracao_minutos END), 0) * 100.0 / (720 * 60) as taxa_utilizacao,
           'operacional' as status
         FROM simuladores s
         LEFT JOIN simulador_agendamentos sa ON sa.simulador_id = s.id
           AND sa.deleted_at IS NULL
           AND sa.empresa_id = ?
           AND sa.data >= date('now', '-30 days')
           AND sa.data <= date('now')
         WHERE s.deleted_at IS NULL
         AND s.empresa_id = ?
         GROUP BY s.id, s.nome, s.fabricante, s.modelo
         ORDER BY taxa_utilizacao DESC`,
      )
      .bind(empresaId, empresaId)
      .all();

    const simuladores = (results.results || []).map((row: Record<string, unknown>) => ({
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
