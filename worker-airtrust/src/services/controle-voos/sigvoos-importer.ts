import type { D1Database } from '@cloudflare/workers-types';

type SigvoosRecord = Record<string, unknown>;
type SigvoosPayload =
  | SigvoosRecord
  | SigvoosRecord[]
  | {
      items?: SigvoosRecord[];
      records?: SigvoosRecord[];
      results?: SigvoosRecord[];
      variants?: SigvoosRecord[];
    };

type TripulanteResolutionSource = 'STAFF_ID' | 'STAFF_INSCRIPTION';

type RoleCode = 'PIC' | 'SIC' | 'COM' | 'MEC' | 'OUTRO';

interface SigvoosImporterRecord {
  raw: SigvoosRecord;
  payloadHash: string;
  payloadSanitizedJson: string;
  flightIdentityHash: string;
  etapaIdentityHash: string;
  date: string;
  flightReportId: number | null;
  reportNumber: string | null;
  flightNumber: string | null;
  clientName: string | null;
  contractName: string | null;
  aircraftRegistration: string | null;
  legNumber: number | null;
  origemIcao: string | null;
  destinoIcao: string | null;
  horaMotorLigado: string | null;
  horaDecolagem: string | null;
  horaPouso: string | null;
  horaMotorDesligado: string | null;
  tempoIfr: string | null;
  tempoNoturno: string | null;
  pousosDiurnos: number | null;
  pousosNoturnos: number | null;
  starts: number | null;
  pax: number | null;
  fuelStart: number | null;
  fuelEnd: number | null;
  staffId: number | null;
  staffName: string | null;
  staffInscriptionRaw: string | null;
  staffInscriptionNormalized: string | null;
  staffRoleRaw: string | null;
  tripulanteFuncao: RoleCode;
}

interface ExistingStageRow {
  id: string;
  import_status: string;
  cv_voo_id: number | null;
  cv_etapa_id: number | null;
  cv_tripulante_id: number | null;
}

interface ExistingFlightRow {
  id: number;
  origem_importacao: string | null;
  sigvoos_flight_report_id: number | null;
}

interface ExistingEtapaRow {
  id: number;
}

interface ExistingTripulanteRow {
  id: number;
}

interface ResolvedTripulante {
  funcionarioId: number;
  fonteResolucao: TripulanteResolutionSource;
}

interface TripulanteConflict {
  justificativa: string;
  valorSigvoos: SigvoosRecord;
}

interface FuncionarioLookup {
  id: number;
  nome: string | null;
  matricula: string | null;
}

interface CatalogCache {
  aeroportos: Map<string, number>;
  defaultTipoVooId: number;
  defaultNaturezaVooId: number;
}

export interface ImportSigvoosPayloadOptions {
  sourceWindowStart?: string;
  sourceWindowEnd?: string;
  actorUserId?: number | null;
}

export interface ImportSigvoosPayloadItemResult {
  stageId: string;
  payloadHash: string;
  status: 'PROCESSED' | 'CONFLICT' | 'REUSED';
  reused: boolean;
  flightId: number | null;
  etapaId: number | null;
  tripulanteId: number | null;
  conflictId: number | null;
}

export interface ImportSigvoosPayloadSummary {
  totalRecords: number;
  processedRecords: number;
  conflictRecords: number;
  reusedRecords: number;
  createdFlights: number;
  updatedFlights: number;
  createdEtapas: number;
  updatedEtapas: number;
  createdTripulantes: number;
  updatedTripulantes: number;
  createdConflicts: number;
  results: ImportSigvoosPayloadItemResult[];
}

type ResolveTripulanteResult =
  | { status: 'RESOLVED'; resolution: ResolvedTripulante }
  | { status: 'CONFLICT'; conflict: TripulanteConflict };

function asRecord(value: unknown): SigvoosRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as SigvoosRecord) : null;
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeUpper(value: unknown): string | null {
  const text = normalizeText(value);
  return text ? text.toUpperCase() : null;
}

function normalizeIcao(value: unknown): string | null {
  const text = normalizeUpper(value);
  return text ? text.replace(/\s+/g, '') : null;
}

export function normalizeSigvoosStaffInscription(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  return digits.length > 5 ? digits.slice(-5) : digits.padStart(5, '0');
}

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTime(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  const hhmm = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!hhmm) return null;
  return `${String(Number(hhmm[1])).padStart(2, '0')}:${hhmm[2]}`;
}

function toTimestamp(date: string | null, time: string | null): string | null {
  if (!date || !time) return null;
  return `${date}T${time}:00`;
}

