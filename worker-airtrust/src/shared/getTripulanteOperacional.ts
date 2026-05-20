import type { D1Database } from '@cloudflare/workers-types';

export type StatusOperacional =
  | 'APTO'
  | 'ATENCAO_CMA'
  | 'ATENCAO_FRMS'
  | 'BLOQUEADO_CMA'
  | 'BLOQUEADO_FRMS';

export interface HabilitacaoModelo {
  modelo_id: string;
  modelo_codigo: string;
  validade_fim: string | null;
}

export interface TripulanteOperacional {
  funcionario_id: string;
  nome: string;
  nome_guerra: string | null;
  matricula: string;
  empresa_id: number;
  role: string;
  cma_valido: boolean;
  cma_dias_restantes: number | null;
  cma_validade_fim: string | null;
  frms_score: number | null;
  frms_status: 'ok' | 'atencao' | 'critico' | null;
  frms_avaliacao_data: string | null;
  simuladores_pendentes: number;
  proximo_simulador_data: string | null;
  habilitacoes: HabilitacaoModelo[];
  status_operacional: StatusOperacional;
  pode_ser_alocado: boolean;
  ja_alocado_nesta_escala?: boolean;
}

function normalizeModeloOperacional(value: string | null | undefined): string {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');

  if (!normalized) return '';
  if (normalized.includes('SK76') || normalized.includes('S76')) return 'SK76';
  if (normalized.includes('AW139')) return 'AW139';
  return normalized;
}

function getModeloAliases(value: string | null | undefined): string[] {
  const normalized = normalizeModeloOperacional(value);
  if (!normalized) return [];
  if (normalized === 'SK76') return ['SK76', 'S76'];
  return [normalized];
}

interface TripulanteOperacionalRow {
  funcionario_id: string;
  nome: string;
  nome_guerra: string | null;
  matricula: string;
  empresa_id: number;
  role: string;
  modelo_aeronave_id: string | null;
  aeronave_legacy: string | null;
  cma_valido: number;
  cma_dias_restantes: number | null;
  cma_validade_fim: string | null;
  frms_score: number | null;
  frms_status: 'ok' | 'atencao' | 'critico' | null;
  frms_avaliacao_data: string | null;
  simuladores_pendentes: number | null;
  proximo_simulador_data: string | null;
  status_operacional: StatusOperacional;
  ja_alocado_nesta_escala?: number;
}

