import type { Context } from 'hono';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import {
  getActorId,
  getEmpresaIdSafe,
  getFlightOrThrow,
  recordFlightEvent,
} from '../repositories/controle-voos/rdv-repository';
import { sendWhatsAppMessage } from '../utils/whatsapp-send';

type CrewRecipient = {
  funcionario_id: number;
  funcao: string;
  nome: string;
  nome_guerra: string;
  telefone: string | null;
};

type FlightStageSummary = {
  numero_etapa: number;
  origem_icao: string | null;
  destino_icao: string | null;
  pax: number | null;
  payload: number | null;
  unidade_peso: string | null;
};

function formatFlightWhatsAppDateTime(value: string | null | undefined): string {
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

async function resolveCompatibleExpressions(db: D1Database): Promise<{
  nomeGuerraSql: string;
  unidadePesoSql: string;
}> {
  const [funcionarioColumns, etapaColumns] = await Promise.all([
    db.prepare('PRAGMA table_info(funcionarios)').all<{ name: string }>(),
    db.prepare('PRAGMA table_info(cv_voo_etapas)').all<{ name: string }>(),
  ]);
  const hasGuerra = (funcionarioColumns.results || []).some((column) => column.name === 'guerra');
  const hasUnidadePeso = (etapaColumns.results || []).some(
    (column) => column.name === 'unidade_peso',
  );
  return {
    nomeGuerraSql: hasGuerra
      ? `COALESCE(NULLIF(TRIM(f.guerra), ''), f.nome)`
      : 'f.nome',
    unidadePesoSql: hasUnidadePeso ? 'unidade_peso' : 'NULL AS unidade_peso',
  };
}

export async function sendFlightWhatsAppHandler(c: Context<{ Bindings: Env }>) {
  const empresaId = getEmpresaIdSafe(c);
  const userId = getActorId(c);
  const flightId = c.req.param('id');
  if (!flightId) {
    throw new ApiError('Voo nao encontrado', 404, 'CONTROLE_VOOS_FLIGHT_NOT_FOUND');
  }
  const flight = await getFlightOrThrow(c.env.DB, flightId, empresaId);
  const { nomeGuerraSql, unidadePesoSql } = await resolveCompatibleExpressions(c.env.DB);

  const [crewResult, stageResult, fuel] = await Promise.all([
    c.env.DB.prepare(
      `SELECT t.funcionario_id, t.funcao, f.nome,
              ${nomeGuerraSql} AS nome_guerra,
              f.telefone
         FROM cv_voo_tripulantes t
         JOIN funcionarios f ON f.id = t.funcionario_id
          AND f.empresa_id = t.empresa_id AND f.deleted_at IS NULL
        WHERE t.empresa_id = ? AND t.voo_id = ? AND t.deleted_at IS NULL
        ORDER BY CASE t.funcao WHEN 'PIC' THEN 0 WHEN 'SIC' THEN 1 ELSE 2 END, t.id`,
    ).bind(empresaId, flight.id).all<CrewRecipient>(),
    c.env.DB.prepare(
      `SELECT numero_etapa, origem_icao, destino_icao, pax, payload, ${unidadePesoSql}
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
    ).bind(empresaId, flight.id).first<{
      combustivel_solicitado: number | null;
      unidade: string | null;
    }>(),
  ]);

  const crew = crewResult.results || [];
  if (crew.length === 0) {
    throw new ApiError(
      'Voo sem tripulacao para envio',
      409,
      'CONTROLE_VOOS_WHATSAPP_NO_CREW',
    );
  }

  const stages = stageResult.results || [];
  const route = stages.length > 0
    ? [stages[0].origem_icao, ...stages.map((stage) => stage.destino_icao)]
        .filter(Boolean)
        .join(' → ')
    : `${flight.origem_id} → ${flight.destino_id}`;
  const firstStage = stages[0] || null;
  const crewLabel = crew
    .map((member) => `${member.funcao}: ${member.nome_guerra}`)
    .join(' | ');
  const baseMessage = [
    'Programação de voo — AirTrust',
    `Data/horário: ${formatFlightWhatsAppDateTime(flight.horario_previsto_partida)}`,
    `Aeronave: ${flight.prefixo}`,
    flight.numero_voo ? `Voo: ${flight.numero_voo}` : null,
    `Rota: ${route}`,
    `Retorno previsto: ${formatFlightWhatsAppDateTime(flight.horario_previsto_chegada)}`,
    `Tripulação: ${crewLabel}`,
    firstStage?.pax != null ? `Passageiros: ${firstStage.pax}` : null,
    firstStage?.payload != null
      ? `Peso previsto: ${firstStage.payload} ${firstStage.unidade_peso || 'KG'}`
      : null,
    fuel?.combustivel_solicitado != null
      ? `Combustível solicitado: ${fuel.combustivel_solicitado} ${fuel.unidade || 'KG'}`
      : null,
    'Abra o AirTrust > Meus voos para preparar o voo e acessar o planejamento.',
  ].filter(Boolean).join('\n');

  const results: Array<{
    funcionario_id: number;
    nome_guerra: string;
    status: 'sent' | 'failed' | 'missing_phone';
    error?: string;
  }> = [];
  const seenPhones = new Set<string>();

  for (const member of crew) {
    const phone = String(member.telefone || '').trim();
    if (!phone) {
      results.push({
        funcionario_id: Number(member.funcionario_id),
        nome_guerra: member.nome_guerra,
        status: 'missing_phone',
      });
      continue;
    }
    if (seenPhones.has(phone)) continue;
    seenPhones.add(phone);

    try {
      await sendWhatsAppMessage(c.env, phone, `Olá, ${member.nome_guerra}.\n\n${baseMessage}`);
      results.push({
        funcionario_id: Number(member.funcionario_id),
        nome_guerra: member.nome_guerra,
        status: 'sent',
      });
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
    descricao: 'Programacao enviada por WhatsApp',
    metadata: { action: 'whatsapp_programacao', sent, failed },
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