function hhmmToMinutes(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToHhmm(value: number | null): string | null {
  if (value == null || value < 0) return null;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function computeDuration(start: string | null, end: string | null): string | null {
  const startMinutes = hhmmToMinutes(start);
  const endMinutes = hhmmToMinutes(end);
  if (startMinutes == null || endMinutes == null || endMinutes < startMinutes) return null;
  return minutesToHhmm(endMinutes - startMinutes);
}

function mapRole(value: unknown): RoleCode {
  const normalized = normalizeUpper(value);
  if (!normalized) return 'OUTRO';
  if (/(?:^|[^A-Z])(CP|COPILOTO|COPILOT|SIC)(?:$|[^A-Z])/.test(normalized)) return 'SIC';
  if (/(?:^|[^A-Z])(COMISSARIO|COMISSARIA|CABIN|COM)(?:$|[^A-Z])/.test(normalized)) return 'COM';
  if (/(?:^|[^A-Z])(MEC|MECANICO|MECHANIC)(?:$|[^A-Z])/.test(normalized)) return 'MEC';
  if (/(?:^|[^A-Z])(CMD|COMMANDER|CAPITAO|PILOTO|PIC)(?:$|[^A-Z])/.test(normalized)) return 'PIC';
  return 'OUTRO';
}

function pickFirstString(record: SigvoosRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}

function extractDate(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function sortedObjectEntries(value: SigvoosRecord): Array<[string, unknown]> {
  return Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
}

export function sanitizeSigvoosPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSigvoosPayload(entry));
  }

  const record = asRecord(value);
  if (!record) return value;

  return Object.fromEntries(
    sortedObjectEntries(record)
      .filter(([key]) => !/(token|secret|password|credential)/i.test(key))
      .map(([key, entryValue]) => [key, sanitizeSigvoosPayload(entryValue)]),
  );
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashSanitizedSigvoosPayload(value: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(sanitizeSigvoosPayload(value)));
}

async function hashJson(value: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(value));
}

function extractRecords(payload: SigvoosPayload): SigvoosRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is SigvoosRecord => Boolean(asRecord(entry)));
  }

  const record = asRecord(payload);
  if (!record) return [];

  for (const key of ['variants', 'items', 'records', 'results'] as const) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((entry): entry is SigvoosRecord => Boolean(asRecord(entry)));
    }
  }

  return [record];
}

async function normalizeSigvoosImporterRecord(raw: SigvoosRecord): Promise<SigvoosImporterRecord> {
  const staff = asRecord(raw.staff);
  const flightReport = asRecord(raw.flight_report);
  const leg = asRecord(raw.flight_report_leg);
  const departureLocation = asRecord(leg?.departure_location);
  const arrivalLocation = asRecord(leg?.arrival_location);
  const date =
    extractDate(raw.date) ||
    extractDate(raw.data) ||
    extractDate(raw.data_voo) ||
    extractDate(raw.partida_prevista) ||
    extractDate(raw.partida_real);

  if (!date) {
    throw new Error('SIGVOOS_IMPORT_INVALID_DATE');
  }

  const payloadSanitized = sanitizeSigvoosPayload(raw);
  const payloadSanitizedJson = JSON.stringify(payloadSanitized);
  const payloadHash = await sha256Hex(payloadSanitizedJson);

  const aircraftRegistration = normalizeUpper(
    asRecord(flightReport?.aircraft)?.registration || raw.aircraft_registration || raw.matricula_aeronave,
  );
  const clientName =
    normalizeText(asRecord(flightReport?.client)?.name) ||
    normalizeText(flightReport?.client_name) ||
    pickFirstString(raw, ['client_name', 'cliente']);
  const contractName =
    normalizeText(asRecord(flightReport?.contract)?.name) ||
    normalizeText(flightReport?.contract_name) ||
    pickFirstString(raw, ['contract_name', 'contrato']);
  const reportNumber = normalizeText(flightReport?.report_number) || pickFirstString(raw, ['report_number']);
  const flightNumber =
    normalizeUpper(flightReport?.flight_number) ||
    normalizeUpper(raw.flight_number) ||
    normalizeUpper(raw.numero_voo) ||
    reportNumber;
  const origemIcao =
    normalizeIcao(departureLocation?.icao_code) ||
    normalizeIcao(raw.origem_icao) ||
    normalizeIcao(raw.origem);
  const destinoIcao =
    normalizeIcao(arrivalLocation?.icao_code) ||
    normalizeIcao(raw.destino_icao) ||
    normalizeIcao(raw.destino);
  const horaMotorLigado = normalizeTime(leg?.engine_start_time_str) || normalizeTime(raw.engine_start_time_str);
  const horaDecolagem = normalizeTime(leg?.takeoff_time_str) || normalizeTime(raw.takeoff_time_str);
  const horaPouso = normalizeTime(leg?.landing_time_str) || normalizeTime(raw.landing_time_str);
  const horaMotorDesligado =
    normalizeTime(leg?.engine_shutoff_time_str) || normalizeTime(raw.engine_shutoff_time_str);
  const tempoIfr = normalizeTime(leg?.ifr_time_str) || normalizeTime(raw.ifr_time_str);
  const tempoNoturno = normalizeTime(leg?.night_time_str) || normalizeTime(raw.night_time_str);
  const pousosDiurnos = parseInteger(leg?.day_landings ?? raw.day_landings);
  const pousosNoturnos = parseInteger(leg?.night_landings ?? raw.night_landings);
  const starts = parseInteger(leg?.starts ?? raw.starts);
  const pax = parseInteger(leg?.pax ?? raw.pax);
  const fuelStart = parseNumber(leg?.fuel_start ?? raw.fuel_start);
  const fuelEnd = parseNumber(leg?.fuel_end ?? raw.fuel_end);
  const legNumber = parseInteger(leg?.number);
  const staffRoleRaw =
    normalizeText(staff?.role) ||
    normalizeText(staff?.function) ||
    pickFirstString(raw, ['role', 'funcao', 'crew_role']);
  const staffInscriptionRaw =
    normalizeText(staff?.inscription) ||
    pickFirstString(raw, ['inscription', 'staff_inscription', 'matricula', 'employee_code', 'crew_code']);

  const flightIdentityHash = await hashJson({
    aircraftRegistration,
    clientName,
    contractName,
    date,
    flightNumber,
    reportNumber,
  });

  const etapaIdentityHash = await hashJson({
    date,
    destinoIcao,
    flightIdentityHash,
    horaDecolagem,
    horaMotorDesligado,
    horaMotorLigado,
    horaPouso,
    legNumber,
    origemIcao,
  });

  return {
    raw,
    payloadHash,
    payloadSanitizedJson,
    flightIdentityHash,
    etapaIdentityHash,
    date,
    flightReportId: parseInteger(flightReport?.id),
    reportNumber,
    flightNumber,
    clientName,
    contractName,
    aircraftRegistration,
    legNumber,
    origemIcao,
    destinoIcao,
    horaMotorLigado,
    horaDecolagem,
    horaPouso,
    horaMotorDesligado,
    tempoIfr,
    tempoNoturno,
    pousosDiurnos,
    pousosNoturnos,
    starts,
    pax,
    fuelStart,
    fuelEnd,
    staffId: parseInteger(staff?.id),
    staffName: normalizeText(staff?.name) || pickFirstString(raw, ['tripulante_nome', 'crew_name', 'nome']),
    staffInscriptionRaw,
    staffInscriptionNormalized: normalizeSigvoosStaffInscription(staffInscriptionRaw),
    staffRoleRaw,
    tripulanteFuncao: mapRole(staffRoleRaw),
  };
}

