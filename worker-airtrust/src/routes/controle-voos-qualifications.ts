import type { Context } from 'hono';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import { getEmpresaIdSafe, getFlightOrThrow } from '../repositories/controle-voos/rdv-repository';
import { getQualificacoesVencimentoExpr } from '../utils/qualificacoes-alerta-config';

type QualificationRow = {
  funcionario_id: number;
  registro_id: number;
  codigo: string;
  nome: string;
  data_conclusao: string | null;
  data_vencimento: string | null;
};
export type FlightQualificationIssue = {
  nome: string;
  codigo: string;
  vencimento: string | null;
  status: 'VENCIDA' | 'VENCENDO' | 'SEM_VALIDADE';
};
export type FlightQualifications = {
  funcionario_id: number;
  total_registros_atuais: number;
  validas: number;
  vencendo: number;
  vencidas: number;
  sem_validade: number;
  avisos: FlightQualificationIssue[];
};

function addCalendarDays(iso: string, days: number): string {
  const dt = new Date(iso + 'T00:00:00.000Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Registered qualification validity only; never infers full flight eligibility. */
export function summarizeFlightQualifications(
  ids: number[],
  entries: QualificationRow[],
  flightDate: string,
): FlightQualifications[] {
  const limit = addCalendarDays(flightDate, 30);
  const byMember = new Map<number, Map<string, QualificationRow>>();
  const crew = new Set(ids);
  // Records arrive most-recent-first. Older realizations must not make a
  // renewed qualification falsely appear expired.
  for (const record of entries) {
    if (!crew.has(record.funcionario_id) || !record.data_conclusao ||
      record.data_conclusao.slice(0, 10) > flightDate) continue;
    const entriesForCrew = byMember.get(record.funcionario_id) ?? new Map<string, QualificationRow>();
    if (!entriesForCrew.has(record.codigo)) entriesForCrew.set(record.codigo, record);
    byMember.set(record.funcionario_id, entriesForCrew);
  }

  return ids.map((funcionario_id) => {
    const current = [...(byMember.get(funcionario_id)?.values() ?? [])];
    const avisos: FlightQualificationIssue[] = [];
    let validas = 0, vencendo = 0, vencidas = 0, sem_validade = 0;
    for (const item of current) {
      const expiry = item.data_vencimento?.slice(0, 10) || null;
      if (!expiry) { sem_validade++; avisos.push({ nome: item.nome, codigo: item.codigo, vencimento: null, status: 'SEM_VALIDADE' }); }
      else if (expiry < flightDate) { vencidas++; avisos.push({ nome: item.nome, codigo: item.codigo, vencimento: expiry, status: 'VENCIDA' }); }
      else if (expiry <= limit) { vencendo++; avisos.push({ nome: item.nome, codigo: item.codigo, vencimento: expiry, status: 'VENCENDO' }); }
      else validas++;
    }
    return {
      funcionario_id, total_registros_atuais: current.length,
      validas, vencendo, vencidas, sem_validade, avisos: avisos.slice(0, 12),
    };
  });
}

/** Protected by auth and controle_voos.edit; only crew of the tenant's flight. */
export async function getFlightQualificationsHandler(c: Context<{ Bindings: Env }>) {
  const empresaId = getEmpresaIdSafe(c);
  const id = c.req.param('id');
  if (!id || !/^\d+$/.test(id)) throw new ApiError('Voo não encontrado', 404, 'CONTROLE_VOOS_FLIGHT_NOT_FOUND');
  const flight = await getFlightOrThrow(c.env.DB, id, empresaId);
  const date = String(flight.data_programacao).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError('Data operacional inválida', 422, 'CONTROLE_VOOS_FLIGHT_INVALID_DATE');
  }
  const crew = await c.env.DB.prepare(
    `SELECT funcionario_id FROM cv_voo_tripulantes
      WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL`,
  ).bind(empresaId, Number(flight.id)).all<{ funcionario_id: number }>();
  const ids = [...new Set((crew.results ?? []).map((row) => Number(row.funcionario_id)))];
  if (!ids.length) return c.json({ success: true, data: { date, tripulantes: [] } });
  const parameters = ids.map(() => '?').join(', ');
  const expiry = getQualificacoesVencimentoExpr('qh', 'qt');
  const result = await c.env.DB.prepare(
    `SELECT qh.funcionario_id, qh.id AS registro_id,
      COALESCE(NULLIF(TRIM(qt.codigo), ''), NULLIF(TRIM(qh.qualificacao_codigo), ''), CAST(qh.qualificacao_id AS TEXT), NULLIF(TRIM(qh.tipo), ''), CAST(qh.id AS TEXT)) AS codigo,
      COALESCE(NULLIF(TRIM(qt.nome), ''), NULLIF(TRIM(qh.tipo), ''), 'Qualificação') AS nome,
      qh.data_conclusao, ${expiry} AS data_vencimento
    FROM qualificacoes_historico qh
    LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
       AND qt.empresa_id = qh.empresa_id AND qt.deleted_at IS NULL
    WHERE qh.empresa_id = ?
      AND qh.funcionario_id IN (${parameters})
      AND qh.deleted_at IS NULL
      AND qh.data_conclusao IS NOT NULL
      AND date(qh.data_conclusao) <= date(?)
      AND UPPER(COALESCE(qh.status, '')) NOT IN ('CANCELADA', 'CANCELADO', 'PLANEJADA', 'PLANEJADO')
    ORDER BY qh.funcionario_id, qh.data_conclusao DESC, qh.id DESC`,
  ).bind(empresaId, ...ids, date).all<QualificationRow>();
  return c.json({
    success: true,
    data: {
      date, tripulantes: summarizeFlightQualifications(ids, result.results ?? [], date),
      info: 'Somente validades de qualificações registradas; requisitos obrigatórios ausentes não estão avaliados.',
    },
  });
}
