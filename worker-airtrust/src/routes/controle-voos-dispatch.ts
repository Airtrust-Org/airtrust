import type { Context } from 'hono';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import {
  FLIGHT_SELECT,
  type FlightRow,
  getActorId,
  getEmpresaIdSafe,
  getFlightOrThrow,
  recordFlightEvent,
} from '../repositories/controle-voos/rdv-repository';
import { sendEmailDetailed } from '../lib/email';
import { sendWhatsAppMessage } from '../utils/whatsapp-send';
import {
  buildCompletedFlightLogMessage,
  buildDailyPlanningMessage,
  buildFlightProgramMessage,
  formatFlightDateTime,
  nextDateInSaoPaulo,
  type WhatsAppFlightContext,
  type WhatsAppFlightStage,
} from '../services/controle-voos/flight-whatsapp-messages';

type CrewRecipient = {
  voo_id: number;
  funcionario_id: number;
  funcao: string;
  nome: string;
  nome_guerra: string;
  telefone: string | null;
  email: string | null;
};

type FlightStageSummary = WhatsAppFlightStage & {
  voo_id: number;
};

type FuelSummary = {
  voo_id: number;
  combustivel_solicitado: number | null;
  unidade: string | null;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char] || char));
}

async function resolveCompatibleExpressions(db: D1Database): Promise<{
  nomeGuerraSql: string;
  unidadePesoSql: string;
  pesoPassageirosSql: string;
  pesoBagagemSql: string;
}> {
  const [funcionarioColumns, etapaColumns] = await Promise.all([
    db.prepare('PRAGMA table_info(funcionarios)').all<{ name: string }>(),
    db.prepare('PRAGMA table_info(cv_voo_etapas)').all<{ name: string }>(),
  ]);
  const funcionarioNames = new Set((funcionarioColumns.results || []).map((column) => column.name));
  const etapaNames = new Set((etapaColumns.results || []).map((column) => column.name));
  return {
    nomeGuerraSql: funcionarioNames.has('guerra')
      ? `COALESCE(NULLIF(TRIM(f.guerra), ''), f.nome)`
      : 'f.nome',
    unidadePesoSql: etapaNames.has('unidade_peso') ? 'e.unidade_peso' : 'NULL AS unidade_peso',
    pesoPassageirosSql: etapaNames.has('peso_passageiros') ? 'e.peso_passageiros' : 'NULL AS peso_passageiros',
    pesoBagagemSql: etapaNames.has('peso_bagagem') ? 'e.peso_bagagem' : 'NULL AS peso_bagagem',
  };
}

async function loadDispatchContexts(
  db: D1Database,
  empresaId: number,
  flights: FlightRow[],
): Promise<Map<number, WhatsAppFlightContext>> {
  const ids = [...new Set(flights.map((flight) => Number(flight.id)).filter((id) => Number.isInteger(id) && id > 0))];
  const contexts = new Map<number, WhatsAppFlightContext>();
  if (ids.length === 0) return contexts;

  const compatible = await resolveCompatibleExpressions(db);
  const placeholders = ids.map(() => '?').join(', ');
  const [crewResult, stageResult, fuelResult, contractResult] = await Promise.all([
    db.prepare(
      `SELECT t.voo_id, t.funcionario_id, t.funcao, f.nome,
              ${compatible.nomeGuerraSql} AS nome_guerra,
              f.telefone, f.email
         FROM cv_voo_tripulantes t
         JOIN funcionarios f ON f.id = t.funcionario_id
          AND f.empresa_id = t.empresa_id AND f.deleted_at IS NULL
        WHERE t.empresa_id = ? AND t.voo_id IN (${placeholders}) AND t.deleted_at IS NULL
        ORDER BY t.voo_id ASC,
                 CASE t.funcao WHEN 'PIC' THEN 0 WHEN 'SIC' THEN 1 ELSE 2 END,
                 t.id ASC`,
    ).bind(empresaId, ...ids).all<CrewRecipient>(),
    db.prepare(
      `SELECT e.voo_id, e.numero_etapa, e.origem_icao, e.destino_icao, e.pax, e.payload,
              ${compatible.pesoPassageirosSql}, ${compatible.pesoBagagemSql}, ${compatible.unidadePesoSql},
              e.horario_motor_ligado, e.horario_decolagem, e.horario_pouso, e.horario_motor_desligado
         FROM cv_voo_etapas e
        WHERE e.empresa_id = ? AND e.voo_id IN (${placeholders}) AND e.deleted_at IS NULL
        ORDER BY e.voo_id ASC, e.numero_etapa ASC, e.id ASC`,
    ).bind(empresaId, ...ids).all<FlightStageSummary>(),
    db.prepare(
      `SELECT voo_id, combustivel_solicitado, unidade
         FROM cv_voo_abastecimentos
        WHERE empresa_id = ? AND voo_id IN (${placeholders}) AND deleted_at IS NULL
          AND combustivel_solicitado IS NOT NULL
        ORDER BY voo_id ASC, id ASC`,
    ).bind(empresaId, ...ids).all<FuelSummary>(),
    db.prepare(
      `SELECT v.id AS voo_id, c.nome AS contrato_nome
         FROM cv_voos v
         LEFT JOIN cv_contratos c
           ON c.id = v.contrato_id
          AND c.empresa_id = v.empresa_id
          AND c.deleted_at IS NULL
        WHERE v.empresa_id = ? AND v.id IN (${placeholders}) AND v.deleted_at IS NULL`,
    ).bind(empresaId, ...ids).all<{ voo_id: number; contrato_nome: string | null }>(),
  ]);

  const crewByFlight = new Map<number, CrewRecipient[]>();
  for (const member of crewResult.results || []) {
    const id = Number(member.voo_id);
    const entries = crewByFlight.get(id) || [];
    entries.push(member);
    crewByFlight.set(id, entries);
  }

  const stagesByFlight = new Map<number, FlightStageSummary[]>();
  for (const stage of stageResult.results || []) {
    const id = Number(stage.voo_id);
    const entries = stagesByFlight.get(id) || [];
    entries.push(stage);
    stagesByFlight.set(id, entries);
  }

  const fuelByFlight = new Map<number, FuelSummary>();
  for (const fuel of fuelResult.results || []) {
    const id = Number(fuel.voo_id);
    if (!fuelByFlight.has(id)) fuelByFlight.set(id, fuel);
  }

  const contractByFlight = new Map<number, string | null>();
  for (const contract of contractResult.results || []) {
    contractByFlight.set(Number(contract.voo_id), contract.contrato_nome || null);
  }

  for (const flight of flights) {
    const id = Number(flight.id);
    const crew = crewByFlight.get(id) || [];
    const stages = stagesByFlight.get(id) || [];
    const fuel = fuelByFlight.get(id) || null;
    contexts.set(id, {
      flight: {
        ...flight,
        contrato_nome: contractByFlight.get(id) || null,
      },
      crew,
      stages,
      fuel,
    });
  }
  return contexts;
}