async function loadCatalogCache(db: D1Database, empresaId: number): Promise<CatalogCache> {
  const aeroportosRows = await db
    .prepare(
      `SELECT id, codigo, codigo_icao
         FROM cv_aeroportos
        WHERE empresa_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(empresaId)
    .all<{ id: number; codigo?: string | null; codigo_icao?: string | null }>();

  const aeroportos = new Map<string, number>();
  for (const row of aeroportosRows.results || []) {
    const codigo = normalizeIcao(row.codigo);
    const codigoIcao = normalizeIcao(row.codigo_icao);
    if (codigo) aeroportos.set(codigo, Number(row.id));
    if (codigoIcao) aeroportos.set(codigoIcao, Number(row.id));
  }

  const tipo = await db
    .prepare(
      `SELECT id
         FROM cv_tipos_voo
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND ativo = 1
        ORDER BY ordem ASC, id ASC
        LIMIT 1`,
    )
    .bind(empresaId)
    .first<{ id: number }>();

  const natureza = await db
    .prepare(
      `SELECT id
         FROM cv_naturezas_voo
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND ativo = 1
        ORDER BY ordem ASC, id ASC
        LIMIT 1`,
    )
    .bind(empresaId)
    .first<{ id: number }>();

  if (!tipo?.id || !natureza?.id) {
    throw new Error('SIGVOOS_IMPORT_MISSING_CV_CATALOGS');
  }

  return {
    aeroportos,
    defaultTipoVooId: Number(tipo.id),
    defaultNaturezaVooId: Number(natureza.id),
  };
}

function resolveAirportId(cache: CatalogCache, codigo: string | null): number | null {
  if (!codigo) return null;
  return cache.aeroportos.get(codigo) ?? null;
}

function deriveFlightPrefix(record: SigvoosImporterRecord): string {
  return record.flightNumber || record.reportNumber || `SIG-${record.flightIdentityHash.slice(0, 8).toUpperCase()}`;
}

async function findStageByHash(
  db: D1Database,
  empresaId: number,
  payloadHash: string,
): Promise<ExistingStageRow | null> {
  return (
    (await db
      .prepare(
        `SELECT id, import_status, cv_voo_id, cv_etapa_id, cv_tripulante_id
           FROM cv_sigvoos_staging
          WHERE empresa_id = ?
            AND payload_hash = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, payloadHash)
      .first<ExistingStageRow>()) || null
  );
}

async function insertStage(
  db: D1Database,
  empresaId: number,
  record: SigvoosImporterRecord,
  options: ImportSigvoosPayloadOptions,
): Promise<string> {
  const stageId = `cvsig-${empresaId}-${record.payloadHash}`;
  const windowStart = options.sourceWindowStart || record.date;
  const windowEnd = options.sourceWindowEnd || record.date;

  await db
    .prepare(
      `INSERT INTO cv_sigvoos_staging (
         id,
         empresa_id,
         sigvoos_flight_report_id,
         sigvoos_leg_number,
         sigvoos_staff_id,
         data_operacional,
         source_window_start,
         source_window_end,
         payload_hash,
         payload_sanitizado_json,
         import_status,
         tentativas
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 1)`,
    )
    .bind(
      stageId,
      empresaId,
      record.flightReportId,
      record.legNumber,
      record.staffId,
      record.date,
      windowStart,
      windowEnd,
      record.payloadHash,
      record.payloadSanitizedJson,
    )
    .run();

  return stageId;
}

async function markStageReused(db: D1Database, stageId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE cv_sigvoos_staging
          SET tentativas = tentativas + 1,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(stageId)
    .run();
}

