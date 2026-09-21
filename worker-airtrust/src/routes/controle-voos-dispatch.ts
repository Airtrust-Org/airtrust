import type { Context } from 'hono';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import {
  getActorId,
  getEmpresaIdSafe,
  getFlightOrThrow,
  recordFlightEvent,
} from '../repositories/controle-voos/rdv-repository';
import { sendEmailDetailed } from '../lib/email';
import { sendWhatsAppMessage } from '../utils/whatsapp-send';

type CrewRecipient = {
  funcionario_id: number;
  funcao: string;
  nome: string;
  nome_guerra: string;
  telefone: string | null;
  email: string | null;
};

type FlightStageSummary = {
  numero_etapa: number;
  origem_icao: string | null;
  destino_icao: string | null;
  pax: number | null;
  payload: number | null;
  peso_passageiros: number | null;
  peso_bagagem: number | null;
  unidade_peso: string | null;
};

function formatFlightDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

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
    unidadePesoSql: etapaNames.has('unidade_peso') ? 'unidade_peso' : 'NULL AS unidade_peso',
    pesoPassageirosSql: etapaNames.has('peso_passageiros') ? 'peso_passageiros' : 'NULL AS peso_passageiros',
    pesoBagagemSql: etapaNames.has('peso_bagagem') ? 'peso_bagagem' : 'NULL AS peso_bagagem',
  };
}

async function loadFlightDispatchContext(c: Context<{ Bindings: Env }>) {
  const empresaId = getEmpresaIdSafe(c);
  const userId = getActorId(c);
  const flightId = c.req.param('id');
  if (!flightId) throw new ApiError('Voo nao encontrado', 404, 'CONTROLE_VOOS_FLIGHT_NOT_FOUND');

  const flight = await getFlightOrThrow(c.env.DB, flightId, empresaId);
  const compatible = await resolveCompatibleExpressions(c.env.DB);
  const [crewResult, stageResult, fuel] = await Promise.all([
    c.env.DB.prepare(
      `SELECT t.funcionario_id, t.funcao, f.nome,
              ${compatible.nomeGuerraSql} AS nome_guerra,
              f.telefone, f.email
         FROM cv_voo_tripulantes t
         JOIN funcionarios f ON f.id = t.funcionario_id
          AND f.empresa_id = t.empresa_id AND f.deleted_at IS NULL
        WHERE t.empresa_id = ? AND t.voo_id = ? AND t.deleted_at IS NULL
        ORDER BY CASE t.funcao WHEN 'PIC' THEN 0 WHEN 'SIC' THEN 1 ELSE 2 END, t.id`,
    ).bind(empresaId, flight.id).all<CrewRecipient>(),
    c.env.DB.prepare(
      `SELECT numero_etapa, origem_icao, destino_icao, pax, payload,
              ${compatible.pesoPassageirosSql}, ${compatible.pesoBagagemSql}, ${compatible.unidadePesoSql}
         FROM cv_voo_etapas
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
        ORDER BY numero_etapa ASC, id ASC`,
    ).bind(empresaId, flight.id).all<FlightStageSummary>(),
    c.env.DB.prepare(
      `SELECT combustivel_solicitado, unidade
         FROM cv_voo_abastecimentos
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
          AND combustivel_solicitado IS NOT NULL
        ORDER BY id ASC LIMIT 1`,
    ).bind(empresaId, flight.id).first<{ combustivel_solicitado: number | null; unidade: string | null }>(),
  ]);

  const crew = crewResult.results || [];
  if (crew.length === 0) {
    throw new ApiError('Voo sem tripulacao para envio', 409, 'CONTROLE_VOOS_DISPATCH_NO_CREW');
  }

  const stages = stageResult.results || [];
  const route = stages.length > 0
    ? [stages[0].origem_icao, ...stages.map((stage) => stage.destino_icao)].filter(Boolean).join(' → ')
    : `${flight.origem_id} → ${flight.destino_id}`;
  const firstStage = stages[0] || null;
  const crewLabel = crew.map((member) => `${member.funcao}: ${member.nome_guerra}`).join(' | ');
  const weightUnit = firstStage?.unidade_peso || 'LB';
  const message = [
    '🚁 *Programação de voo | Costa do Sol*',
    '',
    `📅 *Data/horário:* ${formatFlightDateTime(flight.horario_previsto_partida)}`,
    `🚁 *Aeronave:* ${flight.prefixo}`,
    flight.numero_voo ? `🧾 *Voo:* ${flight.numero_voo}` : null,
    `🧭 *Rota:* ${route}`,
    `↩️ *Retorno previsto:* ${formatFlightDateTime(flight.horario_previsto_chegada)}`,
    `👥 *Tripulação:* ${crewLabel}`,
    firstStage?.pax != null ? `👤 *Passageiros previstos:* ${firstStage.pax}` : null,
    firstStage?.peso_passageiros != null ? `⚖️ *Peso dos passageiros:* ${firstStage.peso_passageiros} ${weightUnit}` : null,
    firstStage?.peso_bagagem != null ? `🧳 *Peso da bagagem:* ${firstStage.peso_bagagem} ${weightUnit}` : null,
    firstStage?.payload != null ? `📦 *Carga/payload:* ${firstStage.payload} ${weightUnit}` : null,
    fuel?.combustivel_solicitado != null
      ? `⛽ *Combustível solicitado:* ${fuel.combustivel_solicitado} ${fuel.unidade || 'LB'}`
      : null,
    '',
    'Abra o AirTrust > Meus voos para preparar o voo e acessar o planejamento.',
  ].filter((line) => line !== null).join('\n');

  return { empresaId, userId, flight, crew, message };
}

export async function getFlightWhatsAppShareHandler(c: Context<{ Bindings: Env }>) {
  const { message } = await loadFlightDispatchContext(c);
  return c.json({ success: true, data: { message } });
}

export async function sendFlightWhatsAppHandler(c: Context<{ Bindings: Env }>) {
  const { empresaId, userId, flight, crew, message } = await loadFlightDispatchContext(c);
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
      await sendWhatsAppMessage(c.env, phone, `Olá, ${member.nome_guerra}.

${message}`);
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
  const { empresaId, userId, flight, crew, message } = await loadFlightDispatchContext(c);
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
    const personalMessage = `Olá, ${member.nome_guerra}.

${message.replace(/\*/g, '')}`;
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
