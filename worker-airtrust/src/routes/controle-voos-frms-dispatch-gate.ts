/**
 * Painel operacional da Coordenação (Controle Operacional FRMS / Gate de
 * Despacho V1) e o guard backend que bloqueia `POST /voos/:id/status`
 * quando a transição candidata é `planejado -> liberado_operacionalmente`
 * e o gate de despacho nao libera.
 *
 * Deliberadamente um arquivo separado de `routes/controle-voos.ts` (que
 * mantém um guard de arquitetura proibindo referências a FRMS/MRO/etc —
 * ver `nao referencia dominios externos fora do escopo da fase` em
 * `__tests__/routes/controle-voos.test.ts`). O guard de transição nao é
 * montado como sub-rota Hono (não há como interceptar uma rota já
 * definida em outro arquivo por prefixo) — é registrado em `index.ts`
 * como middleware global no path exato `/api/controle-voos/voos/:id/status`,
 * ANTES do mount de `controle-voos.ts`, para rodar antes do handler real.
 *
 * Protegido pela MESMA capability canônica já usada pela fila/alertas da
 * Coordenação (`voos.rdv.visualizar_todos`, ver
 * `services/controle-voos/rdv-workflow.ts`) — não é um role paralelo.
 */
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import { getEmpresaIdSafe, getFlightOrThrow } from '../repositories/controle-voos/rdv-repository';
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
      `SELECT id, prefixo, status, data_programacao, horario_previsto_partida, aeronave_id
       FROM cv_voos
       WHERE empresa_id = ? AND data_programacao = ? AND deleted_at IS NULL
       ORDER BY horario_previsto_partida ASC, id ASC`,
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
      tripulantes_checkin_pendente: items.reduce(
        (acc, item) =>
          acc +
          item.tripulacao.filter((membro) => membro.reasons.includes('CHECKIN_DIARIO_PENDENTE'))
            .length,
        0,
      ),
      voos_requerem_revisao: items.filter((item) => item.frms_status === 'ATENCAO_COORDENACAO')
        .length,
      voos_liberaveis: items.filter((item) => item.frms_status === 'LIBERAVEL').length,
    };

    return c.json({ success: true, data: { data, resumo, voos: ordered } });
  },
);

/**
 * Guard obrigatório de transição — registrado em `index.ts` diretamente
 * no path `/api/controle-voos/voos/:id/status`. Não aceita `empresa_id`
 * do cliente (usa o mesmo `getEmpresaIdSafe` já resolvido pelo tenant
 * middleware global). Nao permite bypass por chamada direta à API: roda
 * antes do handler de `controle-voos.ts`, entao nenhuma rota alternativa
 * de escrita de status escapa dele.
 */
export function controleVoosDispatchGateGuard(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (c.req.method !== 'POST') {
      await next();
      return;
    }

    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      await next();
      return;
    }

    const id = c.req.param('id') ?? '';

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      await next();
      return;
    }

    const targetStatus =
      payload && typeof payload === 'object' && 'status' in payload
        ? String((payload as { status: unknown }).status || '')
        : '';

    if (targetStatus !== 'liberado_operacionalmente') {
      await next();
      return;
    }

    const flight = await getFlightOrThrow(c.env.DB, id, empresaId);
    if (flight.status !== 'planejado') {
      await next();
      return;
    }

    const assessment = await assessFlightDispatchGate(
      c.env.DB,
      empresaId,
      flight.id,
      flight.data_programacao,
    );

    if (!assessment.can_release) {
      return c.json(
        {
          success: false,
          error: 'Liberacao operacional bloqueada por pendencia FRMS',
          code: 'CONTROLE_VOOS_FRMS_RELEASE_BLOCKED',
          data: {
            frms_status: assessment.frms_status,
            frms_primary_reason: assessment.frms_primary_reason,
            tripulacao: assessment.crew.map((membro) => ({
              funcionario_id: membro.funcionario_id,
              nome: membro.nome,
              funcao: membro.funcao,
              frms_status: membro.frms_status,
              reasons: membro.reasons,
            })),
          },
        },
        409,
      );
    }

    await next();
  };
}

export default controleVoosDispatchGate;