async function updateStageStatus(
  db: D1Database,
  params: {
    stageId: string;
    status: 'PROCESSED' | 'CONFLICT' | 'ERROR';
    flightId?: number | null;
    etapaId?: number | null;
    tripulanteId?: number | null;
    errorMessage?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE cv_sigvoos_staging
          SET import_status = ?,
              cv_voo_id = ?,
              cv_etapa_id = ?,
              cv_tripulante_id = ?,
              erro_msg = ?,
              processado_em = datetime('now'),
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(
      params.status,
      params.flightId ?? null,
      params.etapaId ?? null,
      params.tripulanteId ?? null,
      params.errorMessage ?? null,
      params.stageId,
    )
    .run();
}

async function findExistingFlight(
  db: D1Database,
  empresaId: number,
  record: SigvoosImporterRecord,
  origemId: number,
  destinoId: number,
): Promise<ExistingFlightRow | null> {
  if (record.flightReportId != null) {
    const byReportId = await db
      .prepare(
        `SELECT id, origem_importacao, sigvoos_flight_report_id
           FROM cv_voos
          WHERE empresa_id = ?
            AND sigvoos_flight_report_id = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, record.flightReportId)
      .first<ExistingFlightRow>();
    if (byReportId) return byReportId;
  }

  const byNaturalKey = await db
    .prepare(
      `SELECT id, origem_importacao, sigvoos_flight_report_id
         FROM cv_voos
        WHERE empresa_id = ?
          AND data_programacao = ?
          AND prefixo = ?
          AND origem_id = ?
          AND destino_id = ?
          AND deleted_at IS NULL
        ORDER BY CASE
          WHEN ? IS NOT NULL AND sigvoos_flight_report_id = ? THEN 0
          WHEN origem_importacao = 'MANUAL' THEN 1
          ELSE 2
        END, id ASC
        LIMIT 1`,
    )
    .bind(
      empresaId,
      record.date,
      deriveFlightPrefix(record),
      origemId,
      destinoId,
      record.flightReportId,
      record.flightReportId,
    )
    .first<ExistingFlightRow>();

  if (byNaturalKey) {
    if (
      record.flightReportId == null ||
      byNaturalKey.sigvoos_flight_report_id == null ||
      Number(byNaturalKey.sigvoos_flight_report_id) === record.flightReportId
    ) {
      return byNaturalKey;
    }
  }

  return (
    (await db
      .prepare(
        `SELECT id, origem_importacao, sigvoos_flight_report_id
           FROM cv_voos
          WHERE empresa_id = ?
            AND sigvoos_flight_report_id IS NULL
            AND sigvoos_content_hash = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, record.flightIdentityHash)
      .first<ExistingFlightRow>()) || null
  );
}

async function upsertFlight(
  db: D1Database,
  empresaId: number,
  record: SigvoosImporterRecord,
  options: ImportSigvoosPayloadOptions,
  cache: CatalogCache,
): Promise<{ id: number; created: boolean; updated: boolean }> {
  const origemId = resolveAirportId(cache, record.origemIcao);
  const destinoId = resolveAirportId(cache, record.destinoIcao);

  if (!origemId || !destinoId) {
    throw new Error('SIGVOOS_IMPORT_MISSING_AIRPORT_MATCH');
  }

  const horarioPrevistoPartida = toTimestamp(record.date, record.horaDecolagem || record.horaMotorLigado);
  const horarioPrevistoChegada = toTimestamp(record.date, record.horaPouso || record.horaMotorDesligado);

  if (!horarioPrevistoPartida || !horarioPrevistoChegada) {
    throw new Error('SIGVOOS_IMPORT_INVALID_FLIGHT_TIMES');
  }

  const existing = await findExistingFlight(db, empresaId, record, origemId, destinoId);
  const prefixo = deriveFlightPrefix(record);

  if (!existing) {
    const insertResult = await db
      .prepare(
        `INSERT INTO cv_voos (
           empresa_id,
           prefixo,
           data_programacao,
           origem_id,
           destino_id,
           tipo_voo_id,
           natureza_voo_id,
           horario_previsto_partida,
           horario_previsto_chegada,
           horario_real_partida,
           horario_real_chegada,
           status,
           created_by,
           updated_by,
           sigvoos_flight_report_id,
           sigvoos_flight_report_id_confident,
           sigvoos_report_number,
           sigvoos_flight_number,
           sigvoos_client_name,
           sigvoos_contract_name,
           sigvoos_importado_em,
           sigvoos_content_hash,
           origem_importacao
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planejado', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'SIGVOOS')`,
      )
      .bind(
        empresaId,
        prefixo,
        record.date,
        origemId,
        destinoId,
        cache.defaultTipoVooId,
        cache.defaultNaturezaVooId,
        horarioPrevistoPartida,
        horarioPrevistoChegada,
        horarioPrevistoPartida,
        horarioPrevistoChegada,
        options.actorUserId ?? null,
        options.actorUserId ?? null,
        record.flightReportId,
        record.flightReportId != null ? 1 : 0,
        record.reportNumber,
        record.flightNumber,
        record.clientName,
        record.contractName,
        record.flightIdentityHash,
      )
      .run();

    return {
      id: Number(insertResult.meta.last_row_id),
      created: true,
      updated: false,
    };
  }

  if (existing.origem_importacao === 'MANUAL') {
    await db
      .prepare(
        `UPDATE cv_voos
            SET horario_real_partida = COALESCE(horario_real_partida, ?),
                horario_real_chegada = COALESCE(horario_real_chegada, ?),
                sigvoos_flight_report_id = COALESCE(sigvoos_flight_report_id, ?),
                sigvoos_flight_report_id_confident = CASE
                  WHEN ? IS NOT NULL THEN 1
                  ELSE sigvoos_flight_report_id_confident
                END,
                sigvoos_report_number = COALESCE(?, sigvoos_report_number),
                sigvoos_flight_number = COALESCE(?, sigvoos_flight_number),
                sigvoos_client_name = COALESCE(?, sigvoos_client_name),
                sigvoos_contract_name = COALESCE(?, sigvoos_contract_name),
                sigvoos_importado_em = datetime('now'),
                sigvoos_content_hash = ?,
                updated_by = COALESCE(?, updated_by),
                updated_at = datetime('now')
          WHERE id = ?`,
      )
      .bind(
        horarioPrevistoPartida,
        horarioPrevistoChegada,
        record.flightReportId,
        record.flightReportId,
        record.reportNumber,
        record.flightNumber,
        record.clientName,
        record.contractName,
        record.flightIdentityHash,
        options.actorUserId ?? null,
        existing.id,
      )
      .run();
  } else {
    await db
      .prepare(
        `UPDATE cv_voos
            SET prefixo = ?,
                data_programacao = ?,
                origem_id = ?,
                destino_id = ?,
                tipo_voo_id = ?,
                natureza_voo_id = ?,
                horario_previsto_partida = ?,
                horario_previsto_chegada = ?,
                horario_real_partida = ?,
                horario_real_chegada = ?,
                sigvoos_flight_report_id = COALESCE(sigvoos_flight_report_id, ?),
                sigvoos_flight_report_id_confident = CASE
                  WHEN ? IS NOT NULL THEN 1
                  ELSE sigvoos_flight_report_id_confident
                END,
                sigvoos_report_number = COALESCE(?, sigvoos_report_number),
                sigvoos_flight_number = COALESCE(?, sigvoos_flight_number),
                sigvoos_client_name = COALESCE(?, sigvoos_client_name),
                sigvoos_contract_name = COALESCE(?, sigvoos_contract_name),
                sigvoos_importado_em = datetime('now'),
                sigvoos_content_hash = ?,
                origem_importacao = 'SIGVOOS',
                updated_by = COALESCE(?, updated_by),
                updated_at = datetime('now')
          WHERE id = ?`,
      )
      .bind(
        prefixo,
        record.date,
        origemId,
        destinoId,
        cache.defaultTipoVooId,
        cache.defaultNaturezaVooId,
        horarioPrevistoPartida,
        horarioPrevistoChegada,
        horarioPrevistoPartida,
        horarioPrevistoChegada,
        record.flightReportId,
        record.flightReportId,
        record.reportNumber,
        record.flightNumber,
        record.clientName,
        record.contractName,
        record.flightIdentityHash,
        options.actorUserId ?? null,
        existing.id,
      )
      .run();
  }

  return {
    id: Number(existing.id),
    created: false,
    updated: true,
  };
}

