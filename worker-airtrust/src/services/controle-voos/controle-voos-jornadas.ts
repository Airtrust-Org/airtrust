import type { D1Database } from '@cloudflare/workers-types';

export type ControleVoosJornadaOrigemDados =
  | 'importado'
  | 'manual_interno'
  | 'editado_airtrust';

export type ControleVoosJornadaQualidadeDado =
  | 'completo'
  | 'incompleto'
  | 'pendente_mapeamento'
  | 'divergente';

export type ControleVoosJornadaEstadoConflito =
  | 'pendente_mapeamento'
  | 'divergente'
  | 'incompleto'
  | 'erro'
  | null;

export interface ControleVoosJornadaItem {
  jornada_id: string;
  voo_id: number;
  etapa_id: number | null;
  external_id_sigvoos: number | null;
  sigvoos_leg_number: number | null;
  data_operacional: string;
  tripulante_id: number;
  nome: string | null;
  funcao: string;
  funcao_origem: string | null;
  aeronave: string | null;
  origem_icao: string | null;
  destino_icao: string | null;
  engine_start: string | null;
  takeoff_time: string | null;
  landing_time: string | null;
  engine_shutoff: string | null;
  tempo_total: string | null;
  tempo_navegacao: string | null;
  tempo_ifr: string | null;
  tempo_noturno: string | null;
  pousos_diurnos: number | null;
  pousos_noturnos: number | null;
  starts: number | null;
  pax: number | null;
  fuel_start: number | null;
  fuel_end: number | null;
  origem_dados: ControleVoosJornadaOrigemDados;
  qualidade_dado: ControleVoosJornadaQualidadeDado;
  estado_conflito: ControleVoosJornadaEstadoConflito;
  evidencia: string | null;
  last_sync_at: string | null;
}

export interface ListControleVoosJornadasOptions {
  dataInicio: string;
  dataFim: string;
}

export interface ListControleVoosJornadasResult {
  periodo: {
    data_inicio: string;
    data_fim: string;
  };
  total: number;
  items: ControleVoosJornadaItem[];
}

type JornadaRow = {
  tripulante_record_id: number;
  voo_id: number;
  etapa_id: number | null;
  external_id_sigvoos: number | null;
  sigvoos_leg_number: number | null;
  data_operacional: string;
  tripulante_id: number;
  nome: string | null;
  funcao: string;
  funcao_origem: string | null;
  aeronave: string | null;
  origem_icao: string | null;
  destino_icao: string | null;
  engine_start: string | null;
  takeoff_time: string | null;
  landing_time: string | null;
  engine_shutoff: string | null;
  tempo_total: string | null;
  tempo_navegacao: string | null;
  tempo_ifr: string | null;
  tempo_noturno: string | null;
  pousos_diurnos: number | null;
  pousos_noturnos: number | null;
  starts: number | null;
  pax: number | null;
  fuel_start: number | null;
  fuel_end: number | null;
  origem_importacao: string | null;
  etapa_origem_dados: string | null;
  campos_editados_json: string | null;
  metadata_sigvoos_json: string | null;
  open_conflict_campo: string | null;
  open_conflict_justificativa: string | null;
  staging_import_status: string | null;
  staging_erro_msg: string | null;
  last_sync_at: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeTime(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const hhmm = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!hhmm) return null;
  return `${String(Number(hhmm[1])).padStart(2, '0')}:${hhmm[2]}`;
}

function extractLegFallback(metadataJson: string | null): {
  tempo_ifr: string | null;
  tempo_noturno: string | null;
  pousos_diurnos: number | null;
  pousos_noturnos: number | null;
  starts: number | null;
  pax: number | null;
  fuel_start: number | null;
  fuel_end: number | null;
} {
  if (!metadataJson) {
    return {
      tempo_ifr: null,
      tempo_noturno: null,
      pousos_diurnos: null,
      pousos_noturnos: null,
      starts: null,
      pax: null,
      fuel_start: null,
      fuel_end: null,
    };
  }

  try {
    const raw = JSON.parse(metadataJson) as unknown;
    const record = asRecord(raw);
    const leg = asRecord(record?.flight_report_leg);
    return {
      tempo_ifr: normalizeTime(leg?.ifr_time_str),
      tempo_noturno: normalizeTime(leg?.night_time_str),
      pousos_diurnos: parseInteger(leg?.day_landings),
      pousos_noturnos: parseInteger(leg?.night_landings),
      starts: parseInteger(leg?.starts),
      pax: parseInteger(leg?.pax),
      fuel_start: parseNumber(leg?.fuel_start),
      fuel_end: parseNumber(leg?.fuel_end),
    };
  } catch {
    return {
      tempo_ifr: null,
      tempo_noturno: null,
      pousos_diurnos: null,
      pousos_noturnos: null,
      starts: null,
      pax: null,
      fuel_start: null,
      fuel_end: null,
    };
  }
}

