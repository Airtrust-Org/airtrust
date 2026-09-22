import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { requireControleVoosCoordination, requireControleVoosWrite } from '../middleware/controle-voos-access';
import type { Env } from '../types';
import { getActorId, getEmpresaIdSafe, getFlightOrThrow, recordFlightEvent } from '../repositories/controle-voos/rdv-repository';
import { enrichFlightsWithPresentation } from '../services/controle-voos/flight-presentation';
import {
  assertStructuredFlightPlanReady,
  buildDefaultStructuredFlightPlan,
  buildProjectedEobtUtc,
  evaluateStructuredFlightPlan,
  FLIGHT_PLAN_PAYLOAD_SCHEMA_VERSION,
  FLIGHT_PLAN_SCHEMA_CHANGE_ID,
  normalizeStructuredFlightPlanPayload,
  type StructuredFlightPlanPayloadV1,
  type StructuredFlightPlanReference,
} from '../services/controle-voos/structured-flight-plan';

const routes = new Hono<{ Bindings: Env }>();

type PlanRow = {
  id: number;
  empresa_id: number;
  voo_id: number;
  status: 'rascunho' | 'pronto' | 'submetido' | 'aceito' | 'rejeitado' | 'cancelado';
  versao: number;
  payload_schema_version: number;
  payload_json: string;
  fonte: string;
  provider: string;
  identificacao_aeronave: string | null;
  origem_icao: string | null;
  destino_icao: string | null;
  data_operacional: string | null;
  eobt_utc: string | null;
  protocolo_decea: string | null;
  external_id: string | null;
  ultima_mensagem_tipo: string | null;
  ultimo_status_provider: string | null;
  submetido_em: string | null;
  respondido_em: string | null;
  created_at: string;
  updated_at: string;
};

function parseJsonBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('Payload inválido', 400, 'CONTROLE_VOOS_FLIGHT_PLAN_INVALID_PAYLOAD');
  }
  return value as Record<string, unknown>;
}

async function hasStructuredFlightPlanSchema(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='cv_planos_voo'")
    .first<{ count: number }>();
  return Number(row?.count || 0) === 1;
}

