/**
 * CRUD multi-tenant de trechos (etapas) do voo em `cv_voo_etapas`.
 * Montado no prefixo `/api/controle-voos`, ao lado do workflow do RDV.
 *
 * Programado vs realizado: listagem devolve etapas realizadas + `meta.programado`
 * a partir de `cv_voos` (horários previstos / aeroportos do voo). Não há tabela
 * paralela nem colunas dual de programado nas etapas.
 */
import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import {
  getEmpresaIdSafe,
  getActorId,
  getFlightOrThrow,
  getActiveRdvByFlight,
  recordFlightEvent,
  maybeRecordSystemAudit,
  type FlightRow,
} from '../repositories/controle-voos/rdv-repository';
import {
  RDV_CAPABILITIES,
  requireAnyRdvAccess,
  assertRdvSelfScope,
} from '../services/controle-voos/rdv-workflow';
import { syncRdvAlerts } from '../services/controle-voos/rdv-alertas';
import {
  assertEtapaEditable,
  bumpRdvVersion,
  computeEtapaTempos,
  getEtapaOrThrow,
  listEtapas,
  mergeEtapaInput,
  nextNumeroEtapa,
  normalizeEtapaInput,
  recordEtapaRevisions,
  resolveEtapaEditMode,
  syncRdvAggregatesFromEtapas,
  validateEtapaInput,
  type EtapaInput,
} from '../services/controle-voos/rdv-etapas';

const rdvEtapas = new Hono<{ Bindings: Env }>();

async function parseJsonPayload(
  c: import('hono').Context<{ Bindings: Env }>,
): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('Payload JSON invalido', 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Payload JSON invalido', 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
}

function parsePositiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return parsed;
}

function assertAllowedEtapaFields(payload: Record<string, unknown>): void {
  const allowed = new Set([
    'versao',
    'mode',
    'justificativa',
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
    'ordem',
  ]);
  for (const field of Object.keys(payload)) {
    if (!allowed.has(field)) {
      throw new ApiError(`Campo nao permitido: ${field}`, 400, 'CONTROLE_VOOS_FORBIDDEN_FIELD');
    }
  }
}

async function requireActiveRdv(db: D1Database, vooId: number, empresaId: number) {
  const rdv = await getActiveRdvByFlight(db, vooId, empresaId);
  if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');
  return rdv;
}

async function buildProgramadoMeta(db: D1Database, voo: FlightRow, empresaId: number) {
  const aeroportos = await db
    .prepare(
      `
      SELECT id, codigo_icao
      FROM cv_aeroportos
      WHERE empresa_id = ? AND id IN (?, ?)
    `,
    )
    .bind(empresaId, voo.origem_id, voo.destino_id)
    .all<{ id: number; codigo_icao: string | null }>();

  const byId = new Map((aeroportos.results || []).map((a) => [a.id, a.codigo_icao]));
  return {
    origem_icao: byId.get(voo.origem_id) ?? null,
    destino_icao: byId.get(voo.destino_id) ?? null,
    horario_previsto_partida: voo.horario_previsto_partida,
    horario_previsto_chegada: voo.horario_previsto_chegada,
  };
}

function applyComputedTempos(input: EtapaInput): EtapaInput & {
  tempo_decolagem_pouso: string | null;
  tempo_total: string | null;
} {
  const tempos = computeEtapaTempos(
    input.horario_decolagem,
    input.horario_pouso,
    input.horario_motor_ligado,
    input.horario_motor_desligado,
  );
  return { ...input, ...tempos };
}

async function afterEtapaMutation(params: {
  c: import('hono').Context<{ Bindings: Env }>;
  empresaId: number;
  voo: FlightRow;
  rdvId: number;
  userId: number;
  action: string;
  etapaId: number | null;
  before?: unknown;
  after?: unknown;
}): Promise<number> {
  const { c, empresaId, voo, rdvId, userId, action, etapaId, before, after } = params;
  await syncRdvAggregatesFromEtapas(c.env.DB, empresaId, rdvId, userId);
  const rdv = await requireActiveRdv(c.env.DB, voo.id, empresaId);
  await syncRdvAlerts(c.env.DB, empresaId, voo, rdv);
  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: voo.id,
    tipoEvento: 'rdv',
    statusAnterior: voo.status,
    statusNovo: voo.status,
    descricao: `Etapa ${action}`,
    metadata: { action: `etapa_${action}`, rdv_id: rdvId, etapa_id: etapaId, versao: rdv.versao },
    usuarioId: userId,
  });
  await maybeRecordSystemAudit(
    c,
    'cv_voo_etapas',
    after && !before ? 'INSERT' : 'UPDATE',
    etapaId ?? rdvId,
    before ?? null,
    after ?? { action },
  );
  return rdv.versao;
}

