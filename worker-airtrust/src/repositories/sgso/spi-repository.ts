/**
 * Leitura dos números brutos usados pelos SPIs/KPIs do SGSO (GET /kpi/spi).
 * Todas as consultas filtram por empresa_id. As regras que transformam estes
 * números em status vivem em services/sgso/kpi-spi (puras, sem I/O).
 */
import { getSchemaColumns } from '../../utils/db-schema';

export type SpiConfigRow = {
  codigo: string;
  nome: string;
  descricao: string;
  unidade: string;
  meta_valor: number;
  meta_operador: string;
  alerta_valor: number;
  alerta_operador: string;
};

type CountRow = { n: number } | null;
type TotalRow = { total: number } | null;
type RelatosJanelaRow = { total: number; anonimos: number; serios: number } | null;

export interface SpiRawMetrics {
  totalRelatos90d: CountRow;
  ocorrenciasSerias: CountRow;
  acoesPrazo: { total: number; no_prazo: number } | null;
  nc30d: CountRow;
  auditorias: { programadas: number; concluidas: number } | null;
  efetividade: { media: number | null } | null;
  anonimos: { total: number; anonimos: number } | null;
  spiConfig: SpiConfigRow[];
  horasVoo: TotalRow;
  relatosSemTriagem24h: TotalRow;
  fratAltoSemAprovacao: TotalRow;
  barreirasDegradadas: TotalRow;
  relatosCognitivosBaixos28d: TotalRow;
  relatosCognitivosBaixos28dAnterior: TotalRow;
  sinaisTendencia28d: TotalRow;
  sinaisTendencia28dAnterior: TotalRow;
  relatos28d: RelatosJanelaRow;
  relatos28dAnterior: RelatosJanelaRow;
  horas28d: TotalRow;
  horas28dAnterior: TotalRow;
}

export async function loadSpiRawMetrics(
  db: D1Database,
  empresaId: number,
  hoje: Date = new Date(),
): Promise<SpiRawMetrics> {
  const frmsColumns = await getSchemaColumns(db, 'frms_jornada');

  // Período: últimos 90 dias para cálculos rolling
  const inicio90d = new Date(hoje.getTime() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const inicio28d = new Date(hoje.getTime() - 28 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const inicio56d = new Date(hoje.getTime() - 56 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const inicio365d = new Date(hoje.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const totalRelatos90d = await db
    .prepare(
      `SELECT COUNT(*) as n FROM sgso_relatos
       WHERE empresa_id = ? AND deleted_at IS NULL AND date(data_ocorrencia) >= ?`,
    )
    .bind(empresaId, inicio90d)
    .first<{ n: number }>();

  const ocorrenciasSerias = await db
    .prepare(
      `SELECT COUNT(*) as n FROM sgso_relatos
       WHERE empresa_id = ? AND deleted_at IS NULL
         AND tipo IN ('INCIDENTE','ACIDENTE')
         AND date(data_ocorrencia) >= ?`,
    )
    .bind(empresaId, inicio365d)
    .first<{ n: number }>();

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

  const nc30d = await db
    .prepare(
      `SELECT COUNT(*) as n FROM sgso_nao_conformidades
       WHERE empresa_id = ? AND deleted_at IS NULL AND status IN ('ABERTA','EM_RESOLUCAO')
         AND date(created_at) <= date('now', '-30 days')`,
    )
    .bind(empresaId)
    .first<{ n: number }>();

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
    .all<SpiConfigRow>();

  const frmsWhere90d = buildFrmsWhere(inicio90d);
  const horasVoo = await db
    .prepare(
      `SELECT ${frmsHoursExpr} as total
       FROM frms_jornada
       ${frmsWhere90d.whereSql}`,
    )
    .bind(...frmsWhere90d.params)
    .first<{ total: number }>();

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

  return {
    totalRelatos90d,
    ocorrenciasSerias,
    acoesPrazo,
    nc30d,
    auditorias,
    efetividade,
    anonimos,
    spiConfig: spiConfig.results,
    horasVoo,
    relatosSemTriagem24h,
    fratAltoSemAprovacao,
    barreirasDegradadas,
    relatosCognitivosBaixos28d,
    relatosCognitivosBaixos28dAnterior,
    sinaisTendencia28d,
    sinaisTendencia28dAnterior,
    relatos28d,
    relatos28dAnterior,
    horas28d,
    horas28dAnterior,
  };
}
