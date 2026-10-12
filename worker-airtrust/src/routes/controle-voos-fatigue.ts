import type { Context } from 'hono';
import type { Env } from '../types';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaIdSafe, getFlightOrThrow } from '../repositories/controle-voos/rdv-repository';
import { listFrmsOperationalSnapshot, type FrmsOperationalSnapshotItem } from '../lib/frms/operational-snapshot';

type CrewRow = { funcionario_id: number; nome: string; funcao: string };

export type FlightFatigueSummary = {
  funcionario_id: number;
  nome: string;
  funcao: string;
  checkin: 'RECEBIDO' | 'PENDENTE' | 'AUSENTE' | 'NAO_APLICAVEL';
  estado: string;
  fonte: string;
  score_fadiga: number | null;
  efetividade_pct: number | null;
  status_quinzena: string | null;
  tendencia: string | null;
  decisao: string | null;
  acao_recomendada: string | null;
  alertas: string[];
  dados_disponiveis: boolean;
};

/** Return only the operational decision fields. Never expose private answers (sleep, KSS, symptoms). */
export function projectFlightFatigue(
  crew: CrewRow[],
  snapshot: FrmsOperationalSnapshotItem[],
): FlightFatigueSummary[] {
  const byId = new Map<number, FrmsOperationalSnapshotItem>();
  for (const item of snapshot) {
    if (!byId.has(item.funcionario_id)) byId.set(item.funcionario_id, item);
  }
  return crew.map(({ funcionario_id, nome, funcao }) => {
    const item = byId.get(funcionario_id);
    if (!item) return {
      funcionario_id, nome, funcao, checkin: 'AUSENTE' as const,
      estado: 'NAO_AVALIADO', fonte: 'AUSENTE',
      score_fadiga: null, efetividade_pct: null,
      status_quinzena: null, tendencia: null, decisao: null,
      acao_recomendada: null, alertas: [], dados_disponiveis: false,
    };
    return {
      funcionario_id, nome, funcao,
      checkin: item.checkin_status,
      estado: item.estado_operacional,
      fonte: item.jornada_data_source,
      score_fadiga: item.fadiga_score,
      efetividade_pct: item.effectiveness_pct,
      status_quinzena: item.fortnight_indicator?.status_quinzena ?? null,
      tendencia: item.fortnight_indicator?.tendencia ?? null,
      decisao: item.fortnight_indicator?.decisao ?? null,
      acao_recomendada: item.acao_recomendada_texto || null,
      alertas: item.alertas,
      dados_disponiveis: true,
    };
  });
}

/** Protected by auth + controle_voos.edit at route registration; scoped to the flight tenant. */
export async function getFlightFatigueHandler(c: Context<{ Bindings: Env }>) {
  const empresaId = getEmpresaIdSafe(c);
  const id = c.req.param('id');
  if (!id || !/^\d+$/.test(id)) throw new ApiError('Voo não encontrado', 404, 'CONTROLE_VOOS_FLIGHT_NOT_FOUND');
  const flight = await getFlightOrThrow(c.env.DB, id, empresaId);
  const date = String(flight.data_programacao).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError('Data operacional inválida', 422, 'CONTROLE_VOOS_FLIGHT_INVALID_DATE');
  }
  const result = await c.env.DB.prepare(
    `SELECT t.funcionario_id, f.nome, t.funcao
       FROM cv_voo_tripulantes t
       JOIN funcionarios f ON f.id = t.funcionario_id
          AND f.empresa_id = t.empresa_id AND f.deleted_at IS NULL
      WHERE t.empresa_id = ? AND t.voo_id = ? AND t.deleted_at IS NULL
      ORDER BY CASE t.funcao WHEN 'PIC' THEN 0 WHEN 'SIC' THEN 1 ELSE 2 END, t.id`,
  ).bind(empresaId, Number(flight.id)).all<CrewRow>();
  const crew = result.results ?? [];
  if (crew.length === 0) return c.json({ success: true, data: { date, tripulantes: [] } });

  // Never convert missing FRMS evidence or unavailable configuration into "OK".
  const snapshot = await listFrmsOperationalSnapshot(c.env.DB, {
    empresaId, dataInicio: date, dataFim: date,
    filters: { include_inconsistencies: true },
  });
  return c.json({
    success: true,
    data: { date, tripulantes: projectFlightFatigue(crew, snapshot.items) },
  });
}