const TRIPULANTE_OPERACIONAL_CTE = `
WITH tripulante_operacional AS (
  SELECT
    f.id AS funcionario_id,
    f.nome,
    COALESCE(NULLIF(TRIM(f.guerra), ''), NULL) AS nome_guerra,
    COALESCE(NULLIF(TRIM(f.matricula), ''), CAST(f.id AS TEXT)) AS matricula,
    f.empresa_id,
    COALESCE(NULLIF(TRIM(f.funcao), ''), NULLIF(TRIM(f.cargo), ''), 'tripulante') AS role,
    COALESCE(f.modelo_aeronave_id, '') AS modelo_aeronave_id,
    COALESCE(f.aeronave, '') AS aeronave_legacy,

    CASE WHEN EXISTS (
      SELECT 1
      FROM qualificacoes_historico qh
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
      WHERE qh.funcionario_id = f.id
        AND qh.deleted_at IS NULL
        AND COALESCE(qh.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh.qualificacao_codigo, qt.codigo, '')) = 'CMA'
        AND COALESCE(
          qh.data_vencimento,
          date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')
        ) >= date('now')
    ) THEN 1 ELSE 0 END AS cma_valido,

    CAST((
      JULIANDAY((
        SELECT MAX(COALESCE(
          qh2.data_vencimento,
          date(qh2.data_conclusao, '+' || COALESCE(qh2.validade_meses, qt2.validade, 12) || ' months')
        ))
        FROM qualificacoes_historico qh2
        LEFT JOIN qualificacoes_tipos qt2 ON qt2.id = qh2.qualificacao_id AND qt2.deleted_at IS NULL
        WHERE qh2.funcionario_id = f.id
          AND qh2.deleted_at IS NULL
          AND COALESCE(qh2.status, 'CONCLUIDA') != 'CANCELADA'
          AND UPPER(COALESCE(qh2.qualificacao_codigo, qt2.codigo, '')) = 'CMA'
      )) - JULIANDAY('now')
    ) AS INTEGER) AS cma_dias_restantes,

    (
      SELECT MAX(COALESCE(
        qh3.data_vencimento,
        date(qh3.data_conclusao, '+' || COALESCE(qh3.validade_meses, qt3.validade, 12) || ' months')
      ))
      FROM qualificacoes_historico qh3
      LEFT JOIN qualificacoes_tipos qt3 ON qt3.id = qh3.qualificacao_id AND qt3.deleted_at IS NULL
      WHERE qh3.funcionario_id = f.id
        AND qh3.deleted_at IS NULL
        AND COALESCE(qh3.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh3.qualificacao_codigo, qt3.codigo, '')) = 'CMA'
    ) AS cma_validade_fim,

    (
      WITH base AS (
        SELECT
          COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
          COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
          COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
        FROM frms_jornada
        WHERE tripulante_id = f.id
          AND deleted_at IS NULL
      )
      SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1))
      FROM base
    ) AS frms_score,

    CASE
      WHEN EXISTS (
        SELECT 1
        FROM frms_alerta fa
        WHERE fa.tripulante_id = f.id
          AND fa.deleted_at IS NULL
          AND COALESCE(fa.resolvido, 0) = 0
          AND fa.nivel IN ('CRITICO', 'VIOLACAO')
      ) THEN 'critico'
      WHEN (
        WITH base AS (
          SELECT
            COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
            COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
            COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
          FROM frms_jornada
          WHERE tripulante_id = f.id
            AND deleted_at IS NULL
        )
        SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1))
        FROM base
      ) >= 45 THEN 'atencao'
      ELSE 'ok'
    END AS frms_status,

    (
      SELECT MAX(created_at)
      FROM frms_jornada fj
      WHERE fj.tripulante_id = f.id
        AND fj.deleted_at IS NULL
    ) AS frms_avaliacao_data,

    (
      SELECT COUNT(*)
      FROM sessoes_participantes sp
      JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id
      WHERE sp.funcionario_id = f.id
        AND sp.deleted_at IS NULL
        AND sa.deleted_at IS NULL
        AND UPPER(COALESCE(sa.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA')
        AND date(sa.data) >= date('now')
    ) AS simuladores_pendentes,

    (
      SELECT MIN(sa2.data)
      FROM sessoes_participantes sp2
      JOIN simulador_agendamentos sa2 ON sa2.id = sp2.sessao_id
      WHERE sp2.funcionario_id = f.id
        AND sp2.deleted_at IS NULL
        AND sa2.deleted_at IS NULL
        AND UPPER(COALESCE(sa2.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA')
        AND date(sa2.data) >= date('now')
    ) AS proximo_simulador_data,

    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM qualificacoes_historico qh4
        LEFT JOIN qualificacoes_tipos qt4 ON qt4.id = qh4.qualificacao_id AND qt4.deleted_at IS NULL
        WHERE qh4.funcionario_id = f.id
          AND qh4.deleted_at IS NULL
          AND COALESCE(qh4.status, 'CONCLUIDA') != 'CANCELADA'
          AND UPPER(COALESCE(qh4.qualificacao_codigo, qt4.codigo, '')) = 'CMA'
          AND COALESCE(
            qh4.data_vencimento,
            date(qh4.data_conclusao, '+' || COALESCE(qh4.validade_meses, qt4.validade, 12) || ' months')
          ) >= date('now')
      ) THEN 'BLOQUEADO_CMA'
      WHEN EXISTS (
        SELECT 1
        FROM frms_alerta fa2
        WHERE fa2.tripulante_id = f.id
          AND fa2.deleted_at IS NULL
          AND COALESCE(fa2.resolvido, 0) = 0
          AND fa2.nivel IN ('CRITICO', 'VIOLACAO')
      ) THEN 'BLOQUEADO_FRMS'
      WHEN CAST((
        JULIANDAY((
          SELECT MAX(COALESCE(
            qh5.data_vencimento,
            date(qh5.data_conclusao, '+' || COALESCE(qh5.validade_meses, qt5.validade, 12) || ' months')
          ))
          FROM qualificacoes_historico qh5
          LEFT JOIN qualificacoes_tipos qt5 ON qt5.id = qh5.qualificacao_id AND qt5.deleted_at IS NULL
          WHERE qh5.funcionario_id = f.id
            AND qh5.deleted_at IS NULL
            AND COALESCE(qh5.status, 'CONCLUIDA') != 'CANCELADA'
            AND UPPER(COALESCE(qh5.qualificacao_codigo, qt5.codigo, '')) = 'CMA'
        )) - JULIANDAY('now')
      ) AS INTEGER) <= 30 THEN 'ATENCAO_CMA'
      WHEN EXISTS (
        SELECT 1
        FROM frms_alerta fa3
        WHERE fa3.tripulante_id = f.id
          AND fa3.deleted_at IS NULL
          AND COALESCE(fa3.resolvido, 0) = 0
          AND fa3.nivel = 'ATENCAO'
      ) THEN 'ATENCAO_FRMS'
      ELSE 'APTO'
    END AS status_operacional
  FROM funcionarios f
  WHERE f.deleted_at IS NULL
    AND COALESCE(f.ativo, 1) = 1
)`;