async function loadPlan(db: D1Database, empresaId: number, vooId: number): Promise<PlanRow | null> {
  return db
    .prepare(
      `SELECT id, empresa_id, voo_id, status, versao, payload_schema_version, payload_json,
              fonte, provider, identificacao_aeronave, origem_icao, destino_icao,
              data_operacional, eobt_utc, protocolo_decea, external_id,
              ultima_mensagem_tipo, ultimo_status_provider, submetido_em, respondido_em,
              created_at, updated_at
         FROM cv_planos_voo
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(empresaId, vooId)
    .first<PlanRow>();
}

async function buildReference(db: D1Database, empresaId: number, vooIdText: string): Promise<StructuredFlightPlanReference> {
  const flight = await getFlightOrThrow(db, vooIdText, empresaId);
  const enriched = (await enrichFlightsWithPresentation(db, empresaId, [flight]))[0];
  const aircraft = flight.aeronave_id
    ? await db
        .prepare(
          `SELECT modelo, prefixo
             FROM aeronaves
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(flight.aeronave_id, empresaId)
        .first<{ modelo: string | null; prefixo: string | null }>()
    : null;
  const stage = await db
    .prepare(
      `SELECT pax
         FROM cv_voo_etapas
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
        ORDER BY numero_etapa ASC, id ASC
        LIMIT 1`,
    )
    .bind(empresaId, flight.id)
    .first<{ pax: number | null }>();
  const crew = await db
    .prepare(
      `SELECT COUNT(DISTINCT funcionario_id) AS count
         FROM cv_voo_tripulantes
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL`,
    )
    .bind(empresaId, flight.id)
    .first<{ count: number }>();

  return {
    identificacaoAeronave: aircraft?.prefixo || flight.prefixo,
    dataOperacional: flight.data_programacao,
    horarioPrevistoPartida: flight.horario_previsto_partida,
    horarioPrevistoChegada: flight.horario_previsto_chegada,
    modeloAeronave: aircraft?.modelo || null,
    routePoints: enriched.rota_pontos || [],
    plannedPax: stage?.pax == null ? null : Number(stage.pax),
    crewCount: Number(crew?.count || 0),
  };
}

function parseStoredPayload(row: PlanRow, fallback: StructuredFlightPlanPayloadV1): StructuredFlightPlanPayloadV1 {
  try {
    return normalizeStructuredFlightPlanPayload(JSON.parse(row.payload_json), fallback);
  } catch {
    throw new ApiError('Plano de voo salvo com payload inválido', 500, 'CONTROLE_VOOS_FLIGHT_PLAN_CORRUPT');
  }
}

async function buildResponse(db: D1Database, empresaId: number, vooIdText: string) {
  const reference = await buildReference(db, empresaId, vooIdText);
  const draft = buildDefaultStructuredFlightPlan(reference);
  const available = await hasStructuredFlightPlanSchema(db);
  const plan = available ? await loadPlan(db, empresaId, Number(vooIdText)) : null;
  const payload = plan ? parseStoredPayload(plan, draft) : draft;
  return {
    available,
    schema_change_id: FLIGHT_PLAN_SCHEMA_CHANGE_ID,
    transmission: {
      provider: 'MANUAL',
      enabled: false,
      reason: 'Transmissão automática ao DECEA/SIGMA não habilitada. A prévia deve ser conferida e apresentada por canal oficial.',
    },
    reference: {
      modelo_aeronave: reference.modeloAeronave,
      rota: reference.routePoints,
    },
    plan: plan ? { ...plan, payload } : null,
    draft: payload,
    readiness: evaluateStructuredFlightPlan(payload),
  };
}

routes.get('/voos/:id/plano-voo', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const data = await buildResponse(c.env.DB, empresaId, c.req.param('id'));
  return c.json({ success: true, data });
});

routes.post(
  '/voos/:id/plano-voo/preview',
  auth(),
  requireControleVoosWrite(),
  requireControleVoosCoordination(),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const reference = await buildReference(c.env.DB, empresaId, c.req.param('id'));
    const fallback = buildDefaultStructuredFlightPlan(reference);
    const body = parseJsonBody(await c.req.json().catch(() => ({})));
    const payload = normalizeStructuredFlightPlanPayload(body.payload, fallback);
    return c.json({
      success: true,
      data: {
        payload,
        readiness: evaluateStructuredFlightPlan(payload),
        transmission: { provider: 'MANUAL', enabled: false },
      },
    });
  },
);