function resolveOrigemDados(row: JornadaRow): ControleVoosJornadaOrigemDados {
  if (row.campos_editados_json && row.campos_editados_json.trim().length > 0) {
    return 'editado_airtrust';
  }
  if (row.origem_importacao === 'SIGVOOS' || row.etapa_origem_dados === 'SIGVOOS') {
    return 'importado';
  }
  if (row.external_id_sigvoos != null || row.etapa_origem_dados === 'SIGVOOS') {
    return 'importado';
  }
  return 'manual_interno';
}

function resolveEstadoConflito(row: JornadaRow): ControleVoosJornadaEstadoConflito {
  if (row.staging_import_status === 'ERROR') return 'erro';
  if (
    row.staging_import_status === 'CONFLICT' ||
    row.open_conflict_campo === 'funcionario_id'
  ) {
    return 'pendente_mapeamento';
  }
  if (row.open_conflict_campo) return 'divergente';
  return null;
}

function resolveQualidadeDado(
  row: JornadaRow,
  estadoConflito: ControleVoosJornadaEstadoConflito,
): ControleVoosJornadaQualidadeDado {
  if (estadoConflito === 'pendente_mapeamento') return 'pendente_mapeamento';
  if (estadoConflito === 'divergente') return 'divergente';

  const hasRoute = Boolean(row.origem_icao && row.destino_icao);
  const hasTimes = Boolean(row.engine_start || row.takeoff_time || row.landing_time || row.engine_shutoff);
  const hasCrew = Boolean(row.tripulante_id && row.nome);

  if (!hasRoute || !hasTimes || !hasCrew) return 'incompleto';
  return 'completo';
}

function buildJornadaId(vooId: number, etapaId: number | null, tripulanteRecordId: number): string {
  return `v${vooId}-e${etapaId ?? 0}-t${tripulanteRecordId}`;
}

function mapRow(row: JornadaRow): ControleVoosJornadaItem {
  const fallback = extractLegFallback(row.metadata_sigvoos_json);
  const estadoConflito = resolveEstadoConflito(row);
  const qualidadeDado = resolveQualidadeDado(row, estadoConflito);

  return {
    jornada_id: buildJornadaId(row.voo_id, row.etapa_id, row.tripulante_record_id),
    voo_id: row.voo_id,
    etapa_id: row.etapa_id,
    external_id_sigvoos: row.external_id_sigvoos,
    sigvoos_leg_number: row.sigvoos_leg_number,
    data_operacional: row.data_operacional,
    tripulante_id: row.tripulante_id,
    nome: row.nome,
    funcao: row.funcao,
    funcao_origem: row.funcao_origem,
    aeronave: row.aeronave,
    origem_icao: row.origem_icao,
    destino_icao: row.destino_icao,
    engine_start: row.engine_start,
    takeoff_time: row.takeoff_time,
    landing_time: row.landing_time,
    engine_shutoff: row.engine_shutoff,
    tempo_total: row.tempo_total,
    tempo_navegacao: row.tempo_navegacao,
    tempo_ifr: row.tempo_ifr ?? fallback.tempo_ifr,
    tempo_noturno: row.tempo_noturno ?? fallback.tempo_noturno,
    pousos_diurnos: row.pousos_diurnos ?? fallback.pousos_diurnos,
    pousos_noturnos: row.pousos_noturnos ?? fallback.pousos_noturnos,
    starts: row.starts ?? fallback.starts,
    pax: row.pax ?? fallback.pax,
    fuel_start: row.fuel_start ?? fallback.fuel_start,
    fuel_end: row.fuel_end ?? fallback.fuel_end,
    origem_dados: resolveOrigemDados(row),
    qualidade_dado: qualidadeDado,
    estado_conflito: estadoConflito,
    evidencia: row.open_conflict_justificativa || row.staging_erro_msg || null,
    last_sync_at: row.last_sync_at,
  };
}

