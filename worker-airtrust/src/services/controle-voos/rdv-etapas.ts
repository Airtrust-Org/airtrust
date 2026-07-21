/**
 * CRUD e agregação de trechos (etapas) em `cv_voo_etapas`.
 *
 * Modelo programado vs realizado (sem colunas dual):
 * - Horários e combustível em `cv_voo_etapas` = realizado (perna efetiva).
 * - `cv_voos.horario_previsto_*` / origem/destino do voo = programado.
 * Não inventar etapas "programadas"; o GET de listagem devolve `meta.programado`
 * a partir do voo e `data` com as etapas realizadas.
 */
import { ApiError } from '../../middleware/error-handler';
import type { RdvRow, RdvWorkflowStatus } from '../../repositories/controle-voos/rdv-repository';
import { assertRdvVersion, hasRdvCapability, RDV_CAPABILITIES } from './rdv-workflow';
import type { Context } from 'hono';
import type { Env } from '../../types';

export type EtapaOrigemDados = 'MANUAL' | 'SIGVOOS';

export type EtapaRow = {
  id: number;
  empresa_id: number;
  voo_id: number;
  numero_etapa: number;
  sigvoos_leg_number: number | null;
  origem_icao: string | null;
  destino_icao: string | null;
  horario_motor_ligado: string | null;
  horario_decolagem: string | null;
  horario_pouso: string | null;
  horario_motor_desligado: string | null;
  tempo_decolagem_pouso: string | null;
  tempo_total: string | null;
  tempo_navegacao: string | null;
  tempo_ifr: string | null;
  tempo_noturno: string | null;
  pousos_diurnos: number | null;
  pousos_noturnos: number | null;
  starts: number | null;
  pax: number | null;
  payload: number | null;
  combustivel_inicio: number | null;
  combustivel_fim: number | null;
  unidade_combustivel: string | null;
  origem_dados: EtapaOrigemDados;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EtapaInput = Partial<{
  numero_etapa: number;
  origem_icao: string | null;
  destino_icao: string | null;
  horario_motor_ligado: string | null;
  horario_decolagem: string | null;
  horario_pouso: string | null;
  horario_motor_desligado: string | null;
  tempo_navegacao: string | null;
  tempo_ifr: string | null;
  tempo_noturno: string | null;
  pousos_diurnos: number | null;
  pousos_noturnos: number | null;
  starts: number | null;
  pax: number | null;
  payload: number | null;
  combustivel_inicio: number | null;
  combustivel_fim: number | null;
  unidade_combustivel: string | null;
}>;

export const ETAPA_SELECT = `
  id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number,
  origem_icao, destino_icao,
  horario_motor_ligado, horario_decolagem, horario_pouso, horario_motor_desligado,
  tempo_decolagem_pouso, tempo_total, tempo_navegacao, tempo_ifr, tempo_noturno,
  pousos_diurnos, pousos_noturnos, starts, pax, payload,
  combustivel_inicio, combustivel_fim, unidade_combustivel, origem_dados,
  created_by, updated_by, created_at, updated_at, deleted_at
`;

export const ETAPA_MUTABLE_FIELDS = [
  'numero_etapa',
  'origem_icao',
  'destino_icao',
  'horario_motor_ligado',
  'horario_decolagem',
  'horario_pouso',
  'horario_motor_desligado',
  'tempo_navegacao',
  'tempo_ifr',
  'tempo_noturno',
  'pousos_diurnos',
  'pousos_noturnos',
  'starts',
  'pax',
  'payload',
  'combustivel_inicio',
  'combustivel_fim',
  'unidade_combustivel',
] as const;

const ETAPA_DIFF_FIELDS = [
  ...ETAPA_MUTABLE_FIELDS,
  'tempo_decolagem_pouso',
  'tempo_total',
] as const;

const NUMERIC_ETAPA_FIELDS = new Set([
  'numero_etapa',
  'pousos_diurnos',
  'pousos_noturnos',
  'starts',
  'pax',
  'payload',
  'combustivel_inicio',
  'combustivel_fim',
]);

/** Aceita ISO-8601 completo ou HH:MM / HH:MM:SS (legado SIGVOOS). */
export function parseEtapaInstant(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = Date.parse(trimmed);
  if (!Number.isNaN(iso)) return new Date(iso);

  const hm = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!hm) return null;
  const hours = Number(hm[1]);
  const minutes = Number(hm[2]);
  const seconds = Number(hm[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  // Epoch-relative clock for duration math (midnight crossing handled below).
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds));
}