async function resolveNextEtapaNumber(db: D1Database, empresaId: number, vooId: number): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(MAX(numero_etapa), 0) + 1 AS next_numero
         FROM cv_voo_etapas
        WHERE empresa_id = ?
          AND voo_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(empresaId, vooId)
    .first<{ next_numero: number }>();
  return Number(row?.next_numero || 1);
}

async function findExistingEtapa(
  db: D1Database,
  empresaId: number,
  vooId: number,
  record: SigvoosImporterRecord,
): Promise<ExistingEtapaRow | null> {
  if (record.legNumber != null) {
    const byLegNumber = await db
      .prepare(
        `SELECT id
           FROM cv_voo_etapas
          WHERE empresa_id = ?
            AND voo_id = ?
            AND sigvoos_leg_number = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, vooId, record.legNumber)
      .first<ExistingEtapaRow>();
    if (byLegNumber) return byLegNumber;
  }

  return (
    (await db
      .prepare(
        `SELECT id
           FROM cv_voo_etapas
          WHERE empresa_id = ?
            AND voo_id = ?
            AND sigvoos_content_hash = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, vooId, record.etapaIdentityHash)
      .first<ExistingEtapaRow>()) || null
  );
}

async function upsertEtapa(
  db: D1Database,
  empresaId: number,
  vooId: number,
  record: SigvoosImporterRecord,
  options: ImportSigvoosPayloadOptions,
): Promise<{ id: number; created: boolean; updated: boolean }> {
  const existing = await findExistingEtapa(db, empresaId, vooId, record);
  const numeroEtapa = existing ? null : await resolveNextEtapaNumber(db, empresaId, vooId);
  const tempoDecolagemPouso = computeDuration(record.horaDecolagem, record.horaPouso);
  const tempoTotal = computeDuration(record.horaMotorLigado, record.horaMotorDesligado);

  if (!existing) {
    const insertResult = await db
      .prepare(
        `INSERT INTO cv_voo_etapas (
           empresa_id,
           voo_id,
           numero_etapa,
           sigvoos_leg_number,
           origem_icao,
           destino_icao,
           horario_motor_ligado,
           horario_decolagem,
           horario_pouso,
           horario_motor_desligado,
           tempo_decolagem_pouso,
           tempo_total,
           tempo_navegacao,
           tempo_ifr,
           tempo_noturno,
           pousos_diurnos,
           pousos_noturnos,
           starts,
           pax,
           combustivel_inicio,
           combustivel_fim,
           origem_dados,
           sigvoos_importado_em,
           sigvoos_content_hash,
           metadata_sigvoos_json,
           created_by,
           updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SIGVOOS', datetime('now'), ?, ?, ?, ?)`,
      )
      .bind(
        empresaId,
        vooId,
        numeroEtapa,
        record.legNumber,
        record.origemIcao,
        record.destinoIcao,
        record.horaMotorLigado,
        record.horaDecolagem,
        record.horaPouso,
        record.horaMotorDesligado,
        tempoDecolagemPouso,
        tempoTotal,
        tempoDecolagemPouso,
        record.tempoIfr,
        record.tempoNoturno,
        record.pousosDiurnos,
        record.pousosNoturnos,
        record.starts,
        record.pax,
        record.fuelStart,
        record.fuelEnd,
        record.etapaIdentityHash,
        record.payloadSanitizedJson,
        options.actorUserId ?? null,
        options.actorUserId ?? null,
      )
      .run();

    return {
      id: Number(insertResult.meta.last_row_id),
      created: true,
      updated: false,
    };
  }

  await db
    .prepare(
      `UPDATE cv_voo_etapas
          SET origem_icao = ?,
              destino_icao = ?,
              horario_motor_ligado = ?,
              horario_decolagem = ?,
              horario_pouso = ?,
              horario_motor_desligado = ?,
              tempo_decolagem_pouso = ?,
              tempo_total = ?,
              tempo_navegacao = ?,
              tempo_ifr = ?,
              tempo_noturno = ?,
              pousos_diurnos = ?,
              pousos_noturnos = ?,
              starts = ?,
              pax = ?,
              combustivel_inicio = ?,
              combustivel_fim = ?,
              origem_dados = 'SIGVOOS',
              sigvoos_importado_em = datetime('now'),
              sigvoos_content_hash = ?,
              metadata_sigvoos_json = ?,
              updated_by = COALESCE(?, updated_by),
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(
      record.origemIcao,
      record.destinoIcao,
      record.horaMotorLigado,
      record.horaDecolagem,
      record.horaPouso,
      record.horaMotorDesligado,
      tempoDecolagemPouso,
      tempoTotal,
      tempoDecolagemPouso,
      record.tempoIfr,
      record.tempoNoturno,
      record.pousosDiurnos,
      record.pousosNoturnos,
      record.starts,
      record.pax,
      record.fuelStart,
      record.fuelEnd,
      record.etapaIdentityHash,
      record.payloadSanitizedJson,
      options.actorUserId ?? null,
      existing.id,
    )
    .run();

  return {
    id: Number(existing.id),
    created: false,
    updated: true,
  };
}

async function loadFuncionarios(db: D1Database, empresaId: number): Promise<FuncionarioLookup[]> {
  const pragma = await db.prepare("PRAGMA table_info('funcionarios')").all<{ name: string }>();
  const columnNames = new Set((pragma.results || []).map((column) => String(column.name || '')));

  if (!columnNames.has('empresa_id') || !columnNames.has('deleted_at')) {
    throw new Error('SIGVOOS_IMPORT_INVALID_FUNCIONARIOS_SCHEMA');
  }

  const hasNome = columnNames.has('nome');
  const hasMatricula = columnNames.has('matricula');

  const rows = await db
    .prepare(
      `SELECT id,
              ${hasNome ? 'nome' : 'NULL'} AS nome,
              ${hasMatricula ? 'matricula' : 'NULL'} AS matricula
         FROM funcionarios
        WHERE empresa_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(empresaId)
    .all<FuncionarioLookup>();

  return (rows.results || []).map((row) => ({
    id: Number(row.id),
    nome: row.nome ? String(row.nome) : null,
    matricula: row.matricula ? String(row.matricula) : null,
  }));
}

async function resolveTripulante(
  db: D1Database,
  empresaId: number,
  record: SigvoosImporterRecord,
  funcionarios: FuncionarioLookup[],
): Promise<ResolveTripulanteResult | null> {
  let previousStaffMapping: number | null = null;
  if (record.staffId != null) {
    const previous = await db
      .prepare(
        `SELECT funcionario_id
           FROM cv_voo_tripulantes
          WHERE empresa_id = ?
            AND sigvoos_staff_id = ?
            AND deleted_at IS NULL
          ORDER BY updated_at DESC, id DESC
          LIMIT 1`,
      )
      .bind(empresaId, record.staffId)
      .first<{ funcionario_id: number }>();

    if (previous?.funcionario_id) {
      previousStaffMapping = Number(previous.funcionario_id);
    }
  }

  const byInscription = record.staffInscriptionNormalized
    ? funcionarios.find(
        (funcionario) => normalizeSigvoosStaffInscription(funcionario.matricula) === record.staffInscriptionNormalized,
      ) || null
    : null;

  if (previousStaffMapping != null && byInscription && Number(byInscription.id) !== previousStaffMapping) {
    return {
      status: 'CONFLICT',
      conflict: {
        justificativa: 'staff.id e staff.inscription resolvidos para funcionarios diferentes',
        valorSigvoos: {
          funcionario_id_staff_id: previousStaffMapping,
          funcionario_id_staff_inscription: Number(byInscription.id),
          staff_id: record.staffId,
          staff_inscription: record.staffInscriptionRaw,
          staff_name: record.staffName,
        },
      },
    };
  }

  if (previousStaffMapping != null) {
    return {
      status: 'RESOLVED',
      resolution: {
        funcionarioId: previousStaffMapping,
        fonteResolucao: 'STAFF_ID',
      },
    };
  }

  if (!byInscription) {
    return null;
  }

  return {
    status: 'RESOLVED',
    resolution: {
      funcionarioId: Number(byInscription.id),
      fonteResolucao: 'STAFF_INSCRIPTION',
    },
  };
}

async function findExistingTripulante(
  db: D1Database,
  empresaId: number,
  vooId: number,
  etapaId: number,
  funcionarioId: number,
  funcao: RoleCode,
  staffId: number | null,
): Promise<ExistingTripulanteRow | null> {
  if (staffId != null) {
    const byStaff = await db
      .prepare(
        `SELECT id
           FROM cv_voo_tripulantes
          WHERE empresa_id = ?
            AND voo_id = ?
            AND etapa_id = ?
            AND sigvoos_staff_id = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, vooId, etapaId, staffId)
      .first<ExistingTripulanteRow>();
    if (byStaff) return byStaff;
  }

  return (
    (await db
      .prepare(
        `SELECT id
           FROM cv_voo_tripulantes
          WHERE empresa_id = ?
            AND voo_id = ?
            AND funcionario_id = ?
            AND funcao = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, vooId, funcionarioId, funcao)
      .first<ExistingTripulanteRow>()) || null
  );
}

