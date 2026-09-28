import type { D1Database } from '@cloudflare/workers-types';
import {
  fetchControleVoosOperationalRecords,
  type ControleVoosOperationalRecord,
} from './controle-voos-source';
import { buildCanonicalOperationalSourceSql } from './frms-source-policy';

export type FrmsOperationalDataSource =
  | 'CONTROLE_VOOS'
  | 'SIGVOOS'
  | 'CONTROLE_VOOS_COM_FALLBACK_SIGVOOS'
  | 'AUSENTE';

export interface PreferredOperationalJourney {
  data: string;
  tripulante_id: number;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_voo_minutos: number;
  duracao_jornada_minutos: number;
  hora_primeiro_acionamento: string | null;
  hora_primeira_decolagem: string | null;
  hora_ultimo_pouso: string | null;
  hora_corte_motor: string | null;
  operational_data_source: Exclude<FrmsOperationalDataSource, 'AUSENTE'>;
}

export interface LegacySigvoosOperationalJourney {
  data?: string;
  tripulante_id?: number;
  /** Compatibility aliases used by existing snapshot read-models/tests. */
  data_operacional?: string;
  funcionario_id?: number;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_voo_minutos: number;
  duracao_jornada_minutos: number;
  hora_primeiro_acionamento?: string | null;
  hora_primeira_decolagem?: string | null;
  hora_ultimo_pouso?: string | null;
  hora_corte_motor?: string | null;
}