async function loadFlightDispatchContext(c: Context<{ Bindings: Env }>) {
  const empresaId = getEmpresaIdSafe(c);
  const userId = getActorId(c);
  const flightId = c.req.param('id');
  if (!flightId) throw new ApiError('Voo nao encontrado', 404, 'CONTROLE_VOOS_FLIGHT_NOT_FOUND');

  const flight = await getFlightOrThrow(c.env.DB, flightId, empresaId);
  const contexts = await loadDispatchContexts(c.env.DB, empresaId, [flight]);
  const context = contexts.get(Number(flight.id));
  if (!context) {
    throw new ApiError('Falha ao montar comunicacao do voo', 500, 'CONTROLE_VOOS_DISPATCH_CONTEXT_FAILED');
  }
  if (context.crew.length === 0) {
    throw new ApiError('Voo sem tripulacao para envio', 409, 'CONTROLE_VOOS_DISPATCH_NO_CREW');
  }

  return { empresaId, userId, flight, crew: context.crew as CrewRecipient[], context };
}

export async function getFlightWhatsAppShareHandler(c: Context<{ Bindings: Env }>) {
  const { flight, context } = await loadFlightDispatchContext(c);
  const type = String(c.req.query('tipo') || 'programacao').trim().toLowerCase();

  if (type === 'flight_log') {
    if (flight.status !== 'concluido_operacionalmente') {
      throw new ApiError(
        'Flight Log so pode ser compartilhado apos a conclusao operacional do voo',
        409,
        'CONTROLE_VOOS_FLIGHT_LOG_NOT_COMPLETED',
      );
    }
    return c.json({
      success: true,
      data: { type: 'flight_log', message: buildCompletedFlightLogMessage(context) },
    });
  }

  if (type !== 'programacao') {
    throw new ApiError('Tipo de mensagem WhatsApp invalido', 400, 'CONTROLE_VOOS_WHATSAPP_SHARE_INVALID_TYPE');
  }

  return c.json({
    success: true,
    data: { type: 'programacao', message: buildFlightProgramMessage(context) },
  });
}

