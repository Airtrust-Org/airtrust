import { z } from 'zod';
import { carregarLimites } from '../lib/frms/db-service-config';
import { confirmarImportacaoFira, enrichFiraPreviewLineIntegridade, type FiraImportacaoPreview, type FiraLinhPreview } from '../lib/frms/fira-service';
import { classifyOperationalCrewRole } from '../lib/frms/operational-crew';
import {
  SIGVOOS_DEFAULT_BASE_URL,
  SIGVOOS_DEFAULT_SYSTEM,
  SIGVOOS_PASSWORD_MARKER,
  SigvoosApiClient,
  resolveSigvoosEncryptionSecret,
  encryptSigvoosPassword,
  decryptSigvoosPassword,
  type SigvoosClientConfig,
} from '../lib/sigvoos/client';

const SIGVOOS_PAGE_SIZE = 200;

const CONFIG_KEYS = [
  'base_url',
  'username',
  'password',
  'password_encrypted',
  'system',
  'last_sync_at',
  'last_sync_from',
  'last_sync_to',
  'last_sync_total_raw',
  'last_sync_total_importacoes',
  'auto_sync_enabled',
  'auto_sync_hora_utc',
  'notificar_falha_email',
] as const;

type SigvoosConfigKey = (typeof CONFIG_KEYS)[number];

interface SigvoosRuntimeEnv {
  SIGVOOS_CONFIG_ENCRYPTION_KEY?: string;
  JWT_SECRET?: string;
}

function isPasswordMarker(value: string | null | undefined): boolean {
  if (!value) return false;
  return value === SIGVOOS_PASSWORD_MARKER;
}

export interface SigvoosConfig {
  base_url: string;
  username: string | null;
  password: string | null;
  system: string;
  last_sync_at?: string | null;
  last_sync_from?: string | null;
  last_sync_to?: string | null;
  last_sync_total_raw?: string | null;
  last_sync_total_importacoes?: string | null;
  auto_sync_enabled?: string | null;
  auto_sync_hora_utc?: string | null;
  notificar_falha_email?: string | null;
}

export interface SanitizedSigvoosConfig {
  base_url: string;
  username: string | null;
  system: string;
  last_sync_at: string | null;
  last_sync_from: string | null;
  last_sync_to: string | null;
  last_sync_total_raw: string | null;
  last_sync_total_importacoes: string | null;
  auto_sync_enabled: boolean;
  auto_sync_hora_utc: number;
  password_configured: boolean;
  hasPassword: boolean;
  notificar_falha_email: string | null;
}

export interface SigvoosSyncInput {
  from?: string;
  to?: string;
  pageSize?: number;
  maxPages?: number;
  clearExisting?: boolean;
  username?: string;
  password?: string;
  system?: string;
  baseUrl?: string;
}

export interface SigvoosNormalizedLeg {
  canac: string | null;
  identificadorSigvoos: string | null;
  tripulanteNome: string | null;
  data: string;
  horaApresentacao: string | null;
  horaTermino: string | null;
  horasVooMin: number;
  localBase: string | null;
  matriculaAeronave: string | null;
  tempoNoturnoMin: number;
  tempoIfrMin: number;
  raw: Record<string, unknown>;
}

export interface SigvoosGroupedDay {
  canac: string | null;
  identificadorSigvoos: string | null;
  tripulanteNome: string | null;
  data: string;
  dia: number;
  horaApresentacao: string | null;
  horaTermino: string | null;
  horasVooMin: number;
  localBase: string | null;
  matriculaAeronave: string | null;
  tempoNoturnoMin: number;
  tempoIfrMin: number;
  rawItems: Record<string, unknown>[];
}

export type SigvoosResolutionSource =
  | 'MANUAL'
  | 'CANAC'
  | 'MATRICULA'
  | 'NOME_FUZZY'
  | 'NAO_ENCONTRADO';

interface MatchedTripulante {
  id: string;
  nome: string;
  fonteResolucao: Exclude<SigvoosResolutionSource, 'NAO_ENCONTRADO'>;
  funcao: string | null;
  cargo: string | null;
  elegivelFrms: boolean;
  motivoInelegibilidade: 'NAO_TRIPULANTE_OPERACIONAL' | null;
}

interface MonthlyPreviewInput {
  importacaoId: string;
  tripulanteId: string | null;
  tripulanteNomeFira: string;
  tripulanteNomeSistema: string | null;
  canac: string;
  identificadorSigvoos: string | null;
  fonteResolucao: SigvoosResolutionSource;
  ano: number;
  mes: number;
  groupedDays: SigvoosGroupedDay[];
  avisos?: string[];
}

type SigvoosTripulanteResolution = MatchedTripulante | null;

function buildMatchedTripulante(
  funcionario: {
    id: string;
    nome: string;
    funcao?: string | null;
    cargo?: string | null;
  },
  fonteResolucao: Exclude<SigvoosResolutionSource, 'NAO_ENCONTRADO'>,
): MatchedTripulante {
  const classification = classifyOperationalCrewRole(funcionario.funcao, funcionario.cargo);
  return {
    id: String(funcionario.id),
    nome: funcionario.nome,
    fonteResolucao,
    funcao: funcionario.funcao ?? null,
    cargo: funcionario.cargo ?? null,
    elegivelFrms: classification.isOperational,
    motivoInelegibilidade: classification.isOperational ? null : 'NAO_TRIPULANTE_OPERACIONAL',
  };
}

export interface SigvoosMonthlyPreview {
  preview: FiraImportacaoPreview;
  ano: number;
  mes: number;
  canac: string;
  identificadorSigvoos: string | null;
  fonteResolucao: SigvoosResolutionSource;
  tripulanteId: string | null;
  tripulanteNome: string;
  groupedDays: SigvoosGroupedDay[];
}

export interface SigvoosManualMapping {
  id: string;
  nome_sigvoos: string;
  canac_sigvoos: string | null;
  funcionario_id: string;
  funcionario_nome: string;
  funcionario_matricula: string | null;
  created_at: string;
  updated_at: string;
}

export interface SigvoosUnmappedTripulante {
  nome_sigvoos: string;
  identificador_sigvoos: string | null;
  jornadas_perdidas: number;
  primeira_competencia: string | null;
  ultima_competencia: string | null;
  ultimo_evento_em: string | null;
}

export interface SigvoosJornadaPendente {
  id: string;
  empresa_id: number | null;
  importacao_id: string | null;
  nome_sigvoos: string;
  identificador_sigvoos: string | null;
  canac_sigvoos: string | null;
  competencia: string;
  jornadas: number;
  motivo: string;
  payload_json: string | null;
  status: 'PENDENTE' | 'RESOLVIDO';
  resolved_funcionario_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SigvoosSyncSummary {
  periodo: { from: string; to: string };
  resetExecutado: boolean;
  totalRegistrosBrutos: number;
  totalRegistrosNormalizados: number;
  totalDiasAgrupados: number;
  totalImportacoes: number;
  totalImportados: number;
  totalSubstituidos: number;
  totalIgnorados: number;
  totalErros: number;
  camposDetectados: string[];
  exemplosNormalizados: SigvoosNormalizedLeg[];
  exemplosBrutos: Array<Record<string, unknown>>;
  importacoes: Array<{
    importacao_id: string;
    tripulante_id: string | null;
    tripulante_nome: string;
    canac: string;
    identificador_sigvoos: string | null;
    fonteResolucao: SigvoosResolutionSource;
    ano: number;
    mes: number;
    dias: number;
    importados: number;
    substituidos: number;
    ignorados: number;
    erros: number;
  }>;
}

const SyncSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  pageSize: z.number().int().min(1).max(500).optional(),
  maxPages: z.number().int().min(1).max(500).optional(),
  clearExisting: z.boolean().optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
});

function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function generateId(): string {
  return crypto.randomUUID();
}