function normalizeTime(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    ?? text.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function clockMinutes(value: string | null): number | null {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

function shiftClock(value: string | null | undefined, deltaMinutes: number): string | null {
  const normalized = normalizeTime(value);
  const minutes = clockMinutes(normalized);
  if (minutes == null) return null;
  const shifted = ((minutes + deltaMinutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(shifted / 60)).padStart(2, '0')}:${String(shifted % 60).padStart(2, '0')}`;
}

function boundaryDuration(start: string | null, end: string | null): number {
  const a = clockMinutes(start);
  const b = clockMinutes(end);
  if (a == null || b == null) return 0;
  return b >= a ? b - a : b + 1440 - a;
}

function isNativeControleVoos(record: ControleVoosOperationalRecord): boolean {
  return record.origemDados === 'manual_interno' || record.origemDados === 'editado_airtrust';
}

function usableRecord(record: ControleVoosOperationalRecord): boolean {
  if (record.cancelado || record.statusOperacional === 'EXCLUIDO' || record.statusOperacional === 'DUPLICADO') return false;
  if (record.qualidadeDado === 'pendente_mapeamento' || record.qualidadeDado === 'divergente') return false;
  return Boolean(
    record.horaApresentacao || record.horaDispensa || record.horaMotorLigado ||
    record.horaDecolagem || record.horaPouso || record.horaMotorDesligado ||
    record.minutosVoo > 0 || Number(record.minutosTotal || 0) > 0,
  );
}

function earliest(values: Array<string | null | undefined>): string | null {
  const normalized = values.map(normalizeTime).filter((v): v is string => Boolean(v));
  return normalized.sort((a, b) => (clockMinutes(a) ?? 0) - (clockMinutes(b) ?? 0))[0] ?? null;
}

function latest(values: Array<string | null | undefined>, start: string | null): string | null {
  const normalized = values.map(normalizeTime).filter((v): v is string => Boolean(v));
  if (!normalized.length) return null;
  const startMin = clockMinutes(start);
  if (startMin != null) {
    return normalized.sort((a, b) => {
      const am = clockMinutes(a) ?? 0;
      const bm = clockMinutes(b) ?? 0;
      const aa = am < startMin ? am + 1440 : am;
      const bb = bm < startMin ? bm + 1440 : bm;
      return aa - bb;
    }).at(-1) ?? null;
  }
  return normalized.sort((a, b) => (clockMinutes(a) ?? 0) - (clockMinutes(b) ?? 0)).at(-1) ?? null;
}

function aggregateCv(records: readonly ControleVoosOperationalRecord[]): LegacySigvoosOperationalJourney | null {
  const usable = records.filter(usableRecord);
  if (usable.length === 0) return null;
  const first = usable[0];
  const hora_primeiro_acionamento = earliest(usable.map((r) => r.horaMotorLigado));
  const hora_primeira_decolagem = earliest(usable.map((r) => r.horaDecolagem));
  const boundaryAnchor = hora_primeiro_acionamento ?? earliest(usable.map((r) => r.horaApresentacao ?? r.horaDecolagem));
  const hora_corte_motor = latest(usable.map((r) => r.horaMotorDesligado), boundaryAnchor);
  const hora_apresentacao =
    shiftClock(hora_primeiro_acionamento, -30) ??
    earliest(usable.map((r) => r.horaApresentacao ?? r.horaDecolagem));
  const hora_termino =
    shiftClock(hora_corte_motor, 30) ??
    latest(usable.map((r) => r.horaDispensa ?? r.horaPouso), hora_apresentacao);
  const hora_ultimo_pouso = latest(usable.map((r) => r.horaPouso), hora_apresentacao);
  const horas_voo_minutos = usable.reduce((sum, r) => sum + Math.max(0, Number(r.minutosVoo || 0)), 0);
  const totalMin = usable.reduce((sum, r) => sum + Math.max(0, Number(r.minutosTotal || 0)), 0);
  const duracao_jornada_minutos = boundaryDuration(hora_apresentacao, hora_termino) || totalMin;
  return {
    data: first.dataOperacional,
    tripulante_id: first.tripulanteId,
    hora_apresentacao,
    hora_termino,
    horas_voo_minutos,
    duracao_jornada_minutos,
    hora_primeiro_acionamento,
    hora_primeira_decolagem,
    hora_ultimo_pouso,
    hora_corte_motor,
  };
}

function groupCv(records: readonly ControleVoosOperationalRecord[], nativeOnly: boolean) {
  const grouped = new Map<string, ControleVoosOperationalRecord[]>();
  for (const record of records) {
    if (nativeOnly !== isNativeControleVoos(record)) continue;
    const key = `${record.dataOperacional}::${record.tripulanteId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }
  return grouped;
}

function groupSigvoos(rows: readonly LegacySigvoosOperationalJourney[]) {
  const grouped = new Map<string, LegacySigvoosOperationalJourney[]>();
  for (const row of rows) {
    const data = String(row.data ?? row.data_operacional ?? '');
    const tripulanteId = Number(row.tripulante_id ?? row.funcionario_id ?? 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isInteger(tripulanteId) || tripulanteId <= 0) continue;
    const normalized: LegacySigvoosOperationalJourney = { ...row, data, tripulante_id: tripulanteId };
    const key = `${data}::${tripulanteId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), normalized]);
  }
  const out = new Map<string, LegacySigvoosOperationalJourney>();
  for (const [key, items] of grouped) {
    const firstEngineStart = earliest(items.map((r) => r.hora_primeiro_acionamento ?? null));
    const rawStart = earliest(items.map((r) => r.hora_apresentacao));
    const cutoff = latest(items.map((r) => r.hora_corte_motor ?? null), firstEngineStart ?? rawStart);
    const start = shiftClock(firstEngineStart, -30) ?? rawStart;
    const end = shiftClock(cutoff, 30) ?? latest(items.map((r) => r.hora_termino), start);
    out.set(key, {
      data: String(items[0].data),
      tripulante_id: Number(items[0].tripulante_id),
      hora_apresentacao: start,
      hora_termino: end,
      horas_voo_minutos: items.reduce((sum, r) => sum + Math.max(0, Number(r.horas_voo_minutos || 0)), 0),
      duracao_jornada_minutos: Math.max(
        boundaryDuration(start, end),
        ...items.map((r) => Math.max(0, Number(r.duracao_jornada_minutos || 0))),
      ),
      hora_primeiro_acionamento: earliest(items.map((r) => r.hora_primeiro_acionamento ?? null)),
      hora_primeira_decolagem: earliest(items.map((r) => r.hora_primeira_decolagem ?? null)),
      hora_ultimo_pouso: latest(items.map((r) => r.hora_ultimo_pouso ?? null), start),
      hora_corte_motor: latest(items.map((r) => r.hora_corte_motor ?? null), start),
    });
  }
  return out;
}

function chooseText(preferred: string | null | undefined, fallback: string | null | undefined, mark: () => void) {
  if (preferred) return preferred;
  if (fallback) mark();
  return fallback ?? null;
}

function chooseNumber(preferred: number | null | undefined, fallback: number | null | undefined, mark: () => void) {
  if (preferred != null && preferred > 0) return preferred;
  if (fallback != null && fallback > 0) mark();
  return Math.max(0, Number(fallback ?? preferred ?? 0));
}

export function resolvePreferredOperationalJourneys(
  cvRecords: readonly ControleVoosOperationalRecord[],
  sigvoosRows: readonly LegacySigvoosOperationalJourney[],
): PreferredOperationalJourney[] {
  const nativeCv = groupCv(cvRecords, true);
  const importedCv = groupCv(cvRecords, false);
  const sig = groupSigvoos(sigvoosRows);
  const keys = new Set([...nativeCv.keys(), ...importedCv.keys(), ...sig.keys()]);
  const out: PreferredOperationalJourney[] = [];

  for (const key of keys) {
    const primary = aggregateCv(nativeCv.get(key) ?? []);
    const fallback = sig.get(key) ?? aggregateCv(importedCv.get(key) ?? []);
    if (!primary && !fallback) continue;
    if (!primary && fallback) {
      out.push({
        ...fallback, data: String(fallback.data), tripulante_id: Number(fallback.tripulante_id),
        hora_primeiro_acionamento: fallback.hora_primeiro_acionamento ?? null,
        hora_primeira_decolagem: fallback.hora_primeira_decolagem ?? null,
        hora_ultimo_pouso: fallback.hora_ultimo_pouso ?? null,
        hora_corte_motor: fallback.hora_corte_motor ?? null,
        operational_data_source: 'SIGVOOS',
      });
      continue;
    }
    if (primary && !fallback) {
      out.push({
        ...primary, data: String(primary.data), tripulante_id: Number(primary.tripulante_id),
        hora_primeiro_acionamento: primary.hora_primeiro_acionamento ?? null,
        hora_primeira_decolagem: primary.hora_primeira_decolagem ?? null,
        hora_ultimo_pouso: primary.hora_ultimo_pouso ?? null,
        hora_corte_motor: primary.hora_corte_motor ?? null,
        operational_data_source: 'CONTROLE_VOOS',
      });
      continue;
    }

    const p = primary!;
    const f = fallback!;
    let usedFallback = false;
    const markFallback = () => { usedFallback = true; };
    out.push({
      data: String(p.data),
      tripulante_id: Number(p.tripulante_id),
      hora_apresentacao: chooseText(p.hora_apresentacao, f.hora_apresentacao, markFallback),
      hora_termino: chooseText(p.hora_termino, f.hora_termino, markFallback),
      horas_voo_minutos: chooseNumber(p.horas_voo_minutos, f.horas_voo_minutos, markFallback),
      duracao_jornada_minutos: chooseNumber(p.duracao_jornada_minutos, f.duracao_jornada_minutos, markFallback),
      hora_primeiro_acionamento: chooseText(p.hora_primeiro_acionamento, f.hora_primeiro_acionamento, markFallback),
      hora_primeira_decolagem: chooseText(p.hora_primeira_decolagem, f.hora_primeira_decolagem, markFallback),
      hora_ultimo_pouso: chooseText(p.hora_ultimo_pouso, f.hora_ultimo_pouso, markFallback),
      hora_corte_motor: chooseText(p.hora_corte_motor, f.hora_corte_motor, markFallback),
      operational_data_source: usedFallback ? 'CONTROLE_VOOS_COM_FALLBACK_SIGVOOS' : 'CONTROLE_VOOS',
    });
  }

  return out.sort((a, b) => a.data.localeCompare(b.data) || a.tripulante_id - b.tripulante_id);
}

export async function loadPreferredOperationalJourneys(
  db: D1Database,
  empresaId: number,
  from: string,
  to: string,
): Promise<PreferredOperationalJourney[]> {
  if (!Number.isInteger(empresaId) || empresaId <= 0) throw new Error('INVALID_TENANT');
  const canonical = buildCanonicalOperationalSourceSql('j.origem');

  const legacyPromise = db.prepare(
    `SELECT CAST(j.tripulante_id AS INTEGER) AS tripulante_id,
            j.data,
            j.hora_apresentacao,
            COALESCE(j.hora_termino, j.hora_corte_motor, j.hora_ultimo_pouso) AS hora_termino,
            COALESCE(j.horas_voo_minutos, 0) AS horas_voo_minutos,
            COALESCE(j.duracao_jornada_minutos, 0) AS duracao_jornada_minutos,
            j.hora_primeiro_acionamento,
            j.hora_primeira_decolagem,
            j.hora_ultimo_pouso,
            j.hora_corte_motor
       FROM frms_jornada j
       JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
      WHERE j.deleted_at IS NULL AND f.deleted_at IS NULL AND f.empresa_id = ?
        AND j.data BETWEEN ? AND ? AND ${canonical}`,
  ).bind(empresaId, from, to).all<LegacySigvoosOperationalJourney>();

  const [legacyResult, cvResult] = await Promise.allSettled([
    legacyPromise,
    fetchControleVoosOperationalRecords(db, empresaId, from, to),
  ]);

  if (legacyResult.status === 'rejected') {
    console.warn('[FRMS] SIGVOOS fallback unavailable; using Controle de Voos only', {
      empresaId,
      from,
      to,
      error: legacyResult.reason instanceof Error
        ? legacyResult.reason.message
        : String(legacyResult.reason ?? ''),
    });
  }
  if (cvResult.status === 'rejected') {
    console.warn('[FRMS] Controle de Voos unavailable; using SIGVOOS fallback', {
      empresaId,
      from,
      to,
      error: cvResult.reason instanceof Error
        ? cvResult.reason.message
        : String(cvResult.reason ?? ''),
    });
  }

  if (legacyResult.status === 'rejected' && cvResult.status === 'rejected') {
    throw new Error('FRMS_OPERATIONAL_SOURCES_UNAVAILABLE');
  }

  const legacyRows = legacyResult.status === 'fulfilled' ? legacyResult.value.results ?? [] : [];
  const cvRecords = cvResult.status === 'fulfilled' ? cvResult.value : [];
  return resolvePreferredOperationalJourneys(cvRecords, legacyRows);
}