function sqlNormalizeModelo(expr: string): string {
  return `UPPER(REPLACE(REPLACE(COALESCE(${expr}, ''), ' ', ''), '-', ''))`;
}

export async function getFrmsOperationalState(
  db: D1Database,
  funcionarioId: string,
): Promise<{ frms_score: number; frms_status: 'ok' | 'atencao' | 'critico' }> {
  const row = await db
    .prepare(
      `WITH score_base AS (
         SELECT
           COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
           COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
           COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
         FROM frms_jornada
         WHERE tripulante_id = ?
           AND deleted_at IS NULL
       )
       SELECT
         MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1)) AS frms_score,
         CASE
           WHEN EXISTS (
             SELECT 1
             FROM frms_alerta
             WHERE tripulante_id = ?
               AND deleted_at IS NULL
               AND COALESCE(resolvido, 0) = 0
               AND nivel IN ('CRITICO', 'VIOLACAO')
           ) THEN 'critico'
           WHEN MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1)) >= 45 THEN 'atencao'
           ELSE 'ok'
         END AS frms_status
       FROM score_base`,
    )
    .bind(funcionarioId, funcionarioId)
    .first<{ frms_score: number | null; frms_status: 'ok' | 'atencao' | 'critico' }>();

  return {
    frms_score: Number(row?.frms_score || 0),
    frms_status: row?.frms_status || 'ok',
  };
}

function toTripulanteOperacional(
  row: TripulanteOperacionalRow,
  habilitacoes: HabilitacaoModelo[],
): TripulanteOperacional {
  return {
    funcionario_id: String(row.funcionario_id),
    nome: row.nome,
    nome_guerra: row.nome_guerra,
    matricula: row.matricula,
    empresa_id: Number(row.empresa_id),
    role: row.role,
    cma_valido: Boolean(row.cma_valido),
    cma_dias_restantes:
      row.cma_dias_restantes === null || row.cma_dias_restantes === undefined
        ? null
        : Number(row.cma_dias_restantes),
    cma_validade_fim: row.cma_validade_fim,
    frms_score:
      row.frms_score === null || row.frms_score === undefined ? null : Number(row.frms_score),
    frms_status: row.frms_status,
    frms_avaliacao_data: row.frms_avaliacao_data,
    simuladores_pendentes: Number(row.simuladores_pendentes || 0),
    proximo_simulador_data: row.proximo_simulador_data,
    habilitacoes,
    status_operacional: row.status_operacional,
    pode_ser_alocado: ['APTO', 'ATENCAO_CMA', 'ATENCAO_FRMS'].includes(row.status_operacional),
    ja_alocado_nesta_escala: Boolean(row.ja_alocado_nesta_escala),
  };
}