function minutesBetween(start: Date, end: Date): number {
  let diffMs = end.getTime() - start.getTime();
  // Clock-only HH:MM crossing midnight (same synthetic day).
  if (diffMs < 0 && start.getUTCFullYear() === 1970 && end.getUTCFullYear() === 1970) {
    diffMs += 24 * 60 * 60 * 1000;
  }
  return Math.round(diffMs / 60_000);
}

export function formatMinutesAsHhMm(totalMinutes: number): string {
  const safe = Math.max(0, totalMinutes);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function hhMmToDecimalHours(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const match = hhmm.trim().match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  return Number((Number(match[1]) + Number(match[2]) / 60).toFixed(2));
}

export function computeEtapaTempos(
  decolagem: string | null | undefined,
  pouso: string | null | undefined,
  motorLigado: string | null | undefined,
  motorDesligado: string | null | undefined,
): { tempo_decolagem_pouso: string | null; tempo_total: string | null } {
  let tempoDecolagemPouso: string | null = null;
  let tempoTotal: string | null = null;

  if (decolagem && pouso) {
    const start = parseEtapaInstant(decolagem);
    const end = parseEtapaInstant(pouso);
    if (start && end) {
      tempoDecolagemPouso = formatMinutesAsHhMm(minutesBetween(start, end));
    }
  }

  if (motorLigado && motorDesligado) {
    const start = parseEtapaInstant(motorLigado);
    const end = parseEtapaInstant(motorDesligado);
    if (start && end) {
      tempoTotal = formatMinutesAsHhMm(minutesBetween(start, end));
    }
  } else if (tempoDecolagemPouso) {
    tempoTotal = tempoDecolagemPouso;
  }

  return { tempo_decolagem_pouso: tempoDecolagemPouso, tempo_total: tempoTotal };
}

function assertTimeOrder(
  earlier: string | null | undefined,
  later: string | null | undefined,
  message: string,
  code: string,
): void {
  if (!earlier || !later) return;
  const a = parseEtapaInstant(earlier);
  const b = parseEtapaInstant(later);
  if (!a || !b) {
    throw new ApiError(`Horario invalido: ${message}`, 400, 'CONTROLE_VOOS_ETAPA_HORARIO_INVALIDO');
  }
  let diff = b.getTime() - a.getTime();
  if (diff < 0 && a.getUTCFullYear() === 1970 && b.getUTCFullYear() === 1970) {
    diff += 24 * 60 * 60 * 1000;
  }
  if (diff < 0) {
    throw new ApiError(message, 400, code);
  }
}

export function normalizeEtapaInput(payload: Record<string, unknown>): EtapaInput {
  const input: EtapaInput = {};
  for (const field of ETAPA_MUTABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    const raw = payload[field];
    if (NUMERIC_ETAPA_FIELDS.has(field)) {
      if (raw === null || raw === '') {
        (input as Record<string, unknown>)[field] = null;
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          throw new ApiError(
            `Campo numerico invalido: ${field}`,
            400,
            'CONTROLE_VOOS_ETAPA_INVALID_FIELD',
          );
        }
        (input as Record<string, unknown>)[field] = field === 'numero_etapa' ? Math.trunc(n) : n;
      }
      continue;
    }
    if (raw === null || raw === undefined) {
      (input as Record<string, unknown>)[field] = null;
      continue;
    }
    const text = String(raw).trim();
    if (text === '') {
      (input as Record<string, unknown>)[field] = null;
      continue;
    }
    if (field === 'origem_icao' || field === 'destino_icao') {
      (input as Record<string, unknown>)[field] = text.toUpperCase();
    } else {
      (input as Record<string, unknown>)[field] = text;
    }
  }
  return input;
}