export async function getDailyPlanningWhatsAppShareHandler(c: Context<{ Bindings: Env }>) {
  const empresaId = getEmpresaIdSafe(c);
  const date = String(c.req.query('data') || nextDateInSaoPaulo()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) {
    throw new ApiError('Data invalida para planejamento', 400, 'CONTROLE_VOOS_DAILY_SHARE_INVALID_DATE');
  }

  const result = await c.env.DB.prepare(
    `SELECT ${FLIGHT_SELECT}
       FROM cv_voos
      WHERE empresa_id = ?
        AND data_programacao = ?
        AND deleted_at IS NULL
      ORDER BY horario_previsto_partida ASC, id ASC`,
  ).bind(empresaId, date).all<FlightRow>();
  const flights = result.results || [];
  if (flights.length === 0) {
    throw new ApiError(
      'Nenhum voo programado para a data informada',
      404,
      'CONTROLE_VOOS_DAILY_SHARE_NO_FLIGHTS',
    );
  }

  const contextMap = await loadDispatchContexts(c.env.DB, empresaId, flights);
  const contexts = flights
    .map((flight) => contextMap.get(Number(flight.id)))
    .filter((context): context is WhatsAppFlightContext => Boolean(context));

  return c.json({
    success: true,
    data: {
      type: 'planejamento_diario',
      date,
      total: contexts.length,
      message: buildDailyPlanningMessage(date, contexts),
    },
  });
}

export async function sendFlightWhatsAppHandler(c: Context<{ Bindings: Env }>) {
  const { empresaId, userId, flight, crew, context } = await loadFlightDispatchContext(c);
  const message = buildFlightProgramMessage(context);
  const results: Array<{ funcionario_id: number; nome_guerra: string; status: 'sent' | 'failed' | 'missing_phone'; error?: string }> = [];
  const seenPhones = new Set<string>();

  for (const member of crew) {
    const phone = String(member.telefone || '').trim();
    if (!phone) {
      results.push({ funcionario_id: Number(member.funcionario_id), nome_guerra: member.nome_guerra, status: 'missing_phone' });
      continue;
    }
    if (seenPhones.has(phone)) continue;
    seenPhones.add(phone);
    try {
      await sendWhatsAppMessage(c.env, phone, `Olá, ${member.nome_guerra}.\n\n${message}`);
      results.push({ funcionario_id: Number(member.funcionario_id), nome_guerra: member.nome_guerra, status: 'sent' });
    } catch (error) {
      results.push({
        funcionario_id: Number(member.funcionario_id),
        nome_guerra: member.nome_guerra,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Falha no envio',
      });
    }
  }

  const sent = results.filter((item) => item.status === 'sent').length;
  const failed = results.length - sent;
  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: flight.id,
    tipoEvento: 'sistema',
    statusAnterior: flight.status,
    statusNovo: flight.status,
    descricao: 'Programacao enviada por WhatsApp aos tripulantes',
    metadata: { action: 'whatsapp_programacao_tripulantes', sent, failed },
    usuarioId: userId,
  });
  if (sent === 0) {
    throw new ApiError(
      'Nenhuma mensagem de WhatsApp foi enviada. Verifique telefones e configuracao do provedor.',
      502,
      'CONTROLE_VOOS_WHATSAPP_SEND_FAILED',
    );
  }
  return c.json({ success: true, data: { sent, failed, recipients: results } });
}

export async function sendFlightEmailHandler(c: Context<{ Bindings: Env }>) {
  const { empresaId, userId, flight, crew, context } = await loadFlightDispatchContext(c);
  const message = buildFlightProgramMessage(context);
  const results: Array<{ funcionario_id: number; nome_guerra: string; status: 'sent' | 'failed' | 'missing_email' }> = [];
  const seenEmails = new Set<string>();

  for (const member of crew) {
    const email = String(member.email || '').trim().toLowerCase();
    if (!email) {
      results.push({ funcionario_id: Number(member.funcionario_id), nome_guerra: member.nome_guerra, status: 'missing_email' });
      continue;
    }
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);
    const personalMessage = `Olá, ${member.nome_guerra}.\n\n${message.replace(/\*/g, '')}`;
    const sentResult = await sendEmailDetailed(c.env, {
      to: [{ email, name: member.nome_guerra }],
      subject: `Programação de voo — ${flight.prefixo} — ${formatFlightDateTime(flight.horario_previsto_partida)}`,
      textContent: personalMessage,
      htmlContent: `<div style="font-family:Arial,sans-serif;white-space:pre-line">${escapeHtml(personalMessage)}</div>`,
    });
    results.push({
      funcionario_id: Number(member.funcionario_id),
      nome_guerra: member.nome_guerra,
      status: sentResult.ok ? 'sent' : 'failed',
    });
  }

  const sent = results.filter((item) => item.status === 'sent').length;
  const failed = results.length - sent;
  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: flight.id,
    tipoEvento: 'sistema',
    statusAnterior: flight.status,
    statusNovo: flight.status,
    descricao: 'Programacao enviada por e-mail aos tripulantes',
    metadata: { action: 'email_programacao_tripulantes', sent, failed },
    usuarioId: userId,
  });
  if (sent === 0) {
    throw new ApiError(
      'Nenhum e-mail foi enviado. Verifique os e-mails dos tripulantes e a configuracao do provedor.',
      502,
      'CONTROLE_VOOS_EMAIL_SEND_FAILED',
    );
  }
  return c.json({ success: true, data: { sent, failed, recipients: results } });
}