function minToHhmm(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function hhmmToMin(value: string | null | undefined): number {
  if (!value) return 0;
  const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeLookupValue(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeCanac(value: unknown): string | null {
  const text = normalizeLookupValue(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, '').replace(/^0+/, '');
  return digits.length > 0 ? digits : null;
}

function normalizeSigvoosCanac(value: unknown): string | null {
  const digits = normalizeCanac(value);
  if (!digits) return null;
  // SIGVOOS devolve `staff.inscription`/matrículas curtas em alguns payloads; não tratar isso como CANAC.
  return digits.length >= 5 ? digits : null;
}

function normalizeSigvoosIdentifier(value: unknown): string | null {
  const text = normalizeLookupValue(value);
  if (!text) return null;
  return text.replace(/\s+/g, ' ').trim().toUpperCase();
}

function normalizarInscription(value: unknown): string | null {
  const text = normalizeLookupValue(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.length > 5 ? digits.slice(-5) : digits.padStart(5, '0');
  return normalized;
}

function normalizeName(value: unknown): string | null {
  const text = normalizeLookupValue(value);
  if (!text) return null;
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(\s*\d+\s*\)$/g, '')
    .replace(/[.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeSigvoosNameForMatching(value: unknown): string | null {
  let normalized = normalizeName(value);
  if (!normalized) return null;

  normalized = normalized.replace(/\s+\d+$/g, '').trim();
  while (/(?:\s+(?:JR|JUNIOR|FILHO|NETO))$/.test(normalized)) {
    normalized = normalized.replace(/(?:\s+(?:JR|JUNIOR|FILHO|NETO))$/, '').trim();
  }

  return normalized || null;
}

function normalizarNomeSigvoos(value: unknown): string | null {
  return normalizeSigvoosNameForMatching(value);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, (_, i) =>
    Array.from({ length: a.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
}

function calcularSimilaridadeNome(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function pickFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeLookupValue(record[key]);
    if (value) return value;
  }
  return null;
}

function pickFirstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const numeric = Number(value.replace(',', '.'));
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function extractDate(value: string | null): string | null {
  if (!value) return null;
  const isoMatch = value.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const brMatch = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  return null;
}

function extractTime(value: string | null): string | null {
  if (!value) return null;
  const matches = [...value.matchAll(/(\d{2}):(\d{2})(?::\d{2})?/g)];
  const match = matches.at(-1);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function toComparableMinutes(time: string | null): number | null {
  if (!time) return null;
  const minutes = hhmmToMin(time);
  return Number.isFinite(minutes) ? minutes : null;
}

function earliestTime(a: string | null, b: string | null): string | null {
  const aMin = toComparableMinutes(a);
  const bMin = toComparableMinutes(b);
  if (aMin == null) return b;
  if (bMin == null) return a;
  return aMin <= bMin ? a : b;
}

function latestTime(a: string | null, b: string | null): string | null {
  const aMin = toComparableMinutes(a);
  const bMin = toComparableMinutes(b);
  if (aMin == null) return b;
  if (bMin == null) return a;
  return aMin >= bMin ? a : b;
}

function detectFieldNames(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort();
}

function filterRecordArray(payload: unknown): Record<string, unknown>[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter(
    (item): item is Record<string, unknown> => !!item && typeof item === 'object',
  );
}

function getNestedRecordArray(payload: unknown, paths: string[][]): Record<string, unknown>[] {
  for (const path of paths) {
    let current: unknown = payload;

    for (const key of path) {
      current = asRecord(current)?.[key];
      if (current === undefined) {
        break;
      }
    }

    const records = filterRecordArray(current);
    if (records.length > 0) {
      return records;
    }
  }

  return [];
}

export function getArrayPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return filterRecordArray(payload);
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const candidate = payload as Record<string, unknown>;
  const directArrays = [
    candidate.main,
    candidate.data,
    candidate.results,
    candidate.items,
    candidate.rows,
    candidate.payload,
  ];
  for (const value of directArrays) {
    const records = filterRecordArray(value);
    if (records.length > 0) {
      return records;
    }
  }

  return getNestedRecordArray(candidate, [
    ['data', 'main'],
    ['data', 'items'],
    ['data', 'results'],
    ['payload', 'main'],
    ['payload', 'items'],
    ['result', 'main'],
  ]);
}

export function extractSigvoosAccessToken(payload: Record<string, unknown>): string | null {
  const directToken =
    normalizeLookupValue(payload.accessToken) ||
    normalizeLookupValue(payload.access_token) ||
    normalizeLookupValue(payload.token);

  if (directToken) {
    return directToken;
  }

  const nestedData = asRecord(payload.data);
  const nestedTokenRaw = normalizeLookupValue(nestedData?.token);
  if (!nestedTokenRaw) {
    return null;
  }

  try {
    const parsed = JSON.parse(nestedTokenRaw) as Record<string, unknown>;
    return (
      normalizeLookupValue(parsed.accessToken) ||
      normalizeLookupValue(parsed.access_token) ||
      normalizeLookupValue(parsed.token) ||
      nestedTokenRaw
    );
  } catch {
    return nestedTokenRaw;
  }
}

function mergeConfigRows(
  rows: Array<{ chave: string; valor: string | null }>,
  overrides?: Partial<SigvoosConfig>,
): SigvoosConfig {
  const fromDb = new Map(rows.map((row) => [row.chave, row.valor]));
  return {
    base_url: overrides?.base_url || fromDb.get('base_url') || SIGVOOS_DEFAULT_BASE_URL,
    username: overrides?.username ?? fromDb.get('username') ?? null,
    password: overrides?.password ?? null,
    system: overrides?.system || fromDb.get('system') || SIGVOOS_DEFAULT_SYSTEM,
    last_sync_at: fromDb.get('last_sync_at') ?? null,
    last_sync_from: fromDb.get('last_sync_from') ?? null,
    last_sync_to: fromDb.get('last_sync_to') ?? null,
    last_sync_total_raw: fromDb.get('last_sync_total_raw') ?? null,
    last_sync_total_importacoes: fromDb.get('last_sync_total_importacoes') ?? null,
    auto_sync_enabled: overrides?.auto_sync_enabled ?? fromDb.get('auto_sync_enabled') ?? 'true',
    auto_sync_hora_utc: overrides?.auto_sync_hora_utc ?? fromDb.get('auto_sync_hora_utc') ?? '19',
    notificar_falha_email:
      overrides?.notificar_falha_email ?? fromDb.get('notificar_falha_email') ?? null,
  };
}

export function sanitizeSigvoosConfig(config: SigvoosConfig): SanitizedSigvoosConfig {
  const parsedHour = Number.parseInt(config.auto_sync_hora_utc ?? '19', 10);
  const autoSyncHourUtc = Number.isFinite(parsedHour) ? Math.max(0, Math.min(23, parsedHour)) : 19;
  const passwordConfigured = Boolean(config.password);

  return {
    base_url: config.base_url,
    username: config.username,
    system: config.system,
    last_sync_at: config.last_sync_at ?? null,
    last_sync_from: config.last_sync_from ?? null,
    last_sync_to: config.last_sync_to ?? null,
    last_sync_total_raw: config.last_sync_total_raw ?? null,
    last_sync_total_importacoes: config.last_sync_total_importacoes ?? null,
    auto_sync_enabled: config.auto_sync_enabled !== 'false',
    auto_sync_hora_utc: autoSyncHourUtc,
    password_configured: passwordConfigured,
    hasPassword: passwordConfigured,
    notificar_falha_email: config.notificar_falha_email ?? null,
  };
}

function normalizeEmpresaId(value?: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

async function resolveSigvoosEmpresaId(
  db: D1Database,
  empresaId?: number | null,
): Promise<number | null> {
  const preferredEmpresaId = normalizeEmpresaId(empresaId);
  if (preferredEmpresaId !== null) {
    const preferred = await db
      .prepare(
        `SELECT COUNT(*) AS total
           FROM integracoes_sigvoos_config
          WHERE deleted_at IS NULL
            AND empresa_id = ?
              AND chave IN ('username', 'password', 'password_encrypted')
            AND COALESCE(NULLIF(TRIM(valor), ''), NULL) IS NOT NULL`,
      )
      .bind(preferredEmpresaId)
      .first<{ total: number }>();

    if (Number(preferred?.total || 0) > 0) {
      return preferredEmpresaId;
    }
  }

  const configured = await db
    .prepare(
      `SELECT empresa_id
         FROM integracoes_sigvoos_config
        WHERE deleted_at IS NULL
          AND chave IN ('username', 'password', 'password_encrypted')
          AND COALESCE(NULLIF(TRIM(valor), ''), NULL) IS NOT NULL
        GROUP BY empresa_id
        ORDER BY MAX(updated_at) DESC
        LIMIT 2`,
    )
    .all<{ empresa_id: number | null }>();

  const empresasConfiguradas = (configured.results || []).map((row) =>
    normalizeEmpresaId(row.empresa_id),
  );
  if (empresasConfiguradas.length === 1) {
    return empresasConfiguradas[0] ?? null;
  }

  return preferredEmpresaId;
}

async function reconcileStaleSigvoosEventos(
  db: D1Database,
  empresaId?: number | null,
  staleMinutes = 30,
): Promise<void> {
  const resolvedEmpresaId = await resolveSigvoosEmpresaId(db, empresaId);
  await db
    .prepare(
      `UPDATE integracoes_sigvoos_eventos
          SET status = 'ERRO',
              erro_ultima = COALESCE(erro_ultima, 'Processamento interrompido antes da finalizacao.'),
              updated_at = ?
        WHERE deleted_at IS NULL
          AND status = 'PROCESSANDO'
          AND (empresa_id = ? OR (empresa_id IS NULL AND ? IS NULL))
          AND datetime(updated_at) <= datetime('now', ?)`,
    )
    .bind(now(), resolvedEmpresaId ?? null, resolvedEmpresaId ?? null, `-${staleMinutes} minutes`)
    .run();
}

export async function getSigvoosConfig(
  db: D1Database,
  empresaId?: number | null,
  overrides?: Partial<SigvoosConfig>,
  runtimeEnv?: SigvoosRuntimeEnv,
): Promise<SigvoosConfig> {
  const resolvedEmpresaId = await resolveSigvoosEmpresaId(db, empresaId);

  const rows = await db
    .prepare(
      `SELECT chave, valor
         FROM integracoes_sigvoos_config
        WHERE deleted_at IS NULL
          AND (empresa_id = ? OR (empresa_id IS NULL AND ? IS NULL))`,
    )
    .bind(resolvedEmpresaId ?? null, resolvedEmpresaId ?? null)
    .all<{ chave: string; valor: string | null }>();

  const rowList = rows.results || [];
  const fromDb = new Map(rowList.map((row) => [row.chave, row.valor]));
  const merged = mergeConfigRows(rowList, overrides);

  let password = overrides?.password ?? null;

  if (!password) {
    const encrypted = fromDb.get('password_encrypted');
    const secret = resolveSigvoosEncryptionSecret(runtimeEnv);
    if (encrypted && secret) {
      try {
        password = await decryptSigvoosPassword(encrypted, secret);
      } catch {
        password = null;
      }
    }
  }

  if (!password) {
    const legacy = fromDb.get('password');
    if (legacy && !isPasswordMarker(legacy)) {
      password = legacy;
    }
  }

  return {
    ...merged,
    password,
  };
}

async function upsertSigvoosConfigRaw(
  db: D1Database,
  key: SigvoosConfigKey,
  value: string | null,
  empresaId?: number | null,
): Promise<void> {
  const resolvedEmpresaId = await resolveSigvoosEmpresaId(db, empresaId);
  const timestamp = now();

  const updated = await db
    .prepare(
      `UPDATE integracoes_sigvoos_config
          SET valor = ?, updated_at = ?, deleted_at = NULL
        WHERE chave = ?
          AND ((empresa_id = ?) OR (empresa_id IS NULL AND ? IS NULL))`,
    )
    .bind(value, timestamp, key, resolvedEmpresaId ?? null, resolvedEmpresaId ?? null)
    .run();

  if ((updated.meta.changes ?? 0) > 0) {
    return;
  }

  await db
    .prepare(
      `INSERT INTO integracoes_sigvoos_config (empresa_id, chave, valor, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
    .bind(resolvedEmpresaId ?? null, key, value, timestamp, timestamp)
    .run();
}

export async function upsertSigvoosConfig(
  db: D1Database,
  key: SigvoosConfigKey,
  value: string | null,
  empresaId?: number | null,
  runtimeEnv?: SigvoosRuntimeEnv,
): Promise<void> {
  if (key !== 'password') {
    await upsertSigvoosConfigRaw(db, key, value, empresaId);
    return;
  }

  const normalized = value?.trim() ?? '';
  if (!normalized) {
    await upsertSigvoosConfigRaw(db, 'password_encrypted', null, empresaId);
    await upsertSigvoosConfigRaw(db, 'password', null, empresaId);
    return;
  }

  const secret = resolveSigvoosEncryptionSecret(runtimeEnv);
  if (!secret) {
    throw new Error('SIGVOOS_ENCRYPTION_KEY_MISSING');
  }

  const encrypted = await encryptSigvoosPassword(normalized, secret);
  await upsertSigvoosConfigRaw(db, 'password_encrypted', encrypted, empresaId);
  // Mantemos apenas um marcador para higienizar SELECTs simples em D1.
  await upsertSigvoosConfigRaw(db, 'password', SIGVOOS_PASSWORD_MARKER, empresaId);
}

export async function listSigvoosEventos(
  db: D1Database,
  empresaId?: number | null,
  limit = 50,
): Promise<Array<Record<string, unknown>>> {
  const resolvedEmpresaId = await resolveSigvoosEmpresaId(db, empresaId);
  await reconcileStaleSigvoosEventos(db, resolvedEmpresaId);
  const rows = await db
    .prepare(
      `SELECT id, tipo_evento, status, payload_json, resposta_json, erro_ultima, created_at, updated_at
         FROM integracoes_sigvoos_eventos
        WHERE deleted_at IS NULL
          AND (empresa_id = ? OR (empresa_id IS NULL AND ? IS NULL))
        ORDER BY json_extract(payload_json, '$.from') DESC,
                 json_extract(payload_json, '$.to') DESC,
                 created_at DESC
        LIMIT ?`,
    )
    .bind(resolvedEmpresaId ?? null, resolvedEmpresaId ?? null, limit)
    .all<Record<string, unknown>>();
  return rows.results || [];
}

interface SigvoosManualMappingRow {
  id: string;
  nome_sigvoos: string;
  canac_sigvoos: string | null;
  funcionario_id: string;
  funcionario_nome: string;
  funcionario_matricula: string | null;
  created_at: string;
  updated_at: string;
}

async function loadSigvoosManualMappings(
  db: D1Database,
  empresaId: number | null | undefined,
): Promise<SigvoosManualMappingRow[]> {
  const resolvedEmpresaId = await resolveSigvoosEmpresaId(db, empresaId);
  const rows = await db
    .prepare(
      `SELECT m.id,
              m.nome_sigvoos,
              COALESCE(m.inscricao_sigvoos, m.canac_sigvoos) AS canac_sigvoos,
              CAST(m.funcionario_id AS TEXT) AS funcionario_id,
              f.nome AS funcionario_nome,
              CAST(f.matricula AS TEXT) AS funcionario_matricula,
              m.created_at,
              m.updated_at
         FROM sigvoos_mapeamento_manual m
         JOIN funcionarios f ON f.id = m.funcionario_id
        WHERE m.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND (m.empresa_id = ? OR (m.empresa_id IS NULL AND ? IS NULL))
        UNION ALL
       SELECT m.id,
              m.nome_sigvoos,
              m.canac_sigvoos,
              CAST(m.funcionario_id AS TEXT) AS funcionario_id,
              f.nome AS funcionario_nome,
              CAST(f.matricula AS TEXT) AS funcionario_matricula,
              m.created_at,
              m.updated_at
         FROM integracoes_sigvoos_mapeamentos m
         JOIN funcionarios f ON f.id = m.funcionario_id
        WHERE m.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND (m.empresa_id = ? OR (m.empresa_id IS NULL AND ? IS NULL))
          AND NOT EXISTS (
            SELECT 1
              FROM sigvoos_mapeamento_manual sm
             WHERE sm.deleted_at IS NULL
               AND sm.funcionario_id = m.funcionario_id
               AND (sm.empresa_id = m.empresa_id OR (sm.empresa_id IS NULL AND m.empresa_id IS NULL))
               AND UPPER(TRIM(sm.nome_sigvoos)) = UPPER(TRIM(m.nome_sigvoos))
          )
        ORDER BY 8 DESC, 7 DESC`,
    )
    .bind(
      resolvedEmpresaId ?? null,
      resolvedEmpresaId ?? null,
      resolvedEmpresaId ?? null,
      resolvedEmpresaId ?? null,
    )
    .all<SigvoosManualMappingRow>();

  return rows.results || [];
}

export async function listSigvoosManualMappings(
  db: D1Database,
  empresaId?: number | null,
): Promise<SigvoosManualMapping[]> {
  return loadSigvoosManualMappings(db, empresaId);
}

async function findSigvoosManualMapping(
  db: D1Database,
  empresaId: number | null | undefined,
  name: string | null,
  canac: string | null,
  identificadorSigvoos: string | null,
): Promise<SigvoosManualMappingRow | null> {
  const mappings = await loadSigvoosManualMappings(db, empresaId);
  const normalizedName = normalizeSigvoosNameForMatching(name);
  const candidateIdentifiers = new Set(
    [normalizeSigvoosIdentifier(identificadorSigvoos), normalizeSigvoosIdentifier(canac)].filter(
      (value): value is string => Boolean(value),
    ),
  );

  const byIdentifier = mappings.find((mapping) => {
    const mappingIdentifier = normalizeSigvoosIdentifier(mapping.canac_sigvoos);
    return mappingIdentifier ? candidateIdentifiers.has(mappingIdentifier) : false;
  });
  if (byIdentifier) return byIdentifier;

  if (!normalizedName) return null;
  return (
    mappings.find(
      (mapping) => normalizeSigvoosNameForMatching(mapping.nome_sigvoos) === normalizedName,
    ) || null
  );
}

export async function upsertSigvoosManualMapping(
  db: D1Database,
  empresaId: number | null | undefined,
  input: {
    nomeSigvoos: string;
    canacSigvoos?: string | null;
    funcionarioId: string | number;
  },
): Promise<SigvoosManualMapping | null> {
  const resolvedEmpresaId = await resolveSigvoosEmpresaId(db, empresaId);
  const timestamp = now();
  const funcionarioId = Number(input.funcionarioId);
  const nomeSigvoos = normalizeLookupValue(input.nomeSigvoos);
  const canacSigvoos = normalizeSigvoosIdentifier(input.canacSigvoos);
  const inscricaoSigvoos = normalizarInscription(input.canacSigvoos);

  if (!nomeSigvoos || !Number.isFinite(funcionarioId)) {
    throw new Error('SIGVOOS_MANUAL_MAPPING_INVALID');
  }

  const existing = await findSigvoosManualMapping(
    db,
    resolvedEmpresaId,
    nomeSigvoos,
    canacSigvoos,
    canacSigvoos,
  );

  if (existing) {
    await db
      .prepare(
        `UPDATE sigvoos_mapeamento_manual
            SET nome_sigvoos = ?,
                inscricao_sigvoos = ?,
                canac_sigvoos = ?,
                funcionario_id = ?,
                updated_at = ?,
                deleted_at = NULL
          WHERE id = ?`,
      )
      .bind(nomeSigvoos, inscricaoSigvoos, canacSigvoos, funcionarioId, timestamp, existing.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO sigvoos_mapeamento_manual (
          id, empresa_id, nome_sigvoos, inscricao_sigvoos, canac_sigvoos, funcionario_id, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        generateId(),
        resolvedEmpresaId ?? null,
        nomeSigvoos,
        inscricaoSigvoos,
        canacSigvoos,
        funcionarioId,
        timestamp,
        timestamp,
      )
      .run();
  }

  await db
    .prepare(
      `INSERT INTO integracoes_sigvoos_mapeamentos (
        id, empresa_id, nome_sigvoos, canac_sigvoos, funcionario_id, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      generateId(),
      resolvedEmpresaId ?? null,
      nomeSigvoos,
      canacSigvoos,
      funcionarioId,
      timestamp,
      timestamp,
    )
    .run()
    .catch(() => null);

  const mappings = await loadSigvoosManualMappings(db, resolvedEmpresaId);
  return (
    mappings.find(
      (mapping) =>
        normalizeSigvoosNameForMatching(mapping.nome_sigvoos) ===
          normalizeSigvoosNameForMatching(nomeSigvoos) &&
        normalizeSigvoosIdentifier(mapping.canac_sigvoos) === canacSigvoos,
    ) ||
    mappings.find(
      (mapping) =>
        normalizeSigvoosNameForMatching(mapping.nome_sigvoos) ===
        normalizeSigvoosNameForMatching(nomeSigvoos),
    ) ||
    null
  );
}

async function createSigvoosEvento(
  db: D1Database,
  empresaId: number | null | undefined,
  tipoEvento: string,
  payload: unknown,
): Promise<string> {
  const id = generateId();
  const timestamp = now();
  await db
    .prepare(
      `INSERT INTO integracoes_sigvoos_eventos (
        id, empresa_id, tipo_evento, status, payload_json, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, 'PROCESSANDO', ?, ?, ?, NULL)`,
    )
    .bind(id, empresaId ?? null, tipoEvento, JSON.stringify(payload ?? null), timestamp, timestamp)
    .run();
  return id;
}

async function finalizeSigvoosEvento(
  db: D1Database,
  eventoId: string,
  status: 'SUCESSO' | 'ERRO',
  response: unknown,
  errorMessage?: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE integracoes_sigvoos_eventos
          SET status = ?, resposta_json = ?, erro_ultima = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(status, JSON.stringify(response ?? null), errorMessage ?? null, now(), eventoId)
    .run();
}


export function normalizeSigvoosRecord(raw: Record<string, unknown>): SigvoosNormalizedLeg | null {
  const staff = asRecord(raw.staff);
  const flightReport = asRecord(raw.flight_report);
  const flightReportLeg = asRecord(raw.flight_report_leg);
  const departureLocation = asRecord(flightReportLeg?.departure_location);
  const identificadorSigvoos =
    normalizeSigvoosIdentifier(staff?.inscription) ||
    normalizeSigvoosIdentifier(
      pickFirstString(raw, [
        'inscription',
        'staff_inscription',
        'matricula',
        'matricula_funcional',
        'employee_code',
        'crew_code',
      ]),
    );

  const canac = normalizeSigvoosCanac(
    staff?.canac ||
      staff?.codigo_anac ||
      pickFirstString(raw, [
        'canac',
        'codigo_anac',
        'codigoAnac',
        'anac',
        'tripulante_canac',
        'tripulanteCanac',
        'canac_tripulante',
      ]),
  );

  const tripulanteNome =
    normalizeLookupValue(staff?.name) ||
    pickFirstString(raw, [
      'tripulante_nome',
      'tripulanteNome',
      'nome_tripulante',
      'nomeTripulante',
      'crew_name',
      'crewName',
      'nome',
    ]);

  const dateText =
    extractDate(normalizeLookupValue(raw.date)) ||
    extractDate(
      pickFirstString(raw, [
        'data',
        'date',
        'data_voo',
        'dataVoo',
        'data_etapa',
        'dataEtapa',
        'calco_fora',
        'partida_prevista',
        'partida_real',
        'off_block',
      ]),
    ) ||
    extractDate(
      pickFirstString(raw, ['calco_dentro', 'chegada_real', 'chegada_prevista', 'on_block']),
    );

  if (!dateText) {
    return null;
  }

  const horaApresentacao =
    extractTime(normalizeLookupValue(flightReportLeg?.engine_start_time_str)) ||
    extractTime(
      pickFirstString(raw, [
        'hora_apresentacao',
        'horaApresentacao',
        'inicio',
        'inicio_jornada',
        'inicioJornada',
        'calco_fora',
        'partida_real',
        'partida_prevista',
        'off_block',
      ]),
    ) ||
    null;

  const horaTermino =
    extractTime(normalizeLookupValue(flightReportLeg?.engine_shutoff_time_str)) ||
    extractTime(normalizeLookupValue(flightReportLeg?.landing_time_str)) ||
    extractTime(
      pickFirstString(raw, [
        'hora_termino',
        'horaTermino',
        'fim',
        'fim_jornada',
        'fimJornada',
        'calco_dentro',
        'chegada_real',
        'chegada_prevista',
        'on_block',
      ]),
    ) ||
    null;

  const vooMinNumerico = pickFirstNumber(raw, [
    'horas_voo_minutos',
    'horasVooMinutos',
    'tempo_voo_min',
    'tempoVooMin',
    'flight_minutes',
    'flightMinutes',
    'block_minutes',
    'blockMinutes',
  ]);

  const vooMinTexto = hhmmToMin(
    normalizeLookupValue(flightReportLeg?.navigation_time_str) ||
      normalizeLookupValue(flightReportLeg?.takeoff_land_time_str) ||
      normalizeLookupValue(flightReportLeg?.total_time_str) ||
      pickFirstString(raw, [
        'horas_voo',
        'horasVoo',
        'tempo_voo',
        'tempoVoo',
        'block_time',
        'blockTime',
        'tempo_total',
      ]),
  );

  const horasVooMin = vooMinNumerico != null ? Math.round(vooMinNumerico) : vooMinTexto;
  const localBase =
    normalizeLookupValue(departureLocation?.icao_code) ||
    pickFirstString(raw, [
      'origem',
      'aerodromo_origem',
      'aerodromoOrigem',
      'base',
      'local_base',
      'localBase',
    ]);

  const matriculaAeronave =
    normalizeLookupValue(asRecord(flightReport?.aircraft)?.registration) ||
    normalizeLookupValue(asRecord(raw.aircraft)?.registration) ||
    pickFirstString(raw, ['matricula_aeronave', 'aircraft_registration', 'aeronave']);

  const tempoNoturnoMin = hhmmToMin(
    normalizeLookupValue(flightReportLeg?.night_time_str) ||
      pickFirstString(raw, ['night_time_str', 'tempo_noturno', 'tempo_noturno_str']),
  );

  const tempoIfrMin = hhmmToMin(
    normalizeLookupValue(flightReportLeg?.ifr_time_str) ||
      pickFirstString(raw, ['ifr_time_str', 'tempo_ifr', 'tempo_ifr_str']),
  );

  return {
    canac,
    identificadorSigvoos,
    tripulanteNome,
    data: dateText,
    horaApresentacao,
    horaTermino,
    horasVooMin: Math.max(0, horasVooMin || 0),
    localBase,
    matriculaAeronave: matriculaAeronave || null,
    tempoNoturnoMin: Math.max(0, tempoNoturnoMin || 0),
    tempoIfrMin: Math.max(0, tempoIfrMin || 0),
    raw,
  };
}

export function groupSigvoosRecordsByDay(records: SigvoosNormalizedLeg[]): SigvoosGroupedDay[] {
  const grouped = new Map<string, SigvoosGroupedDay>();

  for (const record of records) {
    const normalizedName = normalizeSigvoosNameForMatching(record.tripulanteNome) || 'SEM_NOME';
    const key = `${record.canac || normalizedName}|${record.data}`;
    const existing = grouped.get(key);
    const dia = Number(record.data.slice(8, 10));

    if (!existing) {
      grouped.set(key, {
        canac: record.canac,
        identificadorSigvoos: record.identificadorSigvoos,
        tripulanteNome: record.tripulanteNome,
        data: record.data,
        dia,
        horaApresentacao: record.horaApresentacao,
        horaTermino: record.horaTermino,
        horasVooMin: record.horasVooMin,
        localBase: record.localBase,
        matriculaAeronave: record.matriculaAeronave,
        tempoNoturnoMin: record.tempoNoturnoMin,
        tempoIfrMin: record.tempoIfrMin,
        rawItems: [record.raw],
      });
      continue;
    }

    existing.horaApresentacao = earliestTime(existing.horaApresentacao, record.horaApresentacao);
    existing.horaTermino = latestTime(existing.horaTermino, record.horaTermino);
    existing.horasVooMin += record.horasVooMin;
    existing.tempoNoturnoMin += record.tempoNoturnoMin;
    existing.tempoIfrMin += record.tempoIfrMin;
    existing.localBase = existing.localBase || record.localBase;
    if (record.matriculaAeronave) {
      const uniqueMatriculas = new Set(
        [existing.matriculaAeronave, record.matriculaAeronave].filter((value): value is string =>
          Boolean(value),
        ),
      );
      existing.matriculaAeronave =
        uniqueMatriculas.size > 0 ? [...uniqueMatriculas].join(', ') : null;
    }
    existing.identificadorSigvoos = existing.identificadorSigvoos || record.identificadorSigvoos;
    existing.rawItems.push(record.raw);
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.data !== b.data) return a.data.localeCompare(b.data);
    return (a.tripulanteNome || '').localeCompare(b.tripulanteNome || '');
  });
}

async function loadExistingJornadasByDate(
  db: D1Database,
  tripulanteId: string | null,
  groupedDays: SigvoosGroupedDay[],
): Promise<Map<string, string>> {
  if (!tripulanteId || groupedDays.length === 0) {
    return new Map();
  }

  const orderedDays = [...groupedDays].sort((a, b) => a.data.localeCompare(b.data));
  const firstDate = orderedDays[0]?.data;
  const lastDate = orderedDays[orderedDays.length - 1]?.data;
  if (!firstDate || !lastDate) {
    return new Map();
  }

  const rows = await db
    .prepare(
      `SELECT id, data
         FROM frms_jornada
        WHERE deleted_at IS NULL
          AND tripulante_id = ?
          AND data >= ?
          AND data <= ?`,
    )
    .bind(Number(tripulanteId), firstDate, lastDate)
    .all<{ id: string; data: string }>();

  return new Map((rows.results || []).map((row) => [row.data, row.id]));
}

export async function buildSigvoosMonthlyPreview(
  input: MonthlyPreviewInput & { db: D1Database },
): Promise<SigvoosMonthlyPreview> {
  const existingJornadasByDate = await loadExistingJornadasByDate(
    input.db,
    input.tripulanteId,
    input.groupedDays,
  );
  const lines: FiraLinhPreview[] = input.groupedDays.map((day) => {
    const jornadaExistenteId = existingJornadasByDate.get(day.data) ?? null;

    return enrichFiraPreviewLineIntegridade({
      dia: day.dia,
      data: day.data,
      status_fira: 'SIGVOOS',
      status_frms: 'ES',
      hora_apresentacao: day.horaApresentacao,
      hora_termino: day.horaTermino,
      duracao_jornada_min:
        day.horaApresentacao && day.horaTermino
          ? Math.max(0, hhmmToMin(day.horaTermino) - hhmmToMin(day.horaApresentacao))
          : 0,
      horas_voo_min: day.horasVooMin,
      local_base: day.localBase,
      situacao: jornadaExistenteId ? 'DUPLICATA' : 'NOVO',
      jornada_existente_id: jornadaExistenteId,
      marcado: true,
    });
  });

  const totalVooMin = lines.reduce((acc, line) => acc + line.horas_voo_min, 0);
  const totalJornadaMin = lines.reduce((acc, line) => acc + line.duracao_jornada_min, 0);

  const preview: FiraImportacaoPreview = {
    importacao_id: input.importacaoId,
    tripulante_encontrado: Boolean(input.tripulanteId),
    tripulante_id: input.tripulanteId,
    tripulante_nome_fira: input.tripulanteNomeFira,
    tripulante_nome_sistema: input.tripulanteNomeSistema,
    canac: input.canac,
    ano: input.ano,
    mes: input.mes,
    mes_nome: new Date(`${input.ano}-${String(input.mes).padStart(2, '0')}-01`).toLocaleString(
      'pt-BR',
      {
        month: 'long',
        timeZone: 'UTC',
      },
    ),
    total_dias: lines.length,
    linhas: lines,
    totais_fira: {
      jornada: minToHhmm(totalJornadaMin),
      voo: minToHhmm(totalVooMin),
    },
    totais_calculados: {
      jornada_min: totalJornadaMin,
      voo_min: totalVooMin,
    },
    divergencia_totais: false,
    avisos: input.avisos || [],
    erros: [],
  };

  return {
    preview,
    ano: input.ano,
    mes: input.mes,
    canac: input.canac,
    identificadorSigvoos: input.identificadorSigvoos,
    fonteResolucao: input.fonteResolucao,
    tripulanteId: input.tripulanteId,
    tripulanteNome: input.tripulanteNomeFira,
    groupedDays: input.groupedDays,
  };
}

export async function findTripulanteByCanacOrName(
  db: D1Database,
  empresaId: number | null | undefined,
  input: {
    canac: string | null;
    identificadorSigvoos?: string | null;
    name: string | null;
  },
): Promise<SigvoosTripulanteResolution> {
  const funcionariosColumns = await db
    .prepare("PRAGMA table_info('funcionarios')")
    .all<{ name: string }>();
  const columnNames = new Set(
    (funcionariosColumns.results || []).map((column) => String(column.name || '')),
  );
  const hasCodigoAnac = columnNames.has('codigo_anac');
  const hasCanac = columnNames.has('canac');
  const hasMatricula = columnNames.has('matricula');
  const canacSelect = hasCodigoAnac ? 'codigo_anac' : hasCanac ? 'canac' : 'NULL';
  const matriculaSelect = hasMatricula ? 'matricula' : 'NULL';

  const rows = await db
    .prepare(
      `SELECT id, nome, funcao, cargo, ${canacSelect} AS codigo_anac, ${matriculaSelect} AS matricula
         FROM funcionarios
        WHERE deleted_at IS NULL
          AND (? IS NULL OR empresa_id = ?)
        LIMIT 5000`,
    )
    .bind(empresaId ?? null, empresaId ?? null)
    .all<{
      id: string;
      nome: string;
      funcao?: string | null;
      cargo?: string | null;
      codigo_anac?: string | null;
      matricula?: string | null;
    }>();

  const list = rows.results || [];
  const manualMapping = await findSigvoosManualMapping(
    db,
    empresaId,
    input.name,
    input.canac,
    input.identificadorSigvoos ?? null,
  );
  if (manualMapping) {
    const funcionarioManual = list.find(
      (item) => String(item.id) === String(manualMapping.funcionario_id),
    );
    return buildMatchedTripulante(
      {
        id: String(manualMapping.funcionario_id),
        nome: manualMapping.funcionario_nome,
        funcao: funcionarioManual?.funcao ?? null,
        cargo: funcionarioManual?.cargo ?? null,
      },
      'MANUAL',
    );
  }

  const inscriptionInput = normalizarInscription(input.identificadorSigvoos ?? input.canac);
  const normalizedName = normalizarNomeSigvoos(input.name);

  // Cascata fixa: MANUAL -> CANAC -> MATRICULA(5d) -> NOME_FUZZY
  if (input.canac) {
    const byCanac = list.find((item) => normalizeCanac(item.codigo_anac) === input.canac);
    if (byCanac) {
      return buildMatchedTripulante(byCanac, 'CANAC');
    }
  }

  if (inscriptionInput && hasMatricula) {
    const byMatricula = list.find(
      (item) => normalizarInscription(item.matricula) === inscriptionInput,
    );
    if (byMatricula) {
      return buildMatchedTripulante(byMatricula, 'MATRICULA');
    }
  }

  if (!normalizedName) return null;

  const exactMatches = list.filter((item) => normalizarNomeSigvoos(item.nome) === normalizedName);
  if (exactMatches.length === 1) {
    return buildMatchedTripulante(exactMatches[0], 'NOME_FUZZY');
  }

  const scored = list
    .map((item) => {
      const funcionarioNome = normalizarNomeSigvoos(item.nome);
      if (!funcionarioNome) return null;
      return {
        item,
        score: calcularSimilaridadeNome(normalizedName, funcionarioNome),
      };
    })
    .filter((entry): entry is { item: { id: string; nome: string }; score: number } =>
      Boolean(entry),
    )
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  const scoreThreshold = 0.86;
  const margin = 0.03;

  if (top && top.score >= scoreThreshold && (!second || top.score - second.score >= margin)) {
    return buildMatchedTripulante(top.item, 'NOME_FUZZY');
  }

  return null;
}

/** Pure in-memory matching — used in bulk by listSigvoosUnmappedTripulantes. */
function findTripulanteInMemory(
  input: { canac: string | null; identificadorSigvoos?: string | null; name: string | null },
  mappings: SigvoosManualMappingRow[],
  funcionarios: {
    id: string;
    nome: string;
    funcao?: string | null;
    cargo?: string | null;
    codigo_anac?: string | null;
    matricula?: string | null;
  }[],
): SigvoosTripulanteResolution {
  const normalizedName = normalizeSigvoosNameForMatching(input.name);
  const candidateIdentifiers = new Set(
    [
      normalizeSigvoosIdentifier(input.identificadorSigvoos ?? null),
      normalizeSigvoosIdentifier(input.canac),
    ].filter((v): v is string => Boolean(v)),
  );

  // MANUAL
  const byIdManual = mappings.find((m) => {
    const mi = normalizeSigvoosIdentifier(m.canac_sigvoos);
    return mi && candidateIdentifiers.has(mi);
  });
  if (byIdManual)
    return buildMatchedTripulante(
      {
        id: String(byIdManual.funcionario_id),
        nome: byIdManual.funcionario_nome,
        funcao:
          funcionarios.find((f) => String(f.id) === String(byIdManual.funcionario_id))?.funcao ??
          null,
        cargo:
          funcionarios.find((f) => String(f.id) === String(byIdManual.funcionario_id))?.cargo ??
          null,
      },
      'MANUAL',
    );
  if (normalizedName) {
    const byNameManual = mappings.find(
      (m) => normalizeSigvoosNameForMatching(m.nome_sigvoos) === normalizedName,
    );
    if (byNameManual)
      return buildMatchedTripulante(
        {
          id: String(byNameManual.funcionario_id),
          nome: byNameManual.funcionario_nome,
          funcao:
            funcionarios.find((f) => String(f.id) === String(byNameManual.funcionario_id))
              ?.funcao ?? null,
          cargo:
            funcionarios.find((f) => String(f.id) === String(byNameManual.funcionario_id))
              ?.cargo ?? null,
        },
        'MANUAL',
      );
  }

  // CANAC
  if (input.canac) {
    const byCanac = funcionarios.find((f) => normalizeCanac(f.codigo_anac) === input.canac);
    if (byCanac) return buildMatchedTripulante(byCanac, 'CANAC');
  }

  // MATRICULA
  const inscriptionInput = normalizarInscription(input.identificadorSigvoos ?? input.canac);
  if (inscriptionInput) {
    const byMatricula = funcionarios.find(
      (f) => normalizarInscription(f.matricula) === inscriptionInput,
    );
    if (byMatricula) return buildMatchedTripulante(byMatricula, 'MATRICULA');
  }

  // NOME_FUZZY
  if (!normalizedName) return null;
  const normalizedInputName = normalizarNomeSigvoos(input.name);
  if (!normalizedInputName) return null;

  const exactMatches = funcionarios.filter(
    (f) => normalizarNomeSigvoos(f.nome) === normalizedInputName,
  );
  if (exactMatches.length === 1)
    return buildMatchedTripulante(exactMatches[0], 'NOME_FUZZY');

  const scored = funcionarios
    .map((f) => {
      const fn = normalizarNomeSigvoos(f.nome);
      return fn ? { item: f, score: calcularSimilaridadeNome(normalizedInputName, fn) } : null;
    })
    .filter((e): e is { item: (typeof funcionarios)[0]; score: number } => Boolean(e))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  if (top && top.score >= 0.86 && (!second || top.score - second.score >= 0.03)) {
    return buildMatchedTripulante(top.item, 'NOME_FUZZY');
  }
  return null;
}

export async function listSigvoosUnmappedTripulantes(
  db: D1Database,
  empresaId?: number | null,
  limit = 50,
): Promise<SigvoosUnmappedTripulante[]> {
  // Preload once to avoid N×DB queries in the loop (sequential to avoid concurrent DDL locks)
  const eventos = await listSigvoosEventos(db, empresaId, 150);
  const mappings = await loadSigvoosManualMappings(db, empresaId);
  const funcionariosColumns = await db
    .prepare("PRAGMA table_info('funcionarios')")
    .all<{ name: string }>();

  const columnNames = new Set((funcionariosColumns.results || []).map((c) => String(c.name || '')));
  const hasCodigoAnac = columnNames.has('codigo_anac');
  const hasCanac = columnNames.has('canac');
  const hasMatricula = columnNames.has('matricula');
  const canacSelect = hasCodigoAnac ? 'codigo_anac' : hasCanac ? 'canac' : 'NULL';
  const matriculaSelect = hasMatricula ? 'matricula' : 'NULL';

  const funcionariosRows = await db
    .prepare(
      `SELECT id, nome, funcao, cargo, ${canacSelect} AS codigo_anac, ${matriculaSelect} AS matricula
         FROM funcionarios
        WHERE deleted_at IS NULL
          AND (? IS NULL OR empresa_id = ?)
        LIMIT 5000`,
    )
    .bind(empresaId ?? null, empresaId ?? null)
    .all<{
      id: string;
      nome: string;
      funcao?: string | null;
      cargo?: string | null;
      codigo_anac?: string | null;
      matricula?: string | null;
    }>();
  const funcionarios = funcionariosRows.results || [];

  const aggregated = new Map<string, SigvoosUnmappedTripulante>();

  for (const evento of eventos) {
    if (String(evento.status || '') !== 'SUCESSO') continue;

    let resposta: Record<string, unknown> = {};
    try {
      resposta = evento.resposta_json
        ? (JSON.parse(String(evento.resposta_json)) as Record<string, unknown>)
        : {};
    } catch {
      resposta = {};
    }

    const importacoes = Array.isArray(resposta.importacoes) ? resposta.importacoes : [];
    for (const item of importacoes) {
      if (!item || typeof item !== 'object') continue;
      const importacao = item as Record<string, unknown>;
      if (normalizeLookupValue(importacao.tripulante_id)) continue;

      const nomeSigvoos = normalizeLookupValue(importacao.tripulante_nome);
      if (!nomeSigvoos) continue;

      const identificadorSigvoos =
        normalizeSigvoosIdentifier(importacao.identificador_sigvoos) ||
        normalizeSigvoosIdentifier(importacao.canac);

      const resolved = findTripulanteInMemory(
        {
          canac: normalizeSigvoosCanac(importacao.canac),
          identificadorSigvoos,
          name: nomeSigvoos,
        },
        mappings,
        funcionarios,
      );
      if (resolved?.elegivelFrms) continue;

      const key = `${normalizeSigvoosNameForMatching(nomeSigvoos) || nomeSigvoos}::${identificadorSigvoos || 'SEM_ID'}`;
      const competencia = `${String(importacao.ano || '')}-${String(importacao.mes || '').padStart(2, '0')}`;
      const existing = aggregated.get(key);

      if (!existing) {
        aggregated.set(key, {
          nome_sigvoos: nomeSigvoos,
          identificador_sigvoos: identificadorSigvoos,
          jornadas_perdidas: Number(importacao.dias || 0),
          primeira_competencia: competencia.match(/^\d{4}-\d{2}$/) ? competencia : null,
          ultima_competencia: competencia.match(/^\d{4}-\d{2}$/) ? competencia : null,
          ultimo_evento_em: normalizeLookupValue(evento.created_at),
        });
        continue;
      }

      existing.jornadas_perdidas += Number(importacao.dias || 0);
      if (competencia.match(/^\d{4}-\d{2}$/)) {
        if (!existing.primeira_competencia || competencia < existing.primeira_competencia) {
          existing.primeira_competencia = competencia;
        }
        if (!existing.ultima_competencia || competencia > existing.ultima_competencia) {
          existing.ultima_competencia = competencia;
        }
      }
      if (
        !existing.ultimo_evento_em ||
        String(evento.created_at || '') > existing.ultimo_evento_em
      ) {
        existing.ultimo_evento_em = normalizeLookupValue(evento.created_at);
      }
    }
  }

  return [...aggregated.values()]
    .sort((a, b) => (b.ultimo_evento_em || '').localeCompare(a.ultimo_evento_em || ''))
    .slice(0, limit);
}

function groupDaysByMonth(days: SigvoosGroupedDay[]): Map<string, SigvoosGroupedDay[]> {
  const grouped = new Map<string, SigvoosGroupedDay[]>();
  for (const day of days) {
    const monthKey = day.data.slice(0, 7);
    const existing = grouped.get(monthKey) || [];
    existing.push(day);
    grouped.set(monthKey, existing);
  }
  return grouped;
}

function formatBrDateFromIso(value: string): string {
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDateOrNull(value?: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addUtcDays(base: Date, days: number): Date {
  const copy = new Date(base);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function resolveSyncRange(
  config: SigvoosConfig,
  input: z.infer<typeof SyncSchema>,
): { from: string; to: string } {
  const today = new Date();
  const todayIso = formatIsoDate(today);

  const to = input.to || todayIso;
  let from = input.from;

  if (!from) {
    const lastSyncTo = parseIsoDateOrNull(config.last_sync_to);
    from = lastSyncTo ? formatIsoDate(addUtcDays(lastSyncTo, 1)) : todayIso;
  }

  const fromDate = parseIsoDateOrNull(from);
  const toDate = parseIsoDateOrNull(to);
  if (!fromDate || !toDate || fromDate > toDate) {
    throw new Error('SIGVOOS_INVALID_SYNC_RANGE');
  }

  return { from, to };
}

export function buildSigvoosMonthlyWindows(
  from: string,
  to: string,
): Array<{ from: string; to: string }> {
  const windows: Array<{ from: string; to: string }> = [];
  const rangeStart = new Date(`${from}T00:00:00Z`);
  const rangeEnd = new Date(`${to}T00:00:00Z`);

  if (
    Number.isNaN(rangeStart.getTime()) ||
    Number.isNaN(rangeEnd.getTime()) ||
    rangeStart > rangeEnd
  ) {
    return windows;
  }

  let cursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));
  while (cursor <= rangeEnd) {
    const monthStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const windowStart = monthStart < rangeStart ? rangeStart : monthStart;
    const windowEnd = monthEnd > rangeEnd ? rangeEnd : monthEnd;

    windows.push({
      from: formatIsoDate(windowStart),
      to: formatIsoDate(windowEnd),
    });

    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return windows;
}

export function shouldStopSigvoosPaging(
  page: number,
  pageItemsLength: number,
  pageSize: number,
): boolean {
  if (pageItemsLength === 0) {
    return true;
  }

  if (pageItemsLength < pageSize) {
    return true;
  }

  // Live SIGVOOS ignores `page`/`page_size` and returns the full month already on page 1.
  if (page === 1 && pageItemsLength > pageSize) {
    return true;
  }

  return false;
}

export function shouldClearExistingSigvoosData(clearExisting?: boolean): boolean {
  return clearExisting === true;
}

export function requireClearExistingEmpresaId(empresaId?: number | null): number {
  const normalized = normalizeEmpresaId(empresaId);
  if (normalized === null) {
    throw new Error('SIGVOOS_CLEAR_EXISTING_REQUIRES_EMPRESA_ID');
  }
  return normalized;
}

export async function clearExistingFiraDataForEmpresa(
  db: D1Database,
  empresaId: number,
): Promise<void> {
  const timestamp = now();
  await db.batch([
    db
      .prepare(
        `UPDATE frms_alerta
          SET deleted_at = ?, updated_at = ?
        WHERE jornada_id IN (
          SELECT id
            FROM frms_jornada
           WHERE origem IN ('FIRA', 'APUS', 'SIGVOOS')
             AND deleted_at IS NULL
             AND empresa_id = ?
        )
          AND deleted_at IS NULL`,
      )
      .bind(timestamp, timestamp, empresaId),
    db
      .prepare(
        `UPDATE frms_fatorizacao_jornada
          SET deleted_at = ?, updated_at = ?
        WHERE jornada_id IN (
          SELECT id
            FROM frms_jornada
           WHERE origem IN ('FIRA', 'APUS', 'SIGVOOS')
             AND deleted_at IS NULL
             AND empresa_id = ?
        )
          AND deleted_at IS NULL`,
      )
      .bind(timestamp, timestamp, empresaId),
    db
      .prepare(
        `UPDATE frms_jornada
          SET deleted_at = ?, updated_at = ?
        WHERE origem IN ('FIRA', 'APUS', 'SIGVOOS')
          AND deleted_at IS NULL
          AND empresa_id = ?`,
      )
      .bind(timestamp, timestamp, empresaId),
    db
      .prepare(
        `UPDATE frms_importacao_fira
          SET deleted_at = ?, updated_at = ?
        WHERE deleted_at IS NULL
          AND (
            EXISTS (
              SELECT 1
                FROM funcionarios f
               WHERE f.id = CAST(frms_importacao_fira.tripulante_id AS INTEGER)
                 AND f.deleted_at IS NULL
                 AND f.empresa_id = ?
            )
            OR EXISTS (
              SELECT 1
                FROM horas_voo_lancamentos h
               WHERE h.deleted_at IS NULL
                 AND h.fira_importacao_id = CAST(frms_importacao_fira.id AS INTEGER)
                 AND h.empresa_id = ?
            )
          )`,
      )
      .bind(timestamp, timestamp, empresaId, empresaId),
    db
      .prepare(
        `UPDATE horas_voo_lancamentos
          SET deleted_at = ?, updated_at = ?
        WHERE deleted_at IS NULL
          AND empresa_id = ?
          AND (origem_registro IN ('FIRA', 'APUS', 'SIGVOOS') OR fira_importacao_id IS NOT NULL)`,
      )
      .bind(timestamp, timestamp, empresaId),
    db
      .prepare(
        `UPDATE frms_jornada_pendente
          SET deleted_at = ?, updated_at = ?
        WHERE deleted_at IS NULL
          AND empresa_id = ?`,
      )
      .bind(timestamp, timestamp, empresaId),
  ]);
}

function buildPendingNaturalKey(input: {
  nomeSigvoos: string;
  identificadorSigvoos: string | null;
  competencia: string;
}): string {
  return `${normalizarNomeSigvoos(input.nomeSigvoos) || input.nomeSigvoos}::${input.identificadorSigvoos || 'SEM_ID'}::${input.competencia}`;
}

async function upsertSigvoosJornadaPendente(
  db: D1Database,
  empresaId: number | null,
  pending: {
    importacaoId: string | null;
    nomeSigvoos: string;
    identificadorSigvoos: string | null;
    canacSigvoos: string | null;
    competencia: string;
    jornadas: number;
    motivo: string;
    payload: unknown;
  },
): Promise<void> {
  const timestamp = now();
  const naturalKey = buildPendingNaturalKey({
    nomeSigvoos: pending.nomeSigvoos,
    identificadorSigvoos: pending.identificadorSigvoos,
    competencia: pending.competencia,
  });

  const existing = await db
    .prepare(
      `SELECT id
         FROM frms_jornada_pendente
        WHERE deleted_at IS NULL
          AND status = 'PENDENTE'
          AND (empresa_id = ? OR (empresa_id IS NULL AND ? IS NULL))
          AND json_extract(payload_json, '$.natural_key') = ?
        LIMIT 1`,
    )
    .bind(empresaId ?? null, empresaId ?? null, naturalKey)
    .first<{ id: string }>();

  const payload = {
    natural_key: naturalKey,
    nome_sigvoos: pending.nomeSigvoos,
    identificador_sigvoos: pending.identificadorSigvoos,
    competencia: pending.competencia,
    ...(pending.payload && typeof pending.payload === 'object'
      ? (pending.payload as Record<string, unknown>)
      : {}),
  };

  if (existing?.id) {
    await db
      .prepare(
        `UPDATE frms_jornada_pendente
            SET importacao_id = ?,
                canac_sigvoos = ?,
                jornadas = ?,
                motivo = ?,
                payload_json = ?,
                updated_at = ?,
                deleted_at = NULL
          WHERE id = ?`,
      )
      .bind(
        pending.importacaoId,
        pending.canacSigvoos,
        pending.jornadas,
        pending.motivo,
        JSON.stringify(payload),
        timestamp,
        existing.id,
      )
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO frms_jornada_pendente (
        id, empresa_id, importacao_id, nome_sigvoos, identificador_sigvoos, canac_sigvoos,
        competencia, jornadas, motivo, payload_json, status, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?, NULL)`,
    )
    .bind(
      generateId(),
      empresaId ?? null,
      pending.importacaoId,
      pending.nomeSigvoos,
      pending.identificadorSigvoos,
      pending.canacSigvoos,
      pending.competencia,
      pending.jornadas,
      pending.motivo,
      JSON.stringify(payload),
      timestamp,
      timestamp,
    )
    .run();
}

async function resolveSigvoosPendenciaByImportacao(
  db: D1Database,
  importacaoId: string,
  funcionarioId: string | null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE frms_jornada_pendente
          SET status = 'RESOLVIDO',
              resolved_funcionario_id = ?,
              updated_at = ?,
              deleted_at = NULL
        WHERE importacao_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(funcionarioId ? Number(funcionarioId) : null, now(), importacaoId)
    .run();
}

async function enrichImportedSigvoosJornadas(
  db: D1Database,
  monthly: SigvoosMonthlyPreview,
): Promise<void> {
  if (!monthly.tripulanteId || monthly.groupedDays.length === 0) return;

  for (const day of monthly.groupedDays) {
    try {
      await db
        .prepare(
          `UPDATE frms_jornada
              SET matricula_aeronave = COALESCE(?, matricula_aeronave),
                  tempo_noturno_str = COALESCE(?, tempo_noturno_str),
                  tempo_ifr_str = COALESCE(?, tempo_ifr_str),
                  fonte_resolucao_sigvoos = ?,
                  updated_at = datetime('now')
            WHERE deleted_at IS NULL
              AND tripulante_id = ?
              AND data = ?
              AND origem IN ('SIGVOOS', 'FIRA')`,
        )
        .bind(
          day.matriculaAeronave,
          day.tempoNoturnoMin > 0 ? minToHhmm(day.tempoNoturnoMin) : null,
          day.tempoIfrMin > 0 ? minToHhmm(day.tempoIfrMin) : null,
          monthly.fonteResolucao,
          Number(monthly.tripulanteId),
          day.data,
        )
        .run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (!message.includes('no such column')) {
        throw error;
      }
      return;
    }
  }
}

export async function listSigvoosPendencias(
  db: D1Database,
  empresaId?: number | null,
  limit = 200,
): Promise<SigvoosJornadaPendente[]> {
  const resolvedEmpresaId = await resolveSigvoosEmpresaId(db, empresaId);
  const rows = await db
    .prepare(
      `SELECT id,
              empresa_id,
              importacao_id,
              nome_sigvoos,
              identificador_sigvoos,
              canac_sigvoos,
              competencia,
              jornadas,
              motivo,
              payload_json,
              status,
              CAST(resolved_funcionario_id AS TEXT) AS resolved_funcionario_id,
              created_at,
              updated_at
         FROM frms_jornada_pendente
        WHERE deleted_at IS NULL
          AND status = 'PENDENTE'
          AND (empresa_id = ? OR (empresa_id IS NULL AND ? IS NULL))
        ORDER BY updated_at DESC
        LIMIT ?`,
    )
    .bind(resolvedEmpresaId ?? null, resolvedEmpresaId ?? null, Math.max(1, limit))
    .all<SigvoosJornadaPendente>();

  return rows.results || [];
}

async function relabelImportedJornadasAsSigvoos(
  db: D1Database,
  tripulanteId: string | null,
  duplicateDates: string[],
  syncStartedAt: string,
): Promise<void> {
  if (!tripulanteId || duplicateDates.length === 0) return;

  const uniqueDates = [
    ...new Set(duplicateDates.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))),
  ];
  if (uniqueDates.length === 0) return;

  const placeholders = uniqueDates.map(() => '?').join(', ');

  try {
    await db
      .prepare(
        `UPDATE frms_jornada
            SET origem = 'SIGVOOS',
                updated_at = datetime('now')
          WHERE deleted_at IS NULL
            AND origem IN ('FIRA', 'APUS')
            AND tripulante_id = ?
            AND data IN (${placeholders})
            AND datetime(created_at) >= datetime(?)`,
      )
      .bind(Number(tripulanteId), ...uniqueDates, syncStartedAt)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (!message.includes('CHECK constraint failed') || !message.includes('origem IN')) {
      throw error;
    }
  }
}

interface JornadaDuplicataCandidate {
  id: string | number;
  origem: string | null;
  empresa_id: number | null;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_voo_minutos: number | null;
  duracao_jornada_minutos: number | null;
}

function hasOperationalDataInPreviewLine(line: FiraLinhPreview): boolean {
  return Boolean(
    line.hora_apresentacao ||
      line.hora_termino ||
      (line.horas_voo_min || 0) > 0 ||
      (line.duracao_jornada_min || 0) > 0,
  );
}

export function isJornadaOperacionalmenteVazia(
  jornada: Pick<
    JornadaDuplicataCandidate,
    'hora_apresentacao' | 'hora_termino' | 'horas_voo_minutos' | 'duracao_jornada_minutos'
  >,
): boolean {
  return !Boolean(
    jornada.hora_apresentacao ||
      jornada.hora_termino ||
      (jornada.horas_voo_minutos || 0) > 0 ||
      (jornada.duracao_jornada_minutos || 0) > 0,
  );
}

export function shouldMergeDuplicataIntoManualEmpty(params: {
  existing: JornadaDuplicataCandidate;
  incomingLine: FiraLinhPreview;
  empresaId?: number | null;
}): boolean {
  const { existing, incomingLine, empresaId } = params;

  if (!hasOperationalDataInPreviewLine(incomingLine)) {
    return false;
  }

  const origem = String(existing.origem || '').trim().toUpperCase();
  if (origem && origem !== 'MANUAL') {
    return false;
  }

  if (!isJornadaOperacionalmenteVazia(existing)) {
    return false;
  }

  if (
    empresaId !== undefined &&
    empresaId !== null &&
    existing.empresa_id !== null &&
    existing.empresa_id !== empresaId
  ) {
    return false;
  }

  return true;
}

async function buildSelectedDaysForSigvoosImport(
  db: D1Database,
  previewLines: FiraLinhPreview[],
  empresaId?: number | null,
): Promise<{
  selectedDays: Array<{ dia: number; forcar_substituicao: boolean }>;
  relabelDates: string[];
}> {
  const duplicateIds = [
    ...new Set(previewLines.map((line) => line.jornada_existente_id).filter(Boolean)),
  ];

  const shouldReplaceByJornadaId = new Map<string, boolean>();
  const existingByJornadaId = new Map<string, JornadaDuplicataCandidate>();
  if (duplicateIds.length > 0) {
    const placeholders = duplicateIds.map(() => '?').join(', ');
    const rows = await db
      .prepare(
        `SELECT id,
                origem,
                empresa_id,
                hora_apresentacao,
                hora_termino,
                horas_voo_minutos,
                duracao_jornada_minutos
           FROM frms_jornada
          WHERE id IN (${placeholders})`,
      )
      .bind(...duplicateIds)
      .all<JornadaDuplicataCandidate>();

    for (const row of rows.results || []) {
      existingByJornadaId.set(String(row.id), row);
      const origem = String(row.origem || '').toUpperCase();
      const canReplace = origem === 'FIRA' || origem === 'SIGVOOS';
      shouldReplaceByJornadaId.set(String(row.id), canReplace);
    }
  }

  const relabelDates: string[] = [];
  const selectedDays = previewLines.map((line) => {
    const existingId = line.jornada_existente_id ? String(line.jornada_existente_id) : null;
    const existing = existingId ? existingByJornadaId.get(existingId) : undefined;
    const shouldMergeManualIncomplete =
      existing && existingId
        ? shouldMergeDuplicataIntoManualEmpty({
            existing,
            incomingLine: line,
            empresaId,
          })
        : false;
    const shouldReplaceFromOrigin = existingId ? shouldReplaceByJornadaId.get(existingId) === true : false;
    const shouldReplace = shouldReplaceFromOrigin || shouldMergeManualIncomplete;

    if (shouldReplace) {
      relabelDates.push(line.data);
    }

    return {
      dia: line.dia,
      forcar_substituicao: shouldReplace,
    };
  });

  return { selectedDays, relabelDates };
}

async function insertPreviewImportacao(
  db: D1Database,
  preview: FiraImportacaoPreview,
  tripulanteNome: string,
  importador: string,
): Promise<void> {
  const timestamp = now();
  await db
    .prepare(
      `INSERT INTO frms_importacao_fira (
        id, tripulante_id, canac, nome_fira, ano, mes,
        arquivo_nome, arquivo_r2_key, status,
        total_dias_extraidos, importado_por, preview_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'REVISAO', ?, ?, ?, ?, ?)`,
    )
    .bind(
      preview.importacao_id,
      preview.tripulante_id,
      preview.canac,
      tripulanteNome,
      preview.ano,
      preview.mes,
      `SIGVOOS_${preview.canac}_${preview.ano}-${String(preview.mes).padStart(2, '0')}.json`,
      preview.total_dias,
      importador,
      JSON.stringify(preview),
      timestamp,
      timestamp,
    )
    .run();
}

async function persistSyncMetadata(
  db: D1Database,
  empresaId: number | null | undefined,
  summary: SigvoosSyncSummary,
): Promise<void> {
  await upsertSigvoosConfig(db, 'last_sync_at', new Date().toISOString(), empresaId);
  await upsertSigvoosConfig(db, 'last_sync_from', summary.periodo.from, empresaId);
  await upsertSigvoosConfig(db, 'last_sync_to', summary.periodo.to, empresaId);
  await upsertSigvoosConfig(
    db,
    'last_sync_total_raw',
    String(summary.totalRegistrosBrutos),
    empresaId,
  );
  await upsertSigvoosConfig(
    db,
    'last_sync_total_importacoes',
    String(summary.totalImportacoes),
    empresaId,
  );
}

export async function syncSigvoosForFrms(
  db: D1Database,
  empresaId: number | null | undefined,
  operadorId: string,
  rawInput: SigvoosSyncInput,
  runtimeEnv?: SigvoosRuntimeEnv,
): Promise<SigvoosSyncSummary> {
  const resolvedEmpresaId = await resolveSigvoosEmpresaId(db, empresaId);
  await reconcileStaleSigvoosEventos(db, resolvedEmpresaId);
  const parsedInput = SyncSchema.parse(rawInput);
  const clearExistingRequested = shouldClearExistingSigvoosData(parsedInput.clearExisting);
  const clearExistingEmpresaId = clearExistingRequested
    ? requireClearExistingEmpresaId(empresaId)
    : null;
  const existingConfig = await getSigvoosConfig(db, resolvedEmpresaId, undefined, runtimeEnv);
  const { from, to } = resolveSyncRange(existingConfig, parsedInput);
  const input = {
    ...parsedInput,
    from,
    to,
  };

  const eventoPayload = {
    ...input,
    ...(input.password ? { password: '__REDACTED__' } : {}),
  };

  const eventoId = await createSigvoosEvento(
    db,
    resolvedEmpresaId,
    'SIGVOOS_SYNC_FRMS',
    eventoPayload,
  );

  try {
    const importadorSigvoos = 'SIGVOOS';
    const syncStartedAt = now();
    const config = await getSigvoosConfig(
      db,
      resolvedEmpresaId,
      {
      base_url: input.baseUrl || SIGVOOS_DEFAULT_BASE_URL,
      username: input.username || null,
      password: input.password || null,
      system: input.system || SIGVOOS_DEFAULT_SYSTEM,
      },
      runtimeEnv,);
       const client = new SigvoosApiClient(config as SigvoosClientConfig);
    const token = await client.authenticate();
    const pageSize = input.pageSize || SIGVOOS_PAGE_SIZE;
    const maxPages = input.maxPages || 2;
    const rawRecords: Record<string, unknown>[] = [];
    const fieldNames = new Set<string>();

    for (const window of buildSigvoosMonthlyWindows(input.from, input.to)) {
      const dateStart = formatBrDateFromIso(window.from);
      const dateFinish = formatBrDateFromIso(window.to);

      for (let page = 1; page <= maxPages; page++) {
        const payload = await client.postSearch('/relatorios/voos/tripulantes/etapas/pesquisa', {
          date_start: dateStart,
          date_finish: dateFinish,
          page,
          page_size: pageSize,
          limit: pageSize,
        });

        const pageItems = getArrayPayload(payload.data ?? payload);
        for (const item of pageItems) {
          rawRecords.push(item);
          for (const key of detectFieldNames(item)) fieldNames.add(key);
        }

        if (shouldStopSigvoosPaging(page, pageItems.length, pageSize)) {
          break;
        }
      }
    }

    const normalized = rawRecords
      .map((item) => normalizeSigvoosRecord(item))
      .filter((item): item is SigvoosNormalizedLeg => Boolean(item));

    const groupedByDay = groupSigvoosRecordsByDay(normalized);

    if (clearExistingRequested) {
      await clearExistingFiraDataForEmpresa(db, clearExistingEmpresaId!);
      console.info('[sigvoos] clearExisting executado com escopo de tenant', {
        empresaId: clearExistingEmpresaId,
      });
    }

    const tripulanteGroups = new Map<string, SigvoosGroupedDay[]>();
    for (const day of groupedByDay) {
      const key = `${day.canac || normalizeSigvoosNameForMatching(day.tripulanteNome) || 'SEM_TRIP'}::${day.tripulanteNome || ''}`;
      const items = tripulanteGroups.get(key) || [];
      items.push(day);
      tripulanteGroups.set(key, items);
    }

    const monthlyPreviews: SigvoosMonthlyPreview[] = [];
    for (const days of tripulanteGroups.values()) {
      const first = days[0];
      const matched = await findTripulanteByCanacOrName(db, resolvedEmpresaId, {
        canac: first.canac,
        identificadorSigvoos: first.identificadorSigvoos,
        name: first.tripulanteNome,
      });
      const matchedOperational = matched?.elegivelFrms ? matched : null;
      const byMonth = groupDaysByMonth(days);

      for (const [monthKey, monthDays] of byMonth.entries()) {
        const [yearText, monthText] = monthKey.split('-');
        monthlyPreviews.push(
          await buildSigvoosMonthlyPreview({
            db,
            importacaoId: generateId(),
            tripulanteId: matchedOperational?.id || null,
            tripulanteNomeFira: first.tripulanteNome || matched?.nome || 'SIGVOOS',
            tripulanteNomeSistema: matched?.nome || null,
            canac: first.canac || 'SEM_CANAC',
            identificadorSigvoos: first.identificadorSigvoos,
            fonteResolucao: matched?.fonteResolucao ?? 'NAO_ENCONTRADO',
            ano: Number(yearText),
            mes: Number(monthText),
            groupedDays: monthDays,
            avisos: matchedOperational
              ? []
              : [
                  matched?.motivoInelegibilidade === 'NAO_TRIPULANTE_OPERACIONAL'
                    ? 'Funcionario resolvido no cadastro, mas sem funcao/cargo elegivel para FRMS operacional.'
                    : 'Tripulante nao localizado automaticamente no AirTrust.',
                ],
          }),
        );
      }
    }

    const limites = await carregarLimites(db);
    const importacoes: SigvoosSyncSummary['importacoes'] = [];
    let totalImportados = 0;
    let totalSubstituidos = 0;
    let totalIgnorados = 0;
    let totalErros = 0;

    for (const monthly of monthlyPreviews) {
      await insertPreviewImportacao(db, monthly.preview, monthly.tripulanteNome, importadorSigvoos);

      let importados = 0;
      let substituidos = 0;
      let ignorados = 0;
      let erros = monthly.preview.tripulante_id ? 0 : monthly.preview.total_dias;

      if (!monthly.preview.tripulante_id) {
        await upsertSigvoosJornadaPendente(db, resolvedEmpresaId ?? null, {
          importacaoId: monthly.preview.importacao_id,
          nomeSigvoos: monthly.tripulanteNome,
          identificadorSigvoos: monthly.identificadorSigvoos,
          canacSigvoos: monthly.canac,
          competencia: `${monthly.ano}-${String(monthly.mes).padStart(2, '0')}`,
          jornadas: monthly.preview.total_dias,
          motivo:
            monthly.preview.avisos?.some((aviso) => aviso.includes('sem funcao/cargo elegivel'))
              ? 'NAO_TRIPULANTE_OPERACIONAL'
              : 'NAO_ENCONTRADO',
          payload: {
            fonte_resolucao: monthly.fonteResolucao,
          },
        });
      }

      if (monthly.preview.tripulante_id) {
        const { selectedDays, relabelDates } = await buildSelectedDaysForSigvoosImport(
          db,
          monthly.preview.linhas,
          resolvedEmpresaId ?? null,
        );

        const result = await confirmarImportacaoFira(
          db,
          monthly.preview.importacao_id,
          {
            dias_selecionados: selectedDays,
          },
          importadorSigvoos,
          limites,
          resolvedEmpresaId ?? undefined,
        );

        await relabelImportedJornadasAsSigvoos(
          db,
          monthly.preview.tripulante_id,
          relabelDates,
          syncStartedAt,
        );
        await enrichImportedSigvoosJornadas(db, monthly);
        await resolveSigvoosPendenciaByImportacao(
          db,
          monthly.preview.importacao_id,
          monthly.tripulanteId,
        );
        importados = result.importados;
        substituidos = result.substituidos;
        ignorados = result.ignorados;
        erros = result.erros;
      }

      totalImportados += importados;
      totalSubstituidos += substituidos;
      totalIgnorados += ignorados;
      totalErros += erros;

      importacoes.push({
        importacao_id: monthly.preview.importacao_id,
        tripulante_id: monthly.preview.tripulante_id,
        tripulante_nome: monthly.tripulanteNome,
        canac: monthly.canac,
        identificador_sigvoos: monthly.identificadorSigvoos,
        fonteResolucao: monthly.fonteResolucao,
        ano: monthly.ano,
        mes: monthly.mes,
        dias: monthly.preview.total_dias,
        importados,
        substituidos,
        ignorados,
        erros,
      });
    }

    const summary: SigvoosSyncSummary = {
      periodo: { from: input.from, to: input.to },
      resetExecutado: clearExistingRequested,
      totalRegistrosBrutos: rawRecords.length,
      totalRegistrosNormalizados: normalized.length,
      totalDiasAgrupados: groupedByDay.length,
      totalImportacoes: monthlyPreviews.length,
      totalImportados,
      totalSubstituidos,
      totalIgnorados,
      totalErros,
      camposDetectados: [...fieldNames].sort(),
      exemplosNormalizados: normalized.slice(0, 5),
      exemplosBrutos: rawRecords.slice(0, 3),
      importacoes,
    };

    await persistSyncMetadata(db, resolvedEmpresaId, summary);
    await finalizeSigvoosEvento(db, eventoId, 'SUCESSO', summary);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'SIGVOOS_SYNC_FAILED');
    await finalizeSigvoosEvento(db, eventoId, 'ERRO', { error: message }, message);
    throw error;
  }
}

export interface ReprocessarPreviewsResult {
  totalPreviewsEncontrados: number;
  totalResolvidos: number;
  totalImportados: number;
  totalErros: number;
  detalhes: Array<{
    importacao_id: string;
    tripulante_nome: string;
    ano: number;
    mes: number;
    resolved: boolean;
    importados?: number;
    error?: string;
  }>;
}

/**
 * Reprocessa previews de importação SIGVOOS que ficaram sem tripulante_id
 * (NAO_ENCONTRADO) após criação de novos mapeamentos manuais.
 * Não chama a SIGVOOS API — apenas re-tenta resolver com mapeamentos atuais
 * e confirma as importações pendentes.
 */
export async function reprocessarPreviewsSigvoosSemTripulante(
  db: D1Database,
  empresaId: number | null | undefined,
  importadorId: string,
): Promise<ReprocessarPreviewsResult> {
  const limites = await carregarLimites(db);

  const rows = await db
    .prepare(
      `SELECT id, canac, nome_fira, ano, mes, preview_json
       FROM frms_importacao_fira
       WHERE tripulante_id IS NULL
         AND deleted_at IS NULL
         AND arquivo_nome LIKE 'SIGVOOS_%'
       ORDER BY ano DESC, mes DESC, created_at DESC`,
    )
    .all<{
      id: string;
      canac: string | null;
      nome_fira: string | null;
      ano: number;
      mes: number;
      preview_json: string | null;
    }>();

  const previews = rows.results || [];
  const result: ReprocessarPreviewsResult = {
    totalPreviewsEncontrados: previews.length,
    totalResolvidos: 0,
    totalImportados: 0,
    totalErros: 0,
    detalhes: [],
  };

  for (const row of previews) {
    let preview: FiraImportacaoPreview | null = null;
    try {
      preview = row.preview_json ? (JSON.parse(row.preview_json) as FiraImportacaoPreview) : null;
    } catch {
      result.detalhes.push({
        importacao_id: row.id,
        tripulante_nome: row.nome_fira || '',
        ano: row.ano,
        mes: row.mes,
        resolved: false,
        error: 'preview_json inválido',
      });
      continue;
    }

    if (!preview) continue;

    // Extract SIGVOOS identifiers from preview or canac field
    const nomeSigvoos = row.nome_fira || '';
    const canacSigvoos = row.canac || null;

    // Try to resolve tripulante with current mappings
    const matched = await findTripulanteByCanacOrName(db, empresaId, {
      canac: canacSigvoos,
      name: nomeSigvoos,
    });

    if (!matched) {
      result.detalhes.push({
        importacao_id: row.id,
        tripulante_nome: nomeSigvoos,
        ano: row.ano,
        mes: row.mes,
        resolved: false,
        error: 'Tripulante ainda não encontrado',
      });
      continue;
    }

    if (!matched.elegivelFrms) {
      result.detalhes.push({
        importacao_id: row.id,
        tripulante_nome: nomeSigvoos,
        ano: row.ano,
        mes: row.mes,
        resolved: false,
        error: 'Funcionario resolvido, mas sem funcao/cargo elegivel para FRMS operacional',
      });
      continue;
    }

    // Update frms_importacao_fira with the resolved tripulante_id
    const timestamp = now();
    await db
      .prepare(`UPDATE frms_importacao_fira SET tripulante_id = ?, updated_at = ? WHERE id = ?`)
      .bind(matched.id, timestamp, row.id)
      .run();

    // Update preview_json with the resolved tripulante_id
    const updatedPreview: FiraImportacaoPreview = { ...preview, tripulante_id: matched.id };

    // Now confirm the import
    try {
      const { selectedDays, relabelDates } = await buildSelectedDaysForSigvoosImport(
        db,
        updatedPreview.linhas,
        empresaId ?? null,
      );

      const confirmResult = await confirmarImportacaoFira(
        db,
        row.id,
        { dias_selecionados: selectedDays },
        importadorId,
        limites,
        empresaId ?? undefined,
      );

      if (relabelDates.length > 0) {
        await relabelImportedJornadasAsSigvoos(db, matched.id, relabelDates, timestamp);
      }
      await resolveSigvoosPendenciaByImportacao(db, row.id, matched.id);

      result.totalResolvidos++;
      result.totalImportados += confirmResult.importados;
      result.totalErros += confirmResult.erros;
      result.detalhes.push({
        importacao_id: row.id,
        tripulante_nome: nomeSigvoos,
        ano: row.ano,
        mes: row.mes,
        resolved: true,
        importados: confirmResult.importados,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.totalErros++;
      result.detalhes.push({
        importacao_id: row.id,
        tripulante_nome: nomeSigvoos,
        ano: row.ano,
        mes: row.mes,
        resolved: false,
        error: msg,
      });
    }
  }

  return result;
}

export async function mapearSigvoosPendenciaERreprocessar(
  db: D1Database,
  empresaId: number | null | undefined,
  input: {
    nomeSigvoos: string;
    canacSigvoos?: string | null;
    funcionarioId: string | number;
  },
  importadorId: string,
): Promise<{
  mapping: SigvoosManualMapping | null;
  reprocessamento: ReprocessarPreviewsResult;
}> {
  const mapping = await upsertSigvoosManualMapping(db, empresaId, input);
  const reprocessamento = await reprocessarPreviewsSigvoosSemTripulante(
    db,
    empresaId,
    importadorId,
  );
  return {
    mapping,
    reprocessamento,
  };
}