// ---------------------------------------------------------------------------
// GET /voos/:id/etapas — realizados + meta.programado (voo)
// ---------------------------------------------------------------------------
rdvEtapas.get('/voos/:id/etapas', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const voo = await getFlightOrThrow(c.env.DB, c.req.param('id'), empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.visualizarProprio);

  const etapas = await listEtapas(c.env.DB, empresaId, voo.id);
  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  const programado = await buildProgramadoMeta(c.env.DB, voo, empresaId);

  return c.json({
    success: true,
    data: etapas,
    meta: {
      versao: rdv?.versao ?? null,
      programado,
      // Etapas = realizado; programado vem do voo (não há etapas fictícias).
      nota: 'etapas=realizado; meta.programado=voo.horario_previsto_* e ICAO do voo',
    },
  });
});

// ---------------------------------------------------------------------------
// POST /voos/:id/etapas
// ---------------------------------------------------------------------------
rdvEtapas.post('/voos/:id/etapas', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const voo = await getFlightOrThrow(c.env.DB, c.req.param('id'), empresaId);
  const payload = await parseJsonPayload(c);
  assertAllowedEtapaFields(payload);

  const rdv = await requireActiveRdv(c.env.DB, voo.id, empresaId);
  const mode = await resolveEtapaEditMode(c, rdv, payload.mode);
  if (mode === 'pilot') {
    await assertRdvSelfScope(
      c,
      c.env.DB,
      empresaId,
      voo.id,
      RDV_CAPABILITIES.editarRascunhoProprio,
    );
  }
  const justificativa = await assertEtapaEditable(c, rdv, mode, payload.justificativa);

  const input = normalizeEtapaInput(payload);
  if (input.numero_etapa == null) {
    input.numero_etapa = await nextNumeroEtapa(c.env.DB, empresaId, voo.id);
  }
  validateEtapaInput(input);
  const withTempos = applyComputedTempos(input);

  const novaVersao = await bumpRdvVersion(c.env.DB, empresaId, rdv, payload.versao, userId);

  const result = await c.env.DB.prepare(
    `
      INSERT INTO cv_voo_etapas (
        empresa_id, voo_id, numero_etapa, origem_icao, destino_icao,
        horario_motor_ligado, horario_decolagem, horario_pouso, horario_motor_desligado,
        tempo_decolagem_pouso, tempo_total, tempo_navegacao, tempo_ifr, tempo_noturno,
        pousos_diurnos, pousos_noturnos, starts, pax, payload,
        combustivel_inicio, combustivel_fim, unidade_combustivel, origem_dados,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, 'MANUAL',
        ?, ?, datetime('now'), datetime('now')
      )
    `,
  )
    .bind(
      empresaId,
      voo.id,
      withTempos.numero_etapa,
      withTempos.origem_icao ?? null,
      withTempos.destino_icao ?? null,
      withTempos.horario_motor_ligado ?? null,
      withTempos.horario_decolagem ?? null,
      withTempos.horario_pouso ?? null,
      withTempos.horario_motor_desligado ?? null,
      withTempos.tempo_decolagem_pouso,
      withTempos.tempo_total,
      withTempos.tempo_navegacao ?? null,
      withTempos.tempo_ifr ?? null,
      withTempos.tempo_noturno ?? null,
      withTempos.pousos_diurnos ?? null,
      withTempos.pousos_noturnos ?? null,
      withTempos.starts ?? null,
      withTempos.pax ?? null,
      withTempos.payload ?? null,
      withTempos.combustivel_inicio ?? null,
      withTempos.combustivel_fim ?? null,
      withTempos.unidade_combustivel ?? null,
      userId,
      userId,
    )
    .run();

  const etapaId = Number(result.meta.last_row_id);
  const etapa = await getEtapaOrThrow(c.env.DB, empresaId, voo.id, etapaId);

  if (mode === 'coordenacao' && justificativa) {
    await recordEtapaRevisions({
      db: c.env.DB,
      empresaId,
      rdvId: rdv.id,
      versao: novaVersao,
      etapaId,
      before: {},
      after: etapa,
      usuarioId: userId,
      justificativa,
      estadoAnterior: rdv.workflow_status,
      estadoNovo: rdv.workflow_status,
    });
  }

  const versao = await afterEtapaMutation({
    c,
    empresaId,
    voo,
    rdvId: rdv.id,
    userId,
    action: 'create',
    etapaId,
    after: etapa,
  });

  return c.json({ success: true, data: etapa, meta: { versao } }, 201);
});