export async function listControleVoosJornadas(
  db: D1Database,
  empresaId: number,
  options: ListControleVoosJornadasOptions,
): Promise<ListControleVoosJornadasResult> {
  const { results } = await db
    .prepare(
      `
      SELECT
        t.id AS tripulante_record_id,
        v.id AS voo_id,
        e.id AS etapa_id,
        v.sigvoos_flight_report_id AS external_id_sigvoos,
        e.sigvoos_leg_number AS sigvoos_leg_number,
        v.data_programacao AS data_operacional,
        t.funcionario_id AS tripulante_id,
        f.nome AS nome,
        t.funcao AS funcao,
        t.funcao_origem AS funcao_origem,
        COALESCE(v.prefixo, v.sigvoos_flight_number) AS aeronave,
        COALESCE(e.origem_icao, ao.codigo_icao, ao.codigo) AS origem_icao,
        COALESCE(e.destino_icao, ad.codigo_icao, ad.codigo) AS destino_icao,
        e.horario_motor_ligado AS engine_start,
        e.horario_decolagem AS takeoff_time,
        e.horario_pouso AS landing_time,
        e.horario_motor_desligado AS engine_shutoff,
        e.tempo_total AS tempo_total,
        e.tempo_navegacao AS tempo_navegacao,
        e.tempo_ifr AS tempo_ifr,
        e.tempo_noturno AS tempo_noturno,
        e.pousos_diurnos AS pousos_diurnos,
        e.pousos_noturnos AS pousos_noturnos,
        e.starts AS starts,
        e.pax AS pax,
        e.combustivel_inicio AS fuel_start,
        e.combustivel_fim AS fuel_end,
        v.origem_importacao AS origem_importacao,
        e.origem_dados AS etapa_origem_dados,
        v.campos_editados_json AS campos_editados_json,
        e.metadata_sigvoos_json AS metadata_sigvoos_json,
        c.campo AS open_conflict_campo,
        c.justificativa AS open_conflict_justificativa,
        s.import_status AS staging_import_status,
        s.erro_msg AS staging_erro_msg,
        COALESCE(v.sigvoos_importado_em, e.sigvoos_importado_em, s.processado_em) AS last_sync_at
      FROM cv_voo_tripulantes t
      INNER JOIN cv_voos v
        ON v.id = t.voo_id
       AND v.empresa_id = t.empresa_id
       AND v.deleted_at IS NULL
      LEFT JOIN cv_voo_etapas e
        ON e.id = t.etapa_id
       AND e.empresa_id = t.empresa_id
       AND e.deleted_at IS NULL
      LEFT JOIN cv_aeroportos ao
        ON ao.id = v.origem_id
       AND ao.empresa_id = v.empresa_id
       AND ao.deleted_at IS NULL
      LEFT JOIN cv_aeroportos ad
        ON ad.id = v.destino_id
       AND ad.empresa_id = v.empresa_id
       AND ad.deleted_at IS NULL
      LEFT JOIN funcionarios f
        ON f.id = t.funcionario_id
       AND f.empresa_id = t.empresa_id
       AND f.deleted_at IS NULL
      LEFT JOIN cv_conflitos_integracao c
        ON c.empresa_id = t.empresa_id
       AND c.status = 'ABERTO'
       AND c.deleted_at IS NULL
       AND (
         (c.entidade_tipo = 'tripulante' AND c.entidade_id = t.id)
         OR (c.entidade_tipo = 'voo' AND c.entidade_id = v.id)
         OR (c.entidade_tipo = 'etapa' AND e.id IS NOT NULL AND c.entidade_id = e.id)
       )
      LEFT JOIN cv_sigvoos_staging s
        ON s.empresa_id = t.empresa_id
       AND s.deleted_at IS NULL
       AND s.cv_tripulante_id = t.id
      WHERE t.empresa_id = ?
        AND t.deleted_at IS NULL
        AND v.data_programacao >= ?
        AND v.data_programacao <= ?
      ORDER BY v.data_programacao ASC, v.id ASC, COALESCE(e.numero_etapa, 0) ASC, t.id ASC
    `,
    )
    .bind(empresaId, options.dataInicio, options.dataFim)
    .all<JornadaRow>();

  const items = (results || []).map(mapRow);

  return {
    periodo: {
      data_inicio: options.dataInicio,
      data_fim: options.dataFim,
    },
    total: items.length,
    items,
  };
}
