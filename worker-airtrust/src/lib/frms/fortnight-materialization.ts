import { getFrmsFortnightCoverage, type FrmsFortnightCoverageResponse } from './fortnight-coverage';

export const FRMS_FORTNIGHT_MATERIALIZATION_PREVIEW_MAX_WINDOW_DAYS = 31;
export const FRMS_FORTNIGHT_MATERIALIZATION_APPLY_MAX_WINDOW_DAYS = 15;
export const FRMS_FORTNIGHT_MATERIALIZATION_APPLY_MAX_RECORDS = 20;
export const FRMS_FORTNIGHT_MATERIALIZATION_CONFIRM_TOKEN = 'APPLY_FORTNIGHT_BASE';

export interface FrmsFortnightMaterializationParams {
  empresaId: number;
  dataInicio: string;
  dataFim: string;
  origem?: string[];
  status?: string[];
}

type MaterializationScopeRow = {
  fatorizacao_id: string;
  jornada_id: string;
  data_operacional: string;
  funcionario_id: number;
  origem: string | null;
  status_jornada: string | null;
  dia_periodo_embarcado: number | null;
  total_dias_periodo: number | null;
  has_frms_escala_quinzenal: number | null;
  has_escala_alocacoes: number | null;
  has_quinzena_base_ativa: number | null;
  has_ausencia_bloqueante: number | null;
  dia_calculado_quinzena_base: number | null;
  total_calculado_quinzena_base: number | null;
};

interface MaterializationCandidate {
  fatorizacao_id: string;
  jornada_id: string;
  data_operacional: string;
  dia_periodo_embarcado: number;
  total_dias_periodo: number;
}

export interface FrmsFortnightMaterializationSummary {
  total_fatorizacoes_escopo: number;
  ja_materializadas: number;
  pendentes_materializacao: number;
  candidatos_quinzena_base: number;
  bloqueados_por_ausencia: number;
  fora_escopo_outras_fontes: number;
  sem_escala_detectada: number;
}

export interface FrmsFortnightMaterializationPreviewResult {
  periodo: {
    data_inicio: string;
    data_fim: string;
  };
  filtros: {
    empresa_id: number;
    origem: string[];
    status: string[];
  };
  resumo: FrmsFortnightMaterializationSummary;
  atualizaveis: number;
  limite_apply_registros: number;
  coverage: FrmsFortnightCoverageResponse;
  dry_run: true;
  notes: string[];
}

export interface FrmsFortnightMaterializationApplyResult
  extends Omit<FrmsFortnightMaterializationPreviewResult, 'dry_run'> {
  dry_run: false;
  updated: number;
  unchanged_after_guard: number;
  confirm: string;
}

function normalizeUpper(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized || fallback;
}