// ---------------------------------------------------------------------------
// PUT /voos/:id/etapas/ordem — before :etapaId routes
// ---------------------------------------------------------------------------
rdvEtapas.put('/voos/:id/etapas/ordem', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const voo = await getFlightOrThrow(c.env.DB, c.req.param('id'), empresaId);
  const payload = await parseJsonPayload(c);
  assertAllowedEtapaFields(payload);

  const rdv = await requireActiveRdv(c.env.DB, voo.id, empresaId);
  const mode = await resolveEtapaEditMode(c, rdv, payload.mode);
  if (mode === 'pilot') {
    await assertRdvSelfScope(
      c,
      c.env.DB,
      empresaId,
      voo.id,
      RDV_CAPABILITIES.editarRascunhoProprio,
    );
  }
  const justificativa = await assertEtapaEditable(c, rdv, mode, payload.justificativa);

  if (!Array.isArray(payload.ordem) || payload.ordem.length === 0) {
    throw new ApiError(
      'ordem deve ser um array de ids de etapa',
      400,
      'CONTROLE_VOOS_ETAPA_ORDEM_INVALIDA',
    );
  }
  const ordem = payload.ordem.map((id, index) => {
    const parsed = parsePositiveInteger(id, `ordem[${index}]`);
    return parsed;
  });
  if (new Set(ordem).size !== ordem.length) {
    throw new ApiError('ordem contem ids duplicados', 400, 'CONTROLE_VOOS_ETAPA_ORDEM_INVALIDA');
  }

  const existing = await listEtapas(c.env.DB, empresaId, voo.id);
  const existingIds = new Set(existing.map((e) => e.id));
  if (ordem.length !== existing.length || ordem.some((id) => !existingIds.has(id))) {
    throw new ApiError(
      'ordem deve listar exatamente as etapas ativas do voo',
      400,
      'CONTROLE_VOOS_ETAPA_ORDEM_INVALIDA',
    );
  }

  const novaVersao = await bumpRdvVersion(c.env.DB, empresaId, rdv, payload.versao, userId);

  // Two-pass renumber (offset >= 1) to avoid UNIQUE collisions; CHECK exige numero_etapa >= 1.
  const offset = 10_000;
  for (let i = 0; i < ordem.length; i += 1) {
    await c.env.DB.prepare(
      `
      UPDATE cv_voo_etapas
      SET numero_etapa = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
    `,
    )
      .bind(offset + i + 1, userId, ordem[i], voo.id, empresaId)
      .run();
  }
  for (let i = 0; i < ordem.length; i += 1) {
    await c.env.DB.prepare(
      `
      UPDATE cv_voo_etapas
      SET numero_etapa = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
    `,
    )
      .bind(i + 1, userId, ordem[i], voo.id, empresaId)
      .run();
  }

  const etapas = await listEtapas(c.env.DB, empresaId, voo.id);

  if (mode === 'coordenacao' && justificativa) {
    await recordEtapaRevisions({
      db: c.env.DB,
      empresaId,
      rdvId: rdv.id,
      versao: novaVersao,
      etapaId: ordem[0] ?? 0,
      before: { ordem: existing.map((e) => e.id).join(',') },
      after: { ordem: ordem.join(',') },
      usuarioId: userId,
      justificativa,
      estadoAnterior: rdv.workflow_status,
      estadoNovo: rdv.workflow_status,
      extraFields: ['ordem'],
    });
  }

  const versao = await afterEtapaMutation({
    c,
    empresaId,
    voo,
    rdvId: rdv.id,
    userId,
    action: 'reorder',
    etapaId: null,
    before: { ordem: existing.map((e) => e.id) },
    after: { ordem },
  });

  return c.json({ success: true, data: etapas, meta: { versao } });
});