export function validateEtapaInput(input: EtapaInput): void {
  if (
    input.numero_etapa != null &&
    (!Number.isInteger(input.numero_etapa) || input.numero_etapa < 1)
  ) {
    throw new ApiError(
      'numero_etapa deve ser inteiro >= 1',
      400,
      'CONTROLE_VOOS_ETAPA_NUMERO_INVALIDO',
    );
  }

  for (const field of [
    'pousos_diurnos',
    'pousos_noturnos',
    'starts',
    'pax',
    'payload',
    'combustivel_inicio',
    'combustivel_fim',
  ] as const) {
    const value = input[field];
    if (value != null && value < 0) {
      throw new ApiError(
        `${field} nao pode ser negativo`,
        400,
        'CONTROLE_VOOS_ETAPA_VALOR_NEGATIVO',
      );
    }
  }

  for (const field of [
    'horario_motor_ligado',
    'horario_decolagem',
    'horario_pouso',
    'horario_motor_desligado',
  ] as const) {
    const value = input[field];
    if (value != null && !parseEtapaInstant(value)) {
      throw new ApiError(
        `Horario invalido em ${field}`,
        400,
        'CONTROLE_VOOS_ETAPA_HORARIO_INVALIDO',
      );
    }
  }

  assertTimeOrder(
    input.horario_decolagem,
    input.horario_pouso,
    'Horario de pouso anterior a decolagem',
    'CONTROLE_VOOS_ETAPA_POUSO_ANTES_DECOLAGEM',
  );
  assertTimeOrder(
    input.horario_pouso,
    input.horario_motor_desligado,
    'Horario de corte (motor desligado) anterior ao pouso',
    'CONTROLE_VOOS_ETAPA_CORTE_ANTES_POUSO',
  );
  assertTimeOrder(
    input.horario_motor_ligado,
    input.horario_decolagem,
    'Horario de decolagem anterior ao motor ligado',
    'CONTROLE_VOOS_ETAPA_DECOLAGEM_ANTES_MOTOR',
  );

  if (
    input.combustivel_inicio != null &&
    input.combustivel_fim != null &&
    input.combustivel_fim > input.combustivel_inicio
  ) {
    throw new ApiError(
      'Combustivel fim maior que inicio (consumo incoerente)',
      400,
      'CONTROLE_VOOS_ETAPA_COMBUSTIVEL_INCOERENTE',
    );
  }
}

export function mergeEtapaInput(existing: EtapaRow, patch: EtapaInput): EtapaInput {
  const merged: EtapaInput = {};
  for (const field of ETAPA_MUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      (merged as Record<string, unknown>)[field] = patch[field];
    } else {
      (merged as Record<string, unknown>)[field] = existing[field];
    }
  }
  return merged;
}

export type FlightTotalsFromEtapas = {
  horario_decolagem_real: string | null;
  horario_pouso_real: string | null;
  horas_voadas: number | null;
  numero_pousos: number | null;
  ciclos: number | null;
  combustivel_decolagem: number | null;
  combustivel_pouso: number | null;
  combustivel_consumo: number | null;
  pob: number | null;
  carga_kg: number | null;
};

export function computeFlightTotalsFromEtapas(
  etapas: Array<
    Pick<
      EtapaRow,
      | 'horario_decolagem'
      | 'horario_pouso'
      | 'tempo_decolagem_pouso'
      | 'pousos_diurnos'
      | 'pousos_noturnos'
      | 'pax'
      | 'payload'
      | 'combustivel_inicio'
      | 'combustivel_fim'
    >
  >,
): FlightTotalsFromEtapas {
  if (etapas.length === 0) {
    return {
      horario_decolagem_real: null,
      horario_pouso_real: null,
      horas_voadas: null,
      numero_pousos: null,
      ciclos: null,
      combustivel_decolagem: null,
      combustivel_pouso: null,
      combustivel_consumo: null,
      pob: null,
      carga_kg: null,
    };
  }

  // First/last decolagem/pouso/combustível by chronological decolagem (not numero_etapa),
  // so reorder for PDF display does not invent incoherent RDV aggregates.
  const chronological = [...etapas].sort((a, b) => {
    const aStart = a.horario_decolagem ? parseEtapaInstant(a.horario_decolagem)?.getTime() : null;
    const bStart = b.horario_decolagem ? parseEtapaInstant(b.horario_decolagem)?.getTime() : null;
    if (aStart == null && bStart == null) return 0;
    if (aStart == null) return 1;
    if (bStart == null) return -1;
    return aStart - bStart;
  });

  const first = chronological[0];
  const last = chronological[chronological.length - 1];

  let totalMinutes = 0;
  let hasTempo = false;
  let pousos = 0;
  let hasPousos = false;
  let maxPax: number | null = null;
  let maxPayload: number | null = null;

  for (const etapa of etapas) {
    if (etapa.tempo_decolagem_pouso) {
      const hours = hhMmToDecimalHours(etapa.tempo_decolagem_pouso);
      if (hours != null) {
        totalMinutes += Math.round(hours * 60);
        hasTempo = true;
      }
    } else if (etapa.horario_decolagem && etapa.horario_pouso) {
      const start = parseEtapaInstant(etapa.horario_decolagem);
      const end = parseEtapaInstant(etapa.horario_pouso);
      if (start && end) {
        totalMinutes += minutesBetween(start, end);
        hasTempo = true;
      }
    }

    const diurnos = etapa.pousos_diurnos ?? 0;
    const noturnos = etapa.pousos_noturnos ?? 0;
    if (etapa.pousos_diurnos != null || etapa.pousos_noturnos != null) {
      pousos += diurnos + noturnos;
      hasPousos = true;
    }
    if (etapa.pax != null) maxPax = maxPax == null ? etapa.pax : Math.max(maxPax, etapa.pax);
    if (etapa.payload != null) {
      maxPayload = maxPayload == null ? etapa.payload : Math.max(maxPayload, etapa.payload);
    }
  }

  const combustivelDecolagem = first.combustivel_inicio;
  const combustivelPouso = last.combustivel_fim;
  let combustivelConsumo: number | null = null;
  if (combustivelDecolagem != null && combustivelPouso != null) {
    combustivelConsumo = Number((combustivelDecolagem - combustivelPouso).toFixed(3));
  }

  return {
    horario_decolagem_real: first.horario_decolagem,
    horario_pouso_real: last.horario_pouso,
    horas_voadas: hasTempo ? Number((totalMinutes / 60).toFixed(2)) : null,
    numero_pousos: hasPousos ? pousos : null,
    ciclos: hasPousos ? pousos : null,
    combustivel_decolagem: combustivelDecolagem,
    combustivel_pouso: combustivelPouso,
    combustivel_consumo: combustivelConsumo,
    pob: maxPax,
    carga_kg: maxPayload,
  };
}