routes.put(
  '/voos/:id/plano-voo',
  auth(),
  requireControleVoosWrite(),
  requireControleVoosCoordination(),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const actorId = getActorId(c);
    const vooIdText = c.req.param('id');
    const vooId = Number(vooIdText);
    const reference = await buildReference(c.env.DB, empresaId, vooIdText);
    const fallback = buildDefaultStructuredFlightPlan(reference);
    const body = parseJsonBody(await c.req.json().catch(() => ({})));
    const payload = normalizeStructuredFlightPlanPayload(body.payload, fallback);
    const requestedStatus = String(body.status || 'rascunho').trim().toLowerCase();
    if (requestedStatus !== 'rascunho' && requestedStatus !== 'pronto') {
      throw new ApiError('Status de plano inválido', 400, 'CONTROLE_VOOS_FLIGHT_PLAN_INVALID_STATUS');
    }
    if (requestedStatus === 'pronto') assertStructuredFlightPlanReady(payload);
    if (!(await hasStructuredFlightPlanSchema(c.env.DB))) {
      throw new ApiError(
        `Schema ${FLIGHT_PLAN_SCHEMA_CHANGE_ID} ainda não aplicado neste ambiente`,
        503,
        'CONTROLE_VOOS_FLIGHT_PLAN_SCHEMA_UNAVAILABLE',
      );
    }

    const existing = await loadPlan(c.env.DB, empresaId, vooId);
    if (existing && (existing.provider !== 'MANUAL' || !['rascunho', 'pronto'].includes(existing.status))) {
      throw new ApiError(
        'Plano de voo bloqueado para edição manual após submissão ou retorno do provedor',
        409,
        'CONTROLE_VOOS_FLIGHT_PLAN_LOCKED',
      );
    }
    const expectedVersion = body.versao == null ? null : Number(body.versao);
    if (existing && (!Number.isInteger(expectedVersion) || expectedVersion !== existing.versao)) {
      throw new ApiError('Plano de voo foi alterado por outro usuário', 409, 'CONTROLE_VOOS_FLIGHT_PLAN_VERSION_CONFLICT');
    }

    const firstLeg = payload.pernas[0];
    const lastLeg = payload.pernas[payload.pernas.length - 1];
    const payloadJson = JSON.stringify(payload);
    const eobtUtc = buildProjectedEobtUtc(payload);

    let planId: number;
    if (!existing) {
      const result = await c.env.DB
        .prepare(
          `INSERT INTO cv_planos_voo (
             empresa_id, voo_id, status, versao, payload_schema_version, payload_json,
             fonte, provider, identificacao_aeronave, origem_icao, destino_icao,
             data_operacional, eobt_utc, created_by, updated_by, created_at, updated_at
           ) VALUES (?, ?, ?, 1, ?, ?, 'AIRTRUST', 'MANUAL', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          empresaId,
          vooId,
          requestedStatus,
          FLIGHT_PLAN_PAYLOAD_SCHEMA_VERSION,
          payloadJson,
          payload.comuns.identificacao_aeronave || null,
          firstLeg?.origem || null,
          lastLeg?.destino || null,
          reference.dataOperacional || null,
          eobtUtc,
          actorId,
          actorId,
        )
        .run();
      planId = Number(result.meta.last_row_id);
    } else {
      const result = await c.env.DB
        .prepare(
          `UPDATE cv_planos_voo
              SET status = ?, payload_schema_version = ?, payload_json = ?,
                  identificacao_aeronave = ?, origem_icao = ?, destino_icao = ?,
                  data_operacional = ?, eobt_utc = ?, provider = 'MANUAL', fonte = 'AIRTRUST',
                  versao = versao + 1, updated_by = ?, updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ? AND voo_id = ? AND versao = ? AND deleted_at IS NULL`,
        )
        .bind(
          requestedStatus,
          FLIGHT_PLAN_PAYLOAD_SCHEMA_VERSION,
          payloadJson,
          payload.comuns.identificacao_aeronave || null,
          firstLeg?.origem || null,
          lastLeg?.destino || null,
          reference.dataOperacional || null,
          eobtUtc,
          actorId,
          existing.id,
          empresaId,
          vooId,
          existing.versao,
        )
        .run();
      if (Number(result.meta.changes || 0) !== 1) {
        throw new ApiError('Plano de voo foi alterado por outro usuário', 409, 'CONTROLE_VOOS_FLIGHT_PLAN_VERSION_CONFLICT');
      }
      planId = existing.id;
    }

    await recordFlightEvent({
      db: c.env.DB,
      empresaId,
      vooId,
      tipoEvento: 'sistema',
      statusNovo: undefined,
      descricao: requestedStatus === 'pronto' ? 'Plano de voo estruturado pronto para conferência' : 'Rascunho do plano de voo estruturado atualizado',
      metadata: { plano_voo_id: planId, provider: 'MANUAL', payload_schema_version: 1 },
      usuarioId: actorId,
    });

    const data = await buildResponse(c.env.DB, empresaId, vooIdText);
    return c.json({ success: true, data });
  },
);

export default routes;