async function upsertTripulante(
  db: D1Database,
  empresaId: number,
  vooId: number,
  etapaId: number,
  record: SigvoosImporterRecord,
  resolution: ResolvedTripulante,
  options: ImportSigvoosPayloadOptions,
): Promise<{ id: number; created: boolean; updated: boolean }> {
  const existing = await findExistingTripulante(
    db,
    empresaId,
    vooId,
    etapaId,
    resolution.funcionarioId,
    record.tripulanteFuncao,
    record.staffId,
  );

  const horarioApresentacao = toTimestamp(record.date, record.horaMotorLigado || record.horaDecolagem);
  const horarioDispensa = toTimestamp(record.date, record.horaMotorDesligado || record.horaPouso);

  if (!existing) {
    const insertResult = await db
      .prepare(
        `INSERT INTO cv_voo_tripulantes (
           empresa_id,
           voo_id,
           funcionario_id,
           funcao,
           horario_apresentacao,
           horario_dispensa,
           created_by,
           updated_by,
           etapa_id,
           sigvoos_staff_id,
           sigvoos_staff_inscription,
           funcao_origem,
           resolucao_funcionario_fonte,
           sigvoos_content_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        empresaId,
        vooId,
        resolution.funcionarioId,
        record.tripulanteFuncao,
        horarioApresentacao,
        horarioDispensa,
        options.actorUserId ?? null,
        options.actorUserId ?? null,
        etapaId,
        record.staffId,
        record.staffInscriptionRaw,
        record.staffRoleRaw,
        resolution.fonteResolucao,
        record.payloadHash,
      )
      .run();

    return {
      id: Number(insertResult.meta.last_row_id),
      created: true,
      updated: false,
    };
  }

  await db
    .prepare(
      `UPDATE cv_voo_tripulantes
          SET etapa_id = ?,
              horario_apresentacao = COALESCE(horario_apresentacao, ?),
              horario_dispensa = COALESCE(horario_dispensa, ?),
              sigvoos_staff_id = COALESCE(sigvoos_staff_id, ?),
              sigvoos_staff_inscription = COALESCE(sigvoos_staff_inscription, ?),
              funcao_origem = COALESCE(?, funcao_origem),
              resolucao_funcionario_fonte = ?,
              sigvoos_content_hash = ?,
              updated_by = COALESCE(?, updated_by),
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(
      etapaId,
      horarioApresentacao,
      horarioDispensa,
      record.staffId,
      record.staffInscriptionRaw,
      record.staffRoleRaw,
      resolution.fonteResolucao,
      record.payloadHash,
      options.actorUserId ?? null,
      existing.id,
    )
    .run();

  return {
    id: Number(existing.id),
    created: false,
    updated: true,
  };
}

async function createTripulanteConflict(
  db: D1Database,
  empresaId: number,
  vooId: number,
  stageId: string,
  record: SigvoosImporterRecord,
  options: ImportSigvoosPayloadOptions,
  conflict?: TripulanteConflict,
): Promise<number> {
  const insertResult = await db
    .prepare(
      `INSERT INTO cv_conflitos_integracao (
         empresa_id,
         entidade_tipo,
         entidade_id,
         campo,
         valor_airtrust,
         valor_sigvoos,
         staging_id,
         severidade,
         status,
         justificativa,
         created_by,
         updated_by
       ) VALUES (?, 'voo', ?, 'funcionario_id', NULL, ?, ?, 'MEDIA', 'ABERTO', ?, ?, ?)`,
    )
    .bind(
      empresaId,
      vooId,
      JSON.stringify(
        conflict?.valorSigvoos || {
          staff_id: record.staffId,
          staff_name: record.staffName,
          staff_inscription: record.staffInscriptionRaw,
        },
      ),
      stageId,
      conflict?.justificativa || 'funcionario nao resolvido por staff.id ou staff.inscription',
      options.actorUserId ?? null,
      options.actorUserId ?? null,
    )
    .run();

  return Number(insertResult.meta.last_row_id);
}

export async function importSigvoosPayloadToControleVoos(
  db: D1Database,
  empresaId: number,
  payload: SigvoosPayload,
  options: ImportSigvoosPayloadOptions = {},
): Promise<ImportSigvoosPayloadSummary> {
  const records = extractRecords(payload);
  const cache = await loadCatalogCache(db, empresaId);
  const funcionarios = await loadFuncionarios(db, empresaId);

  const summary: ImportSigvoosPayloadSummary = {
    totalRecords: records.length,
    processedRecords: 0,
    conflictRecords: 0,
    reusedRecords: 0,
    createdFlights: 0,
    updatedFlights: 0,
    createdEtapas: 0,
    updatedEtapas: 0,
    createdTripulantes: 0,
    updatedTripulantes: 0,
    createdConflicts: 0,
    results: [],
  };

  for (const rawRecord of records) {
    const record = await normalizeSigvoosImporterRecord(rawRecord);
    const existingStage = await findStageByHash(db, empresaId, record.payloadHash);

    if (existingStage && existingStage.import_status !== 'ERROR') {
      await markStageReused(db, existingStage.id);
      summary.reusedRecords += 1;
      summary.results.push({
        stageId: existingStage.id,
        payloadHash: record.payloadHash,
        status: 'REUSED',
        reused: true,
        flightId: existingStage.cv_voo_id,
        etapaId: existingStage.cv_etapa_id,
        tripulanteId: existingStage.cv_tripulante_id,
        conflictId: null,
      });
      continue;
    }

    const stageId = existingStage?.id ?? (await insertStage(db, empresaId, record, options));

    try {
      if (existingStage?.id) {
        await db
          .prepare(
            `UPDATE cv_sigvoos_staging
                SET tentativas = tentativas + 1,
                    import_status = 'PENDING',
                    erro_msg = NULL,
                    updated_at = datetime('now')
              WHERE id = ?`,
          )
          .bind(existingStage.id)
          .run();
      }

      const flight = await upsertFlight(db, empresaId, record, options, cache);
      if (flight.created) summary.createdFlights += 1;
      if (flight.updated) summary.updatedFlights += 1;

      const etapa = await upsertEtapa(db, empresaId, flight.id, record, options);
      if (etapa.created) summary.createdEtapas += 1;
      if (etapa.updated) summary.updatedEtapas += 1;

      const resolution = await resolveTripulante(db, empresaId, record, funcionarios);

      if (!resolution) {
        const conflictId = await createTripulanteConflict(db, empresaId, flight.id, stageId, record, options);
        await updateStageStatus(db, {
          stageId,
          status: 'CONFLICT',
          flightId: flight.id,
          etapaId: etapa.id,
          tripulanteId: null,
        });

        summary.conflictRecords += 1;
        summary.createdConflicts += 1;
        summary.results.push({
          stageId,
          payloadHash: record.payloadHash,
          status: 'CONFLICT',
          reused: false,
          flightId: flight.id,
          etapaId: etapa.id,
          tripulanteId: null,
          conflictId,
        });
        continue;
      }

      if (resolution.status === 'CONFLICT') {
        const conflictId = await createTripulanteConflict(
          db,
          empresaId,
          flight.id,
          stageId,
          record,
          options,
          resolution.conflict,
        );
        await updateStageStatus(db, {
          stageId,
          status: 'CONFLICT',
          flightId: flight.id,
          etapaId: etapa.id,
          tripulanteId: null,
        });

        summary.conflictRecords += 1;
        summary.createdConflicts += 1;
        summary.results.push({
          stageId,
          payloadHash: record.payloadHash,
          status: 'CONFLICT',
          reused: false,
          flightId: flight.id,
          etapaId: etapa.id,
          tripulanteId: null,
          conflictId,
        });
        continue;
      }

      const tripulante = await upsertTripulante(
        db,
        empresaId,
        flight.id,
        etapa.id,
        record,
        resolution.resolution,
        options,
      );
      if (tripulante.created) summary.createdTripulantes += 1;
      if (tripulante.updated) summary.updatedTripulantes += 1;

      await updateStageStatus(db, {
        stageId,
        status: 'PROCESSED',
        flightId: flight.id,
        etapaId: etapa.id,
        tripulanteId: tripulante.id,
      });

      summary.processedRecords += 1;
      summary.results.push({
        stageId,
        payloadHash: record.payloadHash,
        status: 'PROCESSED',
        reused: false,
        flightId: flight.id,
        etapaId: etapa.id,
        tripulanteId: tripulante.id,
        conflictId: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SIGVOOS_IMPORT_UNKNOWN_ERROR';

      // A previously unseen ICAO is a record-level catalog conflict, not a
      // reason to abort every remaining record in the fetched SIGVOOS payload.
      // Keep it isolated in staging so the catalog can be corrected/retried,
      // while unrelated flights in the same batch continue processing.
      if (message === 'SIGVOOS_IMPORT_MISSING_AIRPORT_MATCH') {
        await updateStageStatus(db, {
          stageId,
          status: 'CONFLICT',
          errorMessage: message,
        });
        summary.conflictRecords += 1;
        summary.results.push({
          stageId,
          payloadHash: record.payloadHash,
          status: 'CONFLICT',
          reused: false,
          flightId: null,
          etapaId: null,
          tripulanteId: null,
          conflictId: null,
        });
        continue;
      }

      await updateStageStatus(db, {
        stageId,
        status: 'ERROR',
        errorMessage: message,
      });
      throw error;
    }
  }

  return summary;
}