export async function getHabilitacoesBatch(
  db: D1Database,
  ids: string[],
): Promise<Record<string, HabilitacaoModelo[]>> {
  if (ids.length === 0) return {};

  const placeholders = ids.map(() => '?').join(',');
  const rowsAtuais = await db
    .prepare(
      `SELECT DISTINCT
         CAST(fa.funcionario_id AS TEXT) AS funcionario_id,
         'aeronave:' || CAST(a.id AS TEXT) AS modelo_id,
         UPPER(COALESCE(NULLIF(TRIM(a.modelo), ''), NULLIF(TRIM(a.prefixo), ''), NULLIF(TRIM(a.codigo), ''))) AS modelo_codigo
       FROM funcionarios_aeronaves fa
       JOIN aeronaves a ON a.id = fa.aeronave_id
      WHERE CAST(fa.funcionario_id AS TEXT) IN (${placeholders})
        AND fa.deleted_at IS NULL
        AND COALESCE(fa.ativo, 1) = 1
        AND a.deleted_at IS NULL
        AND (fa.data_fim IS NULL OR date(fa.data_fim) >= date('now'))`,
    )
    .bind(...ids)
    .all<{ funcionario_id: string; modelo_id: string; modelo_codigo: string }>();

  const rowsLegado = await db
    .prepare(
      `SELECT DISTINCT
         CAST(f.id AS TEXT) AS funcionario_id,
         CAST(ma.id AS TEXT) AS modelo_id,
         COALESCE(NULLIF(TRIM(ma.codigo), ''), NULLIF(TRIM(ma.modelo), ''), NULLIF(TRIM(ma.nome), '')) AS modelo_codigo
       FROM funcionarios f
       JOIN modelos_aeronave ma
         ON ma.deleted_at IS NULL
        AND (
          instr(',' || REPLACE(COALESCE(f.modelo_aeronave_id, ''), ' ', '') || ',', ',' || CAST(ma.id AS TEXT) || ',') > 0
          OR UPPER(COALESCE(f.modelo_aeronave_id, '')) = UPPER(COALESCE(ma.codigo, ma.modelo, ma.nome, ''))
          OR UPPER(COALESCE(f.aeronave, '')) = UPPER(COALESCE(ma.codigo, ma.modelo, ma.nome, ''))
        )
       WHERE CAST(f.id AS TEXT) IN (${placeholders})
         AND f.deleted_at IS NULL`,
    )
    .bind(...ids)
    .all<{ funcionario_id: string; modelo_id: string; modelo_codigo: string }>();

  const mergedRows = [...(rowsAtuais.results || []), ...(rowsLegado.results || [])];

  return mergedRows.reduce<Record<string, HabilitacaoModelo[]>>((acc, row) => {
    if (!acc[row.funcionario_id]) acc[row.funcionario_id] = [];
    const modeloCodigo = normalizeModeloOperacional(row.modelo_codigo);
    if (!modeloCodigo) return acc;
    const exists = acc[row.funcionario_id].some(
      (item) => item.modelo_codigo === modeloCodigo && item.modelo_id === row.modelo_id,
    );
    if (!exists) {
      acc[row.funcionario_id].push({
        modelo_id: row.modelo_id,
        modelo_codigo: modeloCodigo,
        validade_fim: null,
      });
    }
    return acc;
  }, {});
}

export async function getTripulanteOperacional(
  db: D1Database,
  funcionarioId: string,
  empresaId: number,
): Promise<TripulanteOperacional | null> {
  const row = await db
    .prepare(
      `${TRIPULANTE_OPERACIONAL_CTE}
       SELECT *
       FROM tripulante_operacional
       WHERE empresa_id = ?
         AND funcionario_id = ?`,
    )
    .bind(empresaId, funcionarioId)
    .first<TripulanteOperacionalRow>();

  if (!row) return null;

  const habilitacoes = await getHabilitacoesBatch(db, [funcionarioId]);
  return toTripulanteOperacional(row, habilitacoes[funcionarioId] || []);
}

