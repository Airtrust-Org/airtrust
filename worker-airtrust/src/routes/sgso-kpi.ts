/**
 * SGSO — KPIs / SPIs + Tendências + Categorias ADREP
 * Routes extracted from sgso.ts:
 *   GET /kpi/spi
 *   GET /kpi/tendencias
 *   GET /categorias-adrep
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { getEmpresaId } from '../middleware/tenant';
import { createLogger, toError } from '../utils/logger';

type AppCtx = Context<{ Bindings: Env; Variables: { userId?: string } }>;

const sgsoKpi = new Hono<{ Bindings: Env; Variables: { userId?: string } }>();

function now(): string {
  return new Date().toISOString();
}

function sgsoErrorResponse(
  c: AppCtx,
  error: unknown,
  message: string,
  code: string,
  status: number = 500,
) {
  const logger = createLogger(c as Record<string, any>, 'SgsoKpiRoutes');
  logger.error(message, toError(error), { route: c.req.path, status });
  return c.json({ success: false, error: message, code }, status as any);
}

async function getTableColumns(db: D1Database, tableName: string): Promise<Set<string>> {
  const ALLOWED_TABLES = new Set([
    'sgso_relatos',
    'sgso_relatos_historico_status',
    'sgso_avaliacao_risco',
    'sgso_acoes_mitigacao',
    'sgso_relatos_fatores_humanos',
    'frms_jornada',
  ]);
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Table not allowed: ${tableName}`);
  }
  const pragma = await db.prepare(`PRAGMA table_info(${tableName})`).all<{ name: string }>();
  return new Set((pragma.results || []).map((column) => String(column.name)));
}

function evalOperador(valor: number, op: string, meta: number): boolean {
  switch (op) {
    case '>=':
      return valor >= meta;
    case '<=':
      return valor <= meta;
    case '>':
      return valor > meta;
    case '<':
      return valor < meta;
    case '=':
      return valor === meta;
    default:
      return false;
  }
}

function calcTrend(
  codigo: string,
  nome: string,
  atual: number,
  anterior: number,
  higherIsBetter: boolean,
) {
  const deltaAbsoluto = atual - anterior;
  const deltaPercentual = anterior === 0 ? null : (deltaAbsoluto / anterior) * 100;
  const direcao = deltaAbsoluto > 0 ? 'SUBIU' : deltaAbsoluto < 0 ? 'CAIU' : 'ESTAVEL';
  const favoravel =
    deltaAbsoluto === 0 ? true : higherIsBetter ? deltaAbsoluto > 0 : deltaAbsoluto < 0;

  return {
    codigo,
    nome,
    valor_atual: atual,
    valor_periodo_anterior: anterior,
    delta_absoluto: deltaAbsoluto,
    delta_percentual: deltaPercentual,
    direcao,
    favoravel,
  };
}

// ─────────────────────────────────────────────────────────────
// KPIs / SPIs
// ─────────────────────────────────────────────────────────────

// GET /api/sgso/kpi/spi
sgsoKpi.get('/kpi/spi', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const frmsColumns = await getTableColumns(db, 'frms_jornada');

    // Período: últimos 90 dias para cálculos rolling
    const hoje = new Date();
    const inicio90d = new Date(hoje.getTime() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const inicio28d = new Date(hoje.getTime() - 28 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const inicio56d = new Date(hoje.getTime() - 56 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const inicio365d = new Date(hoje.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Total de relatos nos últimos 90 dias
    const totalRelatos90d = await db
      .prepare(
        `SELECT COUNT(*) as n FROM sgso_relatos
         WHERE empresa_id = ? AND deleted_at IS NULL AND date(data_ocorrencia) >= ?`,
      )
      .bind(empresaId, inicio90d)
      .first<{ n: number }>();

    // Ocorrências sérias (INCIDENTE + ACIDENTE) últimos 365d
    const ocorrenciasSerias = await db
      .prepare(
        `SELECT COUNT(*) as n FROM sgso_relatos
         WHERE empresa_id = ? AND deleted_at IS NULL
           AND tipo IN ('INCIDENTE','ACIDENTE')
           AND date(data_ocorrencia) >= ?`,
      )
      .bind(empresaId, inicio365d)
      .first<{ n: number }>();

    // Ações CAPA: % fechadas no prazo
    const acoesPrazo = await db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'CONCLUIDA' AND (data_conclusao IS NULL OR data_conclusao <= prazo) THEN 1 ELSE 0 END) AS no_prazo
         FROM sgso_acoes_mitigacao
         WHERE empresa_id = ? AND deleted_at IS NULL AND status IN ('CONCLUIDA','PENDENTE','EM_ANDAMENTO')`,
      )
      .bind(empresaId)
      .first<{ total: number; no_prazo: number }>();

    // NCs abertas > 30 dias
    const nc30d = await db
      .prepare(
        `SELECT COUNT(*) as n FROM sgso_nao_conformidades
         WHERE empresa_id = ? AND deleted_at IS NULL AND status IN ('ABERTA','EM_RESOLUCAO')
           AND date(created_at) <= date('now', '-30 days')`,
      )
      .bind(empresaId)
      .first<{ n: number }>();

    // Auditorias: programadas vs concluídas (últimos 365d)
    const auditorias = await db
      .prepare(
        `SELECT
           COUNT(*) AS programadas,
           SUM(CASE WHEN status = 'CONCLUIDA' THEN 1 ELSE 0 END) AS concluidas
         FROM sgso_auditorias
         WHERE empresa_id = ? AND deleted_at IS NULL AND date(created_at) >= ?`,
      )
      .bind(empresaId, inicio365d)
      .first<{ programadas: number; concluidas: number }>();

    const frmsDateColumn = frmsColumns.has('data_inicio')
      ? 'data_inicio'
      : frmsColumns.has('data')
        ? 'data'
        : null;
    const frmsHoursExpr = frmsColumns.has('horas_voo')
      ? 'COALESCE(SUM(horas_voo), 0)'
      : frmsColumns.has('horas_voo_minutos')
        ? 'COALESCE(SUM(horas_voo_minutos), 0) / 60.0'
        : '0';
    const frmsHasEffectiveness = frmsColumns.has('effectiveness_pct');

    const buildFrmsWhere = (dateFrom: string | null, dateToExclusive?: string | null) => {
      const clauses: string[] = [];
      const params: Array<number | string> = [];

      if (frmsColumns.has('empresa_id')) {
        clauses.push('empresa_id = ?');
        params.push(empresaId);
      }
      if (frmsColumns.has('deleted_at')) {
        clauses.push('deleted_at IS NULL');
      }
      if (dateFrom && frmsDateColumn) {
        clauses.push(`date(${frmsDateColumn}) >= ?`);
        params.push(dateFrom);
      }
      if (dateToExclusive && frmsDateColumn) {
        clauses.push(`date(${frmsDateColumn}) < ?`);
        params.push(dateToExclusive);
      }

      return {
        whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
        params,
      };
    };

    const frmsWhere28d = buildFrmsWhere(inicio28d);
    const efetividade = frmsHasEffectiveness
      ? await db
          .prepare(
            `SELECT AVG(effectiveness_pct) as media
             FROM frms_jornada
             ${frmsWhere28d.whereSql}`,
          )
          .bind(...frmsWhere28d.params)
          .first<{ media: number | null }>()
      : { media: null };

    // Relatos anônimos %
    const anonimos = await db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN anonimo = 1 THEN 1 ELSE 0 END) AS anonimos
         FROM sgso_relatos
         WHERE empresa_id = ? AND deleted_at IS NULL AND date(data_ocorrencia) >= ?`,
      )
      .bind(empresaId, inicio90d)
      .first<{ total: number; anonimos: number }>();

    // Buscar config de SPIs para a empresa
    const spiConfig = await db
      .prepare('SELECT * FROM sgso_spi_config WHERE empresa_id = ? AND ativo = 1')
      .bind(empresaId)
      .all<{
        codigo: string;
        nome: string;
        descricao: string;
        unidade: string;
        meta_valor: number;
        meta_operador: string;
        alerta_valor: number;
        alerta_operador: string;
      }>();

    const frmsWhere90d = buildFrmsWhere(inicio90d);
    const horasVoo = await db
      .prepare(
        `SELECT ${frmsHoursExpr} as total
         FROM frms_jornada
         ${frmsWhere90d.whereSql}`,
      )
      .bind(...frmsWhere90d.params)
      .first<{ total: number }>();

    const horas100 = (horasVoo?.total ?? 0) / 100;
    const horas1000 = (horasVoo?.total ?? 0) / 1000;

    const spiValores: Record<string, number | null> = {
      TAXA_RELATOS: horas100 > 0 ? (totalRelatos90d?.n ?? 0) / horas100 : null,
      TAXA_OCORRENCIAS_SERIAS: horas1000 > 0 ? (ocorrenciasSerias?.n ?? 0) / horas1000 : null,
      FECHAMENTO_ACOES:
        (acoesPrazo?.total ?? 0) > 0
          ? ((acoesPrazo?.no_prazo ?? 0) / (acoesPrazo?.total ?? 1)) * 100
          : null,
      NCS_ABERTAS_30D: nc30d?.n ?? 0,
      EXECUCAO_AUDITORIAS:
        (auditorias?.programadas ?? 0) > 0
          ? ((auditorias?.concluidas ?? 0) / (auditorias?.programadas ?? 1)) * 100
          : null,
      EFETIVIDADE_COGNITIVA_MEDIA: efetividade?.media ?? null,
      RELATOS_ANONIMOS_PERC:
        (anonimos?.total ?? 0) > 0
          ? ((anonimos?.anonimos ?? 0) / (anonimos?.total ?? 1)) * 100
          : null,
    };

    const relatosSemTriagem24h = await db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM sgso_relatos r
         LEFT JOIN sgso_relato_ia_triagem ai ON ai.relato_id = r.id
         WHERE r.empresa_id = ?
           AND r.deleted_at IS NULL
           AND ai.relato_id IS NULL
           AND datetime(r.created_at) <= datetime('now', '-24 hours')`,
      )
      .bind(empresaId)
      .first<{ total: number }>();

    const fratAltoSemAprovacao = await db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM sgso_frat_avaliacoes
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND exige_aprovacao = 1
           AND despacho_bloqueado = 1
           AND status = 'SUBMETIDO'`,
      )
      .bind(empresaId)
      .first<{ total: number }>();

    const barreirasDegradadas = await db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM sgso_bowtie_barreiras
         WHERE empresa_id = ?
           AND status_saude IN ('DEGRADADA', 'INOPERANTE')`,
      )
      .bind(empresaId)
      .first<{ total: number }>();

    const relatosCognitivosBaixos28d = await db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM sgso_relatos
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND efetividade_cognitiva IS NOT NULL
           AND efetividade_cognitiva < 70
           AND date(data_ocorrencia) >= ?`,
      )
      .bind(empresaId, inicio28d)
      .first<{ total: number }>();

    const relatosCognitivosBaixos28dAnterior = await db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM sgso_relatos
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND efetividade_cognitiva IS NOT NULL
           AND efetividade_cognitiva < 70
           AND date(data_ocorrencia) >= ?
           AND date(data_ocorrencia) < ?`,
      )
      .bind(empresaId, inicio56d, inicio28d)
      .first<{ total: number }>();

    const sinaisTendencia28d = await db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM sgso_relato_ia_triagem ai
         JOIN sgso_relatos r ON r.id = ai.relato_id AND r.empresa_id = ? AND r.deleted_at IS NULL
         WHERE ai.sinal_tendencia IN ('EM_OBSERVACAO', 'TENDENCIA', 'SURTO')
           AND date(r.data_ocorrencia) >= ?`,
      )
      .bind(empresaId, inicio28d)
      .first<{ total: number }>();

    const sinaisTendencia28dAnterior = await db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM sgso_relato_ia_triagem ai
         JOIN sgso_relatos r ON r.id = ai.relato_id AND r.empresa_id = ? AND r.deleted_at IS NULL
         WHERE ai.sinal_tendencia IN ('EM_OBSERVACAO', 'TENDENCIA', 'SURTO')
           AND date(r.data_ocorrencia) >= ?
           AND date(r.data_ocorrencia) < ?`,
      )
      .bind(empresaId, inicio56d, inicio28d)
      .first<{ total: number }>();

    const relatos28d = await db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN anonimo = 1 THEN 1 ELSE 0 END) AS anonimos,
                SUM(CASE WHEN tipo IN ('INCIDENTE', 'ACIDENTE') THEN 1 ELSE 0 END) AS serios
         FROM sgso_relatos
         WHERE empresa_id = ? AND deleted_at IS NULL AND date(data_ocorrencia) >= ?`,
      )
      .bind(empresaId, inicio28d)
      .first<{ total: number; anonimos: number; serios: number }>();

    const relatos28dAnterior = await db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN anonimo = 1 THEN 1 ELSE 0 END) AS anonimos,
                SUM(CASE WHEN tipo IN ('INCIDENTE', 'ACIDENTE') THEN 1 ELSE 0 END) AS serios
         FROM sgso_relatos
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND date(data_ocorrencia) >= ?
           AND date(data_ocorrencia) < ?`,
      )
      .bind(empresaId, inicio56d, inicio28d)
      .first<{ total: number; anonimos: number; serios: number }>();

    const frmsWhereAtual28d = buildFrmsWhere(inicio28d);
    const horas28d = await db
      .prepare(
        `SELECT ${frmsHoursExpr} as total
         FROM frms_jornada
         ${frmsWhereAtual28d.whereSql}`,
      )
      .bind(...frmsWhereAtual28d.params)
      .first<{ total: number }>();

    const frmsWhereAnterior28d = buildFrmsWhere(inicio56d, inicio28d);
    const horas28dAnterior = await db
      .prepare(
        `SELECT ${frmsHoursExpr} as total
         FROM frms_jornada
         ${frmsWhereAnterior28d.whereSql}`,
      )
      .bind(...frmsWhereAnterior28d.params)
      .first<{ total: number }>();

    const taxaRelatos28dAtual =
      (horas28d?.total ?? 0) > 0 ? (relatos28d?.total ?? 0) / ((horas28d?.total ?? 0) / 100) : 0;
    const taxaRelatos28dAnterior =
      (horas28dAnterior?.total ?? 0) > 0
        ? (relatos28dAnterior?.total ?? 0) / ((horas28dAnterior?.total ?? 0) / 100)
        : 0;
    const taxaSerias28dAtual =
      (horas28d?.total ?? 0) > 0 ? (relatos28d?.serios ?? 0) / ((horas28d?.total ?? 0) / 1000) : 0;
    const taxaSerias28dAnterior =
      (horas28dAnterior?.total ?? 0) > 0
        ? (relatos28dAnterior?.serios ?? 0) / ((horas28dAnterior?.total ?? 0) / 1000)
        : 0;
    const anonimato28dAtual =
      (relatos28d?.total ?? 0) > 0
        ? ((relatos28d?.anonimos ?? 0) / (relatos28d?.total ?? 1)) * 100
        : 0;
    const anonimato28dAnterior =
      (relatos28dAnterior?.total ?? 0) > 0
        ? ((relatos28dAnterior?.anonimos ?? 0) / (relatos28dAnterior?.total ?? 1)) * 100
        : 0;

    const leadingIndicators = [
      {
        codigo: 'RELATOS_SEM_TRIAGEM_24H',
        nome: 'Relatos sem triagem > 24h',
        valor_atual: relatosSemTriagem24h?.total ?? 0,
        unidade: 'quantidade',
        status:
          (relatosSemTriagem24h?.total ?? 0) === 0
            ? 'ok'
            : (relatosSemTriagem24h?.total ?? 0) <= 3
              ? 'atencao'
              : 'critico',
      },
      {
        codigo: 'FRAT_ALTO_SEM_APROVACAO',
        nome: 'FRAT alto sem aprovacao',
        valor_atual: fratAltoSemAprovacao?.total ?? 0,
        unidade: 'quantidade',
        status:
          (fratAltoSemAprovacao?.total ?? 0) === 0
            ? 'ok'
            : (fratAltoSemAprovacao?.total ?? 0) <= 2
              ? 'atencao'
              : 'critico',
      },
      {
        codigo: 'BARREIRAS_DEGRADADAS',
        nome: 'Barreiras Bowtie degradadas',
        valor_atual: barreirasDegradadas?.total ?? 0,
        unidade: 'quantidade',
        status:
          (barreirasDegradadas?.total ?? 0) === 0
            ? 'ok'
            : (barreirasDegradadas?.total ?? 0) <= 2
              ? 'atencao'
              : 'critico',
      },
      {
        codigo: 'COGNITIVO_ABAIXO_70_28D',
        nome: 'Relatos com efetividade cognitiva < 70%',
        valor_atual: relatosCognitivosBaixos28d?.total ?? 0,
        unidade: 'quantidade/28d',
        status:
          (relatosCognitivosBaixos28d?.total ?? 0) === 0
            ? 'ok'
            : (relatosCognitivosBaixos28d?.total ?? 0) <= 2
              ? 'atencao'
              : 'critico',
      },
      {
        codigo: 'SINAIS_TENDENCIA_28D',
        nome: 'Sinais de tendencia detectados pela triagem',
        valor_atual: sinaisTendencia28d?.total ?? 0,
        unidade: 'quantidade/28d',
        status:
          (sinaisTendencia28d?.total ?? 0) <= 1
            ? 'ok'
            : (sinaisTendencia28d?.total ?? 0) <= 3
              ? 'atencao'
              : 'critico',
      },
    ];

    const tendenciaCurta = [
      calcTrend(
        'TAXA_RELATOS_28D',
        'Taxa de relatos por 100h (28d)',
        taxaRelatos28dAtual,
        taxaRelatos28dAnterior,
        true,
      ),
      calcTrend(
        'TAXA_OCORRENCIAS_SERIAS_28D',
        'Taxa de ocorrencias serias por 1.000h (28d)',
        taxaSerias28dAtual,
        taxaSerias28dAnterior,
        false,
      ),
      calcTrend(
        'RELATOS_ANONIMOS_PERC_28D',
        'Relatos anonimos (%) em 28d',
        anonimato28dAtual,
        anonimato28dAnterior,
        true,
      ),
      calcTrend(
        'COGNITIVO_ABAIXO_70_28D',
        'Relatos com efetividade cognitiva < 70% (28d)',
        relatosCognitivosBaixos28d?.total ?? 0,
        relatosCognitivosBaixos28dAnterior?.total ?? 0,
        false,
      ),
      calcTrend(
        'SINAIS_TENDENCIA_28D',
        'Sinais de tendencia na triagem (28d)',
        sinaisTendencia28d?.total ?? 0,
        sinaisTendencia28dAnterior?.total ?? 0,
        false,
      ),
    ];

    // Calcular status de cada SPI
    const spis = spiConfig.results.map((cfg) => {
      const valor = spiValores[cfg.codigo];
      let statusSpi = 'info';
      if (valor !== null) {
        const atingeMeta = evalOperador(valor, cfg.meta_operador, cfg.meta_valor);
        const emAlerta = evalOperador(valor, cfg.alerta_operador, cfg.alerta_valor);
        statusSpi = atingeMeta ? 'ok' : emAlerta ? 'critico' : 'atencao';
      }
      return { ...cfg, valor_atual: valor, status: statusSpi };
    });

    return c.json({
      success: true,
      data: {
        spis,
        leading_indicators: leadingIndicators,
        tendencia_curta: tendenciaCurta,
        resumo: {
          total_relatos_90d: totalRelatos90d?.n ?? 0,
          horas_voo_90d: horasVoo?.total ?? 0,
          ncs_abertas: nc30d?.n ?? 0,
          efetividade_media: efetividade?.media ?? null,
          backlog_triagem_24h: relatosSemTriagem24h?.total ?? 0,
          frat_alto_sem_aprovacao: fratAltoSemAprovacao?.total ?? 0,
          barreiras_degradadas: barreirasDegradadas?.total ?? 0,
        },
      },
    });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao calcular SPIs', 'SGSO_SPI_CALC_ERROR');
  }
});

// GET /api/sgso/kpi/tendencias
sgsoKpi.get('/kpi/tendencias', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;

    // Relatos por mês (últimos 12 meses)
    const relatosMes = await db
      .prepare(
        `SELECT strftime('%Y-%m', data_ocorrencia) AS mes, COUNT(*) AS total,
                SUM(CASE WHEN tipo = 'INCIDENTE' THEN 1 ELSE 0 END) AS incidentes,
                SUM(CASE WHEN tipo = 'ACIDENTE' THEN 1 ELSE 0 END) AS acidentes,
                SUM(CASE WHEN anonimo = 1 THEN 1 ELSE 0 END) AS anonimos
         FROM sgso_relatos
         WHERE empresa_id = ? AND deleted_at IS NULL
           AND date(data_ocorrencia) >= date('now', '-12 months')
         GROUP BY mes
         ORDER BY mes ASC`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    // NCs abertas por mês
    const ncsMes = await db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) AS mes, COUNT(*) AS total,
                SUM(CASE WHEN tipo = 'MAJOR' THEN 1 ELSE 0 END) AS major,
                SUM(CASE WHEN tipo = 'MINOR' THEN 1 ELSE 0 END) AS minor
         FROM sgso_nao_conformidades
         WHERE empresa_id = ? AND deleted_at IS NULL
           AND date(created_at) >= date('now', '-12 months')
         GROUP BY mes
         ORDER BY mes ASC`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    // Top 5 aeronaves com mais relatos
    const topAeronaves = await db
      .prepare(
        `SELECT aeronave_matricula, aeronave_modelo, COUNT(*) AS total
         FROM sgso_relatos
         WHERE empresa_id = ? AND deleted_at IS NULL AND aeronave_matricula IS NOT NULL
         GROUP BY aeronave_matricula
         ORDER BY total DESC
         LIMIT 5`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    // Distribuição por categoria ADREP
    const categorias = await db
      .prepare(
        `SELECT categoria_adrep, COUNT(*) AS total
         FROM sgso_relatos
         WHERE empresa_id = ? AND deleted_at IS NULL AND categoria_adrep IS NOT NULL
         GROUP BY categoria_adrep
         ORDER BY total DESC
         LIMIT 10`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    // Densidade da matriz de risco (para heatmap)
    const matrizDensidade = await db
      .prepare(
        `SELECT probabilidade, severidade, COUNT(*) AS total
         FROM sgso_avaliacao_risco
         WHERE empresa_id = ? AND deleted_at IS NULL AND tipo_avaliacao = 'INICIAL'
         GROUP BY probabilidade, severidade`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    return c.json({
      success: true,
      data: {
        relatos_por_mes: relatosMes.results,
        ncs_por_mes: ncsMes.results,
        top_aeronaves: topAeronaves.results,
        categorias_adrep: categorias.results,
        matriz_densidade: matrizDensidade.results,
      },
    });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao calcular tendências', 'SGSO_TREND_CALC_ERROR');
  }
});

// ─────────────────────────────────────────────────────────────
// CATEGORIAS ADREP
// ─────────────────────────────────────────────────────────────

// GET /api/sgso/categorias-adrep
sgsoKpi.get('/categorias-adrep', async (c) => {
  try {
    const db = c.env.DB;
    const rows = await db
      .prepare(
        'SELECT id, codigo, nome_pt, nome_en FROM sgso_categorias_adrep WHERE ativo = 1 ORDER BY nome_pt ASC',
      )
      .all<{ id: number; codigo: string; nome_pt: string; nome_en: string }>();
    return c.json({ success: true, data: rows.results });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao buscar categorias', 'SGSO_CATEGORIAS_GET_ERROR');
  }
});

export default sgsoKpi;