export async function listEtapas(
  db: D1Database,
  empresaId: number,
  vooId: number,
): Promise<EtapaRow[]> {
  const { results } = await db
    .prepare(
      `
      SELECT ${ETAPA_SELECT}
      FROM cv_voo_etapas
      WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
      ORDER BY numero_etapa ASC, id ASC
    `,
    )
    .bind(vooId, empresaId)
    .all<EtapaRow>();
  return results || [];
}

export async function getEtapaOrThrow(
  db: D1Database,
  empresaId: number,
  vooId: number,
  etapaId: number,
): Promise<EtapaRow> {
  const row = await db
    .prepare(
      `
      SELECT ${ETAPA_SELECT}
      FROM cv_voo_etapas
      WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(etapaId, vooId, empresaId)
    .first<EtapaRow>();
  if (!row) {
    throw new ApiError('Etapa nao encontrada', 404, 'CONTROLE_VOOS_ETAPA_NOT_FOUND');
  }
  return row;
}

export type EtapaEditMode = 'pilot' | 'coordenacao';

export async function assertEtapaEditable(
  c: Context<{ Bindings: Env }>,
  rdv: RdvRow,
  mode: EtapaEditMode,
  justificativa?: unknown,
): Promise<string | null> {
  if (mode === 'pilot') {
    const allowed: RdvWorkflowStatus[] = ['rascunho', 'devolvido'];
    if (!allowed.includes(rdv.workflow_status)) {
      throw new ApiError(
        `Etapas so podem ser editadas pelo piloto em rascunho/devolvido (atual: ${rdv.workflow_status})`,
        409,
        'CONTROLE_VOOS_ETAPA_WORKFLOW_BLOQUEADO',
      );
    }
    return null;
  }

  if (rdv.workflow_status !== 'em_revisao') {
    throw new ApiError(
      `Correcao de etapas pela Coordenacao so e permitida em em_revisao (atual: ${rdv.workflow_status})`,
      409,
      'CONTROLE_VOOS_ETAPA_WORKFLOW_BLOQUEADO',
    );
  }
  if (!(await hasRdvCapability(c, RDV_CAPABILITIES.corrigir))) {
    throw new ApiError(
      `Permissao insuficiente (${RDV_CAPABILITIES.corrigir})`,
      403,
      'CONTROLE_VOOS_RDV_RBAC_FORBIDDEN',
    );
  }
  const text = typeof justificativa === 'string' ? justificativa.trim() : '';
  if (!text) {
    throw new ApiError(
      'justificativa e obrigatoria para correcao de etapa pela Coordenacao',
      400,
      'CONTROLE_VOOS_RDV_JUSTIFICATIVA_OBRIGATORIA',
    );
  }
  return text;
}

export async function resolveEtapaEditMode(
  c: Context<{ Bindings: Env }>,
  rdv: RdvRow,
  explicitMode?: unknown,
): Promise<EtapaEditMode> {
  if (explicitMode === 'coordenacao' || explicitMode === 'pilot') {
    return explicitMode;
  }
  if (
    rdv.workflow_status === 'em_revisao' &&
    (await hasRdvCapability(c, RDV_CAPABILITIES.corrigir))
  ) {
    return 'coordenacao';
  }
  return 'pilot';
}

/** Optimistic lock: valida `versao` esperada e incrementa atomicamente. */
export async function bumpRdvVersion(
  db: D1Database,
  empresaId: number,
  rdv: RdvRow,
  expectedVersion: unknown,
  userId: number | string | null,
): Promise<number> {
  assertRdvVersion(rdv, expectedVersion);
  const novaVersao = rdv.versao + 1;
  const result = await db
    .prepare(
      `
      UPDATE cv_rdv_operacional
      SET versao = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ? AND versao = ? AND deleted_at IS NULL
    `,
    )
    .bind(novaVersao, userId, rdv.id, empresaId, rdv.versao)
    .run();

  if (!result.meta.changes) {
    throw new ApiError(
      'Versao do RDV desatualizada. Recarregue os dados antes de continuar.',
      409,
      'CONTROLE_VOOS_RDV_VERSION_CONFLICT',
    );
  }
  return novaVersao;
}

export async function syncRdvAggregatesFromEtapas(
  db: D1Database,
  empresaId: number,
  rdvId: number,
  userId: number | string | null,
): Promise<FlightTotalsFromEtapas> {
  const rdv = await db
    .prepare(
      `SELECT id, voo_id FROM cv_rdv_operacional WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(rdvId, empresaId)
    .first<{ id: number; voo_id: number }>();
  if (!rdv) {
    throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');
  }

  const etapas = await listEtapas(db, empresaId, rdv.voo_id);
  const totals = computeFlightTotalsFromEtapas(etapas);

  await db
    .prepare(
      `
      UPDATE cv_rdv_operacional
      SET horario_decolagem_real = ?,
          horario_pouso_real = ?,
          horas_voadas = ?,
          numero_pousos = ?,
          ciclos = ?,
          combustivel_decolagem = ?,
          combustivel_pouso = ?,
          combustivel_consumo = ?,
          pob = ?,
          carga_kg = ?,
          updated_by = ?,
          updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ?
    `,
    )
    .bind(
      totals.horario_decolagem_real,
      totals.horario_pouso_real,
      totals.horas_voadas,
      totals.numero_pousos,
      totals.ciclos,
      totals.combustivel_decolagem,
      totals.combustivel_pouso,
      totals.combustivel_consumo,
      totals.pob,
      totals.carga_kg,
      userId,
      rdvId,
      empresaId,
    )
    .run();

  return totals;
}

export async function recordEtapaRevisions(params: {
  db: D1Database;
  empresaId: number;
  rdvId: number;
  versao: number;
  etapaId: number;
  before: object;
  after: object;
  usuarioId: number | string | null;
  justificativa: string;
  estadoAnterior: string;
  estadoNovo: string;
  /** Extra campos além dos operacionais (ex.: ordem, deleted_at). */
  extraFields?: readonly string[];
}): Promise<number> {
  const {
    db,
    empresaId,
    rdvId,
    versao,
    etapaId,
    before,
    after,
    usuarioId,
    justificativa,
    estadoAnterior,
    estadoNovo,
    extraFields = [],
  } = params;
  let changed = 0;
  const fields = [...ETAPA_DIFF_FIELDS, ...extraFields];

  for (const field of fields) {
    const previousValue = Reflect.get(before, field) ?? null;
    const nextValue = Reflect.get(after, field) ?? null;
    if (String(previousValue ?? '') === String(nextValue ?? '')) continue;

    changed += 1;
    await db
      .prepare(
        `
        INSERT INTO cv_rdv_revisoes (
          empresa_id, rdv_id, versao, entidade, registro_id, campo,
          valor_anterior, valor_novo, usuario_id, justificativa,
          estado_anterior, estado_novo, created_at
        ) VALUES (?, ?, ?, 'etapa', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      )
      .bind(
        empresaId,
        rdvId,
        versao,
        etapaId,
        field,
        previousValue === null ? null : String(previousValue),
        nextValue === null ? null : String(nextValue),
        usuarioId,
        justificativa,
        estadoAnterior,
        estadoNovo,
      )
      .run();
  }

  return changed;
}

export async function nextNumeroEtapa(
  db: D1Database,
  empresaId: number,
  vooId: number,
): Promise<number> {
  const row = await db
    .prepare(
      `
      SELECT COALESCE(MAX(numero_etapa), 0) AS max_num
      FROM cv_voo_etapas
      WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
    `,
    )
    .bind(vooId, empresaId)
    .first<{ max_num: number }>();
  return Number(row?.max_num ?? 0) + 1;
}