// ---------------------------------------------------------------------------
// PATCH /voos/:id/etapas/:etapaId
// ---------------------------------------------------------------------------
rdvEtapas.patch('/voos/:id/etapas/:etapaId', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const voo = await getFlightOrThrow(c.env.DB, c.req.param('id'), empresaId);
  const etapaId = parsePositiveInteger(c.req.param('etapaId'), 'etapaId');
  const payload = await parseJsonPayload(c);
  assertAllowedEtapaFields(payload);

  const rdv = await requireActiveRdv(c.env.DB, voo.id, empresaId);
  const mode = await resolveEtapaEditMode(c, rdv, payload.mode);
  if (mode === 'pilot') {
    await assertRdvSelfScope(
      c,
      c.env.DB,
      empresaId,
      voo.id,
      RDV_CAPABILITIES.editarRascunhoProprio,
    );
  }
  const justificativa = await assertEtapaEditable(c, rdv, mode, payload.justificativa);

  const existing = await getEtapaOrThrow(c.env.DB, empresaId, voo.id, etapaId);
  const patch = normalizeEtapaInput(payload);
  const merged = mergeEtapaInput(existing, patch);
  validateEtapaInput(merged);
  const withTempos = applyComputedTempos(merged);

  const novaVersao = await bumpRdvVersion(c.env.DB, empresaId, rdv, payload.versao, userId);

  // Preserve origem_dados for SIGVOOS legs; MANUAL stays MANUAL.
  await c.env.DB.prepare(
    `
      UPDATE cv_voo_etapas
      SET numero_etapa = ?,
          origem_icao = ?,
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
          payload = ?,
          combustivel_inicio = ?,
          combustivel_fim = ?,
          unidade_combustivel = ?,
          updated_by = ?,
          updated_at = datetime('now')
      WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
    `,
  )
    .bind(
      withTempos.numero_etapa,
      withTempos.origem_icao ?? null,
      withTempos.destino_icao ?? null,
      withTempos.horario_motor_ligado ?? null,
      withTempos.horario_decolagem ?? null,
      withTempos.horario_pouso ?? null,
      withTempos.horario_motor_desligado ?? null,
      withTempos.tempo_decolagem_pouso,
      withTempos.tempo_total,
      withTempos.tempo_navegacao ?? null,
      withTempos.tempo_ifr ?? null,
      withTempos.tempo_noturno ?? null,
      withTempos.pousos_diurnos ?? null,
      withTempos.pousos_noturnos ?? null,
      withTempos.starts ?? null,
      withTempos.pax ?? null,
      withTempos.payload ?? null,
      withTempos.combustivel_inicio ?? null,
      withTempos.combustivel_fim ?? null,
      withTempos.unidade_combustivel ?? null,
      userId,
      etapaId,
      voo.id,
      empresaId,
    )
    .run();

  const updated = await getEtapaOrThrow(c.env.DB, empresaId, voo.id, etapaId);

  if (mode === 'coordenacao' && justificativa) {
    await recordEtapaRevisions({
      db: c.env.DB,
      empresaId,
      rdvId: rdv.id,
      versao: novaVersao,
      etapaId,
      before: existing,
      after: updated,
      usuarioId: userId,
      justificativa,
      estadoAnterior: rdv.workflow_status,
      estadoNovo: rdv.workflow_status,
    });
  }

  const versao = await afterEtapaMutation({
    c,
    empresaId,
    voo,
    rdvId: rdv.id,
    userId,
    action: 'update',
    etapaId,
    before: existing,
    after: updated,
  });

  return c.json({ success: true, data: updated, meta: { versao } });
});

// ---------------------------------------------------------------------------
// DELETE /voos/:id/etapas/:etapaId — soft delete
// ---------------------------------------------------------------------------
rdvEtapas.delete('/voos/:id/etapas/:etapaId', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const voo = await getFlightOrThrow(c.env.DB, c.req.param('id'), empresaId);
  const etapaId = parsePositiveInteger(c.req.param('etapaId'), 'etapaId');

  let payload: Record<string, unknown> = {};
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = await parseJsonPayload(c);
  } else {
    const versaoQuery = c.req.query('versao');
    if (versaoQuery != null) payload.versao = Number(versaoQuery);
    if (c.req.query('justificativa')) payload.justificativa = c.req.query('justificativa');
    if (c.req.query('mode')) payload.mode = c.req.query('mode');
  }
  assertAllowedEtapaFields(payload);

  const rdv = await requireActiveRdv(c.env.DB, voo.id, empresaId);
  const mode = await resolveEtapaEditMode(c, rdv, payload.mode);
  if (mode === 'pilot') {
    await assertRdvSelfScope(
      c,
      c.env.DB,
      empresaId,
      voo.id,
      RDV_CAPABILITIES.editarRascunhoProprio,
    );
  }
  const justificativa = await assertEtapaEditable(c, rdv, mode, payload.justificativa);

  const existing = await getEtapaOrThrow(c.env.DB, empresaId, voo.id, etapaId);
  const novaVersao = await bumpRdvVersion(c.env.DB, empresaId, rdv, payload.versao, userId);

  await c.env.DB.prepare(
    `
      UPDATE cv_voo_etapas
      SET deleted_at = datetime('now'), updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
    `,
  )
    .bind(userId, etapaId, voo.id, empresaId)
    .run();

  if (mode === 'coordenacao' && justificativa) {
    await recordEtapaRevisions({
      db: c.env.DB,
      empresaId,
      rdvId: rdv.id,
      versao: novaVersao,
      etapaId,
      before: { deleted_at: null },
      after: { deleted_at: 'soft-deleted' },
      usuarioId: userId,
      justificativa,
      estadoAnterior: rdv.workflow_status,
      estadoNovo: rdv.workflow_status,
      extraFields: ['deleted_at'],
    });
  }

  const versao = await afterEtapaMutation({
    c,
    empresaId,
    voo,
    rdvId: rdv.id,
    userId,
    action: 'soft_delete',
    etapaId,
    before: existing,
    after: { id: etapaId, deleted: true },
  });

  return c.json({ success: true, data: { id: etapaId }, meta: { versao } });
});

