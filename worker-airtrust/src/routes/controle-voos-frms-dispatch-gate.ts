/**
 * Painel consultivo FRMS da Coordenação para voos programados.
 * Os alertas FRMS nao bloqueiam POST /voos/:id/status: a transicao continua
 * sob RBAC, tenant, versao e regras proprias do Controle de Voos.
 * Este endpoint mantem somente dados operacionais sanitizados.
 */
import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import { getEmpresaIdSafe } from '../repositories/controle-voos/rdv-repository';
import { RDV_CAPABILITIES, requireRdvCapability } from '../services/controle-voos/rdv-workflow';
import {
  assessFlightDispatchGate,
  loadDispatchGateSnapshotIndex,
  type DispatchReadinessStatus,
} from '../services/controle-voos/frms-dispatch-gate';

const controleVoosDispatchGate = new Hono<{ Bindings: Env }>();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateParam(value: string | undefined | null): string {
  if (!value || !DATE_PATTERN.test(value)) {
    throw new ApiError(
      'Parametro data invalido (YYYY-MM-DD)',
      400,
      'CONTROLE_VOOS_OPERACIONAL_INVALID_DATE',
    );
  }
  return value;
}

function statusPriority(status: DispatchReadinessStatus): number {
  if (status === 'NAO_LIBERADO') return 0;
  if (status === 'ATENCAO_COORDENACAO') return 1;
  return 2;
}

interface FlightRowForGate {
  id: number;
  prefixo: string;
  status: string;
  data_programacao: string;
  horario_previsto_partida: string;
  aeronave_id: number | null;
  modelo_aeronave: string | null;
}

/**
 * GET /api/controle-voos/operacional?data=YYYY-MM-DD
 *
 * Resposta resumida por voo: nao mostra KSS/WOCL/rolling/thresholds —
 * apenas o estado operacional (LIBERAVEL/ATENCAO_COORDENACAO/NAO_LIBERADO),
 * o motivo principal e a tripulação sanitizada. Detalhe técnico fica no
 * drill-down (fora do escopo mínimo desta rota).
 */
controleVoosDispatchGate.get(
  '/operacional',
  auth(),
  requireRdvCapability(RDV_CAPABILITIES.visualizarTodos),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const data = normalizeDateParam(c.req.query('data'));

    const flightsResult = await c.env.DB.prepare(
      `SELECT v.id, v.prefixo, v.status, v.data_programacao, v.horario_previsto_partida, v.aeronave_id,
         a.modelo AS modelo_aeronave
       FROM cv_voos v
       LEFT JOIN aeronaves a ON a.id = v.aeronave_id
         AND a.empresa_id = v.empresa_id AND a.deleted_at IS NULL
       WHERE v.empresa_id = ? AND v.data_programacao = ? AND v.deleted_at IS NULL
       ORDER BY v.horario_previsto_partida ASC, v.id ASC`,
    )
      .bind(empresaId, data)
      .all<FlightRowForGate>();

    const flights = flightsResult.results || [];
    const snapshotIndex = await loadDispatchGateSnapshotIndex(c.env.DB, empresaId, data);

    const items = await Promise.all(
      flights.map(async (voo) => {
        const assessment = await assessFlightDispatchGate(
          c.env.DB,
          empresaId,
          voo.id,
          data,
          snapshotIndex,
        );

        return {
          voo_id: voo.id,
          prefixo: voo.prefixo,
          modelo_aeronave: voo.modelo_aeronave,
          status: voo.status,
          horario_previsto_partida: voo.horario_previsto_partida,
          aeronave_id: voo.aeronave_id,
          frms_status: assessment.frms_status,
          frms_primary_reason: assessment.frms_primary_reason,
          last_evaluated_at: assessment.evaluated_at,
          tripulacao: assessment.crew,
        };
      }),
    );

    const ordered = [...items].sort(
      (a, b) => statusPriority(a.frms_status) - statusPriority(b.frms_status),
    );

    const resumo = {
      voos_nao_liberados: items.filter((item) => item.frms_status === 'NAO_LIBERADO').length,
      // Um tripulante pode aparecer em vários voos da data; o card conta
      // pessoas distintas, não ocorrências de tripulação por voo.
      tripulantes_checkin_pendente: new Set(
        items.flatMap((item) =>
          item.tripulacao
            .filter((membro) => membro.checkin_status !== 'RECEBIDO')
            .map((membro) => membro.funcionario_id),
        ),
      ).size,
      voos_requerem_revisao: items.filter((item) => item.frms_status === 'ATENCAO_COORDENACAO')
        .length,
      voos_liberaveis: items.filter((item) => item.frms_status === 'LIBERAVEL').length,
    };

    return c.json({ success: true, data: { data, resumo, voos: ordered } });
  },
);

export default controleVoosDispatchGate;