function diffDaysInclusive(dataInicio: string, dataFim: string): number {
  const start = Date.parse(`${dataInicio}T00:00:00Z`);
  const end = Date.parse(`${dataFim}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }
  return Math.floor((end - start) / 86400000) + 1;
}

function assertWindowLimit(dataInicio: string, dataFim: string, maxDays: number): void {
  const totalDays = diffDaysInclusive(dataInicio, dataFim);
  if (totalDays <= 0 || totalDays > maxDays) {
    throw new Error('FRMS_FORTNIGHT_MATERIALIZATION_INVALID_WINDOW');
  }
}

function buildCandidates(
  rows: MaterializationScopeRow[],
): { summary: FrmsFortnightMaterializationSummary; candidates: MaterializationCandidate[] } {
  const summary: FrmsFortnightMaterializationSummary = {
    total_fatorizacoes_escopo: rows.length,
    ja_materializadas: 0,
    pendentes_materializacao: 0,
    candidatos_quinzena_base: 0,
    bloqueados_por_ausencia: 0,
    fora_escopo_outras_fontes: 0,
    sem_escala_detectada: 0,
  };
  const candidates: MaterializationCandidate[] = [];

  for (const row of rows) {
    if (row.dia_periodo_embarcado != null) {
      summary.ja_materializadas += 1;
      continue;
    }

    summary.pendentes_materializacao += 1;

    if (Number(row.has_escala_alocacoes || 0) > 0 || Number(row.has_frms_escala_quinzenal || 0) > 0) {
      summary.fora_escopo_outras_fontes += 1;
      continue;
    }

    if (Number(row.has_quinzena_base_ativa || 0) > 0 && Number(row.has_ausencia_bloqueante || 0) > 0) {
      summary.bloqueados_por_ausencia += 1;
      continue;
    }

    if (
      Number(row.has_quinzena_base_ativa || 0) > 0 &&
      row.dia_calculado_quinzena_base != null &&
      row.total_calculado_quinzena_base != null &&
      row.dia_calculado_quinzena_base > 0 &&
      row.total_calculado_quinzena_base > 0 &&
      row.dia_calculado_quinzena_base <= row.total_calculado_quinzena_base
    ) {
      summary.candidatos_quinzena_base += 1;
      candidates.push({
        fatorizacao_id: row.fatorizacao_id,
        jornada_id: row.jornada_id,
        data_operacional: row.data_operacional,
        dia_periodo_embarcado: Number(row.dia_calculado_quinzena_base),
        total_dias_periodo: Number(row.total_calculado_quinzena_base),
      });
      continue;
    }

    summary.sem_escala_detectada += 1;
  }

  return { summary, candidates };
}

async function loadMaterializationScopeRows(
  db: D1Database,
  params: FrmsFortnightMaterializationParams,
): Promise<MaterializationScopeRow[]> {
  const whereClauses = [
    'fj.deleted_at IS NULL',
    'j.deleted_at IS NULL',
    'COALESCE(j.empresa_id, f.empresa_id) = ?',
    'j.data >= ?',
    'j.data <= ?',
  ];
  const bindParams: Array<string | number> = [params.empresaId, params.dataInicio, params.dataFim];

  if (params.origem && params.origem.length > 0) {
    whereClauses.push(
      `UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'SEM_ORIGEM')) IN (${params.origem.map(() => '?').join(',')})`,
    );
    bindParams.push(...params.origem);
  }

  if (params.status && params.status.length > 0) {
    whereClauses.push(
      `UPPER(COALESCE(NULLIF(TRIM(j.status), ''), 'SEM_STATUS')) IN (${params.status.map(() => '?').join(',')})`,
    );
    bindParams.push(...params.status);
  }

  const query = `
    SELECT
      fj.id AS fatorizacao_id,
      j.id AS jornada_id,
      j.data AS data_operacional,
      CAST(j.tripulante_id AS INTEGER) AS funcionario_id,
      j.origem,
      j.status AS status_jornada,
      fj.dia_periodo_embarcado,
      fj.total_dias_periodo,
      CASE
        WHEN EXISTS (
          SELECT 1
            FROM frms_escala_quinzenal eq
           WHERE CAST(eq.tripulante_id AS TEXT) = CAST(j.tripulante_id AS TEXT)
             AND eq.deleted_at IS NULL
             AND j.data >= eq.data_inicio_embarque
             AND j.data <= eq.data_fim_embarque
        )
        THEN 1 ELSE 0
      END AS has_frms_escala_quinzenal,
      CASE
        WHEN EXISTS (
          SELECT 1
            FROM escala_alocacoes ea
           WHERE CAST(ea.funcionario_id AS TEXT) = CAST(j.tripulante_id AS TEXT)
             AND ea.data_inicio <= j.data
             AND ea.data_fim >= j.data
             AND ea.deleted_at IS NULL
             AND ea.status != 'cancelado'
             AND (
               ea.aeronave_id IS NOT NULL
               OR ea.quinzena_id IS NOT NULL
               OR (ea.situacao_tipo IS NOT NULL AND UPPER(ea.situacao_tipo) != 'FOLGA')
             )
        )
        THEN 1 ELSE 0
      END AS has_escala_alocacoes,
      CASE WHEN eqb.id IS NOT NULL THEN 1 ELSE 0 END AS has_quinzena_base_ativa,
      CASE
        WHEN EXISTS (
          SELECT 1
            FROM escala_alocacoes eab
           WHERE CAST(eab.funcionario_id AS TEXT) = CAST(j.tripulante_id AS TEXT)
             AND eab.data_inicio <= j.data
             AND eab.data_fim >= j.data
             AND eab.deleted_at IS NULL
             AND eab.status != 'cancelado'
             AND UPPER(COALESCE(eab.situacao_tipo, '')) IN ('FOLGA', 'FERIAS', 'AFT')
        )
        THEN 1 ELSE 0
      END AS has_ausencia_bloqueante,
      CASE
        WHEN eqb.id IS NOT NULL THEN CAST(julianday(j.data) - julianday(eqb.data_inicio) + 1 AS INTEGER)
        ELSE NULL
      END AS dia_calculado_quinzena_base,
      CASE
        WHEN eqb.id IS NOT NULL THEN CAST(julianday(eqb.data_fim) - julianday(eqb.data_inicio) + 1 AS INTEGER)
        ELSE NULL
      END AS total_calculado_quinzena_base
    FROM frms_fatorizacao_jornada fj
    JOIN frms_jornada j
      ON j.id = fj.jornada_id
    LEFT JOIN funcionarios f
      ON f.id = CAST(j.tripulante_id AS INTEGER)
    LEFT JOIN escalas_quinzenas eqb
      ON eqb.empresa_id = f.empresa_id
     AND eqb.ano = CAST(strftime('%Y', j.data) AS INTEGER)
     AND eqb.mes = CAST(strftime('%m', j.data) AS INTEGER)
     AND eqb.deleted_at IS NULL
     AND eqb.numero = CASE
       WHEN LOWER(TRIM(COALESCE(f.quinzena, ''))) IN ('primeira', '1', '1q', '1ª', '1a', 'primeira quinzena') THEN 1
       WHEN LOWER(TRIM(COALESCE(f.quinzena, ''))) IN ('segunda', '2', '2q', '2ª', '2a', 'segunda quinzena') THEN 2
       ELSE NULL
     END
     AND eqb.data_inicio <= j.data
     AND eqb.data_fim >= j.data
    WHERE ${whereClauses.join('\n      AND ')}
    ORDER BY j.data ASC, CAST(j.tripulante_id AS INTEGER) ASC, fj.id ASC
  `;

  const result = await db.prepare(query).bind(...bindParams).all<MaterializationScopeRow>();
  return result.results || [];
}

export async function previewFortnightBaseMaterialization(
  db: D1Database,
  params: FrmsFortnightMaterializationParams,
): Promise<FrmsFortnightMaterializationPreviewResult> {
  assertWindowLimit(
    params.dataInicio,
    params.dataFim,
    FRMS_FORTNIGHT_MATERIALIZATION_PREVIEW_MAX_WINDOW_DAYS,
  );

  const [coverage, rows] = await Promise.all([
    getFrmsFortnightCoverage(db, params),
    loadMaterializationScopeRows(db, params),
  ]);
  const { summary, candidates } = buildCandidates(rows);

  return {
    periodo: {
      data_inicio: params.dataInicio,
      data_fim: params.dataFim,
    },
    filtros: {
      empresa_id: params.empresaId,
      origem: params.origem ?? [],
      status: params.status ?? [],
    },
    resumo: summary,
    atualizaveis: candidates.length,
    limite_apply_registros: FRMS_FORTNIGHT_MATERIALIZATION_APPLY_MAX_RECORDS,
    coverage,
    dry_run: true,
    notes: [
      'Preview read-only; nao executa escrita em frms_fatorizacao_jornada.',
      'Apply so pode preencher dia_periodo_embarcado e total_dias_periodo quando ambos forem derivados da quinzena base ativa.',
      'Registros com escala_alocacoes, frms_escala_quinzenal, ausencia bloqueante ou sem escala detectada ficam fora do apply.',
    ],
  };
}

export async function applyFortnightBaseMaterialization(
  db: D1Database,
  params: FrmsFortnightMaterializationParams,
): Promise<FrmsFortnightMaterializationApplyResult> {
  assertWindowLimit(
    params.dataInicio,
    params.dataFim,
    FRMS_FORTNIGHT_MATERIALIZATION_APPLY_MAX_WINDOW_DAYS,
  );

  const preview = await previewFortnightBaseMaterialization(db, params);
  if (preview.atualizaveis > FRMS_FORTNIGHT_MATERIALIZATION_APPLY_MAX_RECORDS) {
    throw new Error('FRMS_FORTNIGHT_MATERIALIZATION_TOO_MANY_RECORDS');
  }

  const rows = await loadMaterializationScopeRows(db, params);
  const { candidates } = buildCandidates(rows);
  if (candidates.length > FRMS_FORTNIGHT_MATERIALIZATION_APPLY_MAX_RECORDS) {
    throw new Error('FRMS_FORTNIGHT_MATERIALIZATION_TOO_MANY_RECORDS');
  }
  const timestamp = new Date().toISOString();
  let updated = 0;

  for (const candidate of candidates) {
    const result = await db
      .prepare(
        `UPDATE frms_fatorizacao_jornada
            SET dia_periodo_embarcado = ?,
                total_dias_periodo = ?,
                updated_at = ?
          WHERE id = ?
            AND jornada_id = ?
            AND deleted_at IS NULL
            AND dia_periodo_embarcado IS NULL
            AND EXISTS (
              SELECT 1
                FROM frms_jornada j
                LEFT JOIN funcionarios f
                  ON f.id = CAST(j.tripulante_id AS INTEGER)
               WHERE j.id = frms_fatorizacao_jornada.jornada_id
                 AND j.deleted_at IS NULL
                 AND COALESCE(j.empresa_id, f.empresa_id) = ?
                 AND j.data >= ?
                 AND j.data <= ?
            )`,
      )
      .bind(
        candidate.dia_periodo_embarcado,
        candidate.total_dias_periodo,
        timestamp,
        candidate.fatorizacao_id,
        candidate.jornada_id,
        params.empresaId,
        params.dataInicio,
        params.dataFim,
      )
      .run<{ changes?: number }>();

    const changeCount = Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
    updated += changeCount > 0 ? changeCount : 0;
  }

  return {
    ...preview,
    dry_run: false,
    updated,
    unchanged_after_guard: Math.max(candidates.length - updated, 0),
    confirm: FRMS_FORTNIGHT_MATERIALIZATION_CONFIRM_TOKEN,
  };
}

export function normalizeFortnightMaterializationFilters(
  value: string | null | undefined,
  fallback: string,
): string[] {
  const normalized = String(value ?? '')
    .split(',')
    .map((item) => normalizeUpper(item, ''))
    .filter(Boolean);
  if (normalized.length === 0) return [fallback];
  return [...new Set(normalized)];
}