// ---------------------------------------------------------------------------
// POST /voos/:id/etapas/:etapaId/duplicar
// ---------------------------------------------------------------------------
rdvEtapas.post('/voos/:id/etapas/:etapaId/duplicar', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const voo = await getFlightOrThrow(c.env.DB, c.req.param('id'), empresaId);
  const etapaId = parsePositiveInteger(c.req.param('etapaId'), 'etapaId');
  const payload = await parseJsonPayload(c);
  assertAllowedEtapaFields(payload);

  const rdv = await requireActiveRdv(c.env.DB, voo.id, empresaId);
  const mode = await resolveEtapaEditMode(c, rdv, payload.mode);
  if (mode === 'pilot') {
    await assertRdvSelfScope(
      c,
      c.env.DB,
      empresaId,
      voo.id,
      RDV_CAPABILITIES.editarRascunhoProprio,
    );
  }
  const justificativa = await assertEtapaEditable(c, rdv, mode, payload.justificativa);

  const source = await getEtapaOrThrow(c.env.DB, empresaId, voo.id, etapaId);
  const novoNumero = await nextNumeroEtapa(c.env.DB, empresaId, voo.id);
  await bumpRdvVersion(c.env.DB, empresaId, rdv, payload.versao, userId);

  const result = await c.env.DB.prepare(
    `
      INSERT INTO cv_voo_etapas (
        empresa_id, voo_id, numero_etapa, origem_icao, destino_icao,
        horario_motor_ligado, horario_decolagem, horario_pouso, horario_motor_desligado,
        tempo_decolagem_pouso, tempo_total, tempo_navegacao, tempo_ifr, tempo_noturno,
        pousos_diurnos, pousos_noturnos, starts, pax, payload,
        combustivel_inicio, combustivel_fim, unidade_combustivel, origem_dados,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, 'MANUAL',
        ?, ?, datetime('now'), datetime('now')
      )
    `,
  )
    .bind(
      empresaId,
      voo.id,
      novoNumero,
      source.origem_icao,
      source.destino_icao,
      source.horario_motor_ligado,
      source.horario_decolagem,
      source.horario_pouso,
      source.horario_motor_desligado,
      source.tempo_decolagem_pouso,
      source.tempo_total,
      source.tempo_navegacao,
      source.tempo_ifr,
      source.tempo_noturno,
      source.pousos_diurnos,
      source.pousos_noturnos,
      source.starts,
      source.pax,
      source.payload,
      source.combustivel_inicio,
      source.combustivel_fim,
      source.unidade_combustivel,
      userId,
      userId,
    )
    .run();

  const newId = Number(result.meta.last_row_id);
  const duplicated = await getEtapaOrThrow(c.env.DB, empresaId, voo.id, newId);

  if (mode === 'coordenacao' && justificativa) {
    await recordEtapaRevisions({
      db: c.env.DB,
      empresaId,
      rdvId: rdv.id,
      versao: rdv.versao + 1,
      etapaId: newId,
      before: { source_id: source.id },
      after: duplicated,
      usuarioId: userId,
      justificativa,
      estadoAnterior: rdv.workflow_status,
      estadoNovo: rdv.workflow_status,
    });
  }

  const versao = await afterEtapaMutation({
    c,
    empresaId,
    voo,
    rdvId: rdv.id,
    userId,
    action: 'duplicate',
    etapaId: newId,
    before: { source_id: source.id },
    after: duplicated,
  });

  return c.json({ success: true, data: duplicated, meta: { versao } }, 201);
});

export default rdvEtapas;