export async function getTripulantesOperacionaisPorModelo(
  db: D1Database,
  empresaId: number,
  modeloId: string,
  escalaId?: string,
): Promise<TripulanteOperacional[]> {
  const aliases = getModeloAliases(modeloId);
  if (aliases.length === 0) return [];

  const aliasPlaceholders = aliases.map(() => '?').join(',');
  const aeronaveModeloSql = sqlNormalizeModelo('a.modelo');
  const modeloDiretoSql = sqlNormalizeModelo('v.modelo_aeronave_id');
  const modeloCatalogoSql = sqlNormalizeModelo('COALESCE(ma.codigo, ma.modelo, ma.nome)');
  const modeloLegacySql = sqlNormalizeModelo('v.aeronave_legacy');

  const rows = await db
    .prepare(
      `${TRIPULANTE_OPERACIONAL_CTE}
       SELECT
         v.*,
         CASE WHEN ? != '' AND EXISTS (
           SELECT 1
           FROM escala_tripulacoes et
           WHERE et.escala_id = ?
             AND et.deleted_at IS NULL
             AND (et.pic_id = v.funcionario_id OR et.sic_id = v.funcionario_id)
         ) THEN 1
         WHEN ? != '' AND EXISTS (
           SELECT 1
           FROM escala_alocacoes ea
           WHERE ea.escala_id = ?
             AND ea.deleted_at IS NULL
             AND ea.status != 'cancelado'
             AND CAST(ea.funcionario_id AS TEXT) = CAST(v.funcionario_id AS TEXT)
         ) THEN 1 ELSE 0 END AS ja_alocado_nesta_escala
       FROM tripulante_operacional v
       WHERE v.empresa_id = ?
         AND (
           EXISTS (
             SELECT 1
               FROM funcionarios_aeronaves fa
               JOIN aeronaves a ON a.id = fa.aeronave_id
              WHERE CAST(fa.funcionario_id AS TEXT) = CAST(v.funcionario_id AS TEXT)
                AND fa.deleted_at IS NULL
                AND COALESCE(fa.ativo, 1) = 1
                AND a.deleted_at IS NULL
                AND (fa.data_fim IS NULL OR date(fa.data_fim) >= date('now'))
                AND ${aeronaveModeloSql} IN (${aliasPlaceholders})
           )
           OR ${modeloDiretoSql} IN (${aliasPlaceholders})
           OR EXISTS (
             SELECT 1
             FROM modelos_aeronave ma
             WHERE ma.deleted_at IS NULL
               AND (
                 instr(
                   ',' || REPLACE(COALESCE(v.modelo_aeronave_id, ''), ' ', '') || ',',
                   ',' || CAST(ma.id AS TEXT) || ','
                 ) > 0
                 OR ${modeloDiretoSql} = ${modeloCatalogoSql}
               )
               AND ${modeloCatalogoSql} IN (${aliasPlaceholders})
           )
           OR ${modeloLegacySql} IN (${aliasPlaceholders})
           OR (
             COALESCE(TRIM(v.modelo_aeronave_id), '') = ''
             AND COALESCE(TRIM(v.aeronave_legacy), '') = ''
             AND NOT EXISTS (
               SELECT 1 FROM funcionarios_aeronaves fa
               WHERE CAST(fa.funcionario_id AS TEXT) = CAST(v.funcionario_id AS TEXT)
                 AND fa.deleted_at IS NULL
                 AND COALESCE(fa.ativo, 1) = 1
             )
           )
         )
       ORDER BY
         CASE v.status_operacional
           WHEN 'APTO' THEN 0
           WHEN 'ATENCAO_CMA' THEN 1
           WHEN 'ATENCAO_FRMS' THEN 2
           WHEN 'BLOQUEADO_CMA' THEN 3
           WHEN 'BLOQUEADO_FRMS' THEN 4
           ELSE 5
         END,
         v.nome`,
    )
    .bind(
      escalaId || '',
      escalaId || '',
      escalaId || '',
      escalaId || '',
      empresaId,
      ...aliases,
      ...aliases,
      ...aliases,
      ...aliases,
    )
    .all<TripulanteOperacionalRow>();

  const ids = (rows.results || []).map((row) => String(row.funcionario_id));
  const habilitacoes = await getHabilitacoesBatch(db, ids);

  return (rows.results || []).map((row) =>
    toTripulanteOperacional(row, habilitacoes[String(row.funcionario_id)] || []),
  );
}

export async function getTripulantesOperacionaisTodos(
  db: D1Database,
  empresaId: number,
  escalaId?: string,
): Promise<TripulanteOperacional[]> {
  const rows = await db
    .prepare(
      `${TRIPULANTE_OPERACIONAL_CTE}
       SELECT
         v.*,
         CASE WHEN ? != '' AND EXISTS (
           SELECT 1
           FROM escala_tripulacoes et
           WHERE et.escala_id = ?
             AND et.deleted_at IS NULL
             AND (et.pic_id = v.funcionario_id OR et.sic_id = v.funcionario_id)
         ) THEN 1
         WHEN ? != '' AND EXISTS (
           SELECT 1
           FROM escala_alocacoes ea
           WHERE ea.escala_id = ?
             AND ea.deleted_at IS NULL
             AND ea.status != 'cancelado'
             AND CAST(ea.funcionario_id AS TEXT) = CAST(v.funcionario_id AS TEXT)
         ) THEN 1 ELSE 0 END AS ja_alocado_nesta_escala
       FROM tripulante_operacional v
       WHERE v.empresa_id = ?
       ORDER BY
         CASE v.status_operacional
           WHEN 'APTO' THEN 0
           WHEN 'ATENCAO_CMA' THEN 1
           WHEN 'ATENCAO_FRMS' THEN 2
           WHEN 'BLOQUEADO_CMA' THEN 3
           WHEN 'BLOQUEADO_FRMS' THEN 4
           ELSE 5
         END,
         v.nome`,
    )
    .bind(escalaId || '', escalaId || '', escalaId || '', escalaId || '', empresaId)
    .all<TripulanteOperacionalRow>();

  const ids = (rows.results || []).map((row) => String(row.funcionario_id));
  const habilitacoes = await getHabilitacoesBatch(db, ids);

  return (rows.results || []).map((row) =>
    toTripulanteOperacional(row, habilitacoes[String(row.funcionario_id)] || []),
  );
}
