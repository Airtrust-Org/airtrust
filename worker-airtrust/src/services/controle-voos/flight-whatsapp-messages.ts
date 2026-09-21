export type WhatsAppCrewMember = {
  funcao: string;
  nome_guerra: string;
};

export type WhatsAppFlightStage = {
  numero_etapa: number;
  origem_icao: string | null;
  destino_icao: string | null;
  pax: number | null;
  payload: number | null;
  peso_passageiros: number | null;
  peso_bagagem: number | null;
  unidade_peso: string | null;
  horario_motor_ligado?: string | null;
  horario_decolagem?: string | null;
  horario_pouso?: string | null;
  horario_motor_desligado?: string | null;
};

export type WhatsAppFuelSummary = {
  combustivel_solicitado: number | null;
  unidade: string | null;
} | null;

export type WhatsAppFlightSummary = {
  id: number;
  prefixo: string;
  numero_voo: string | null;
  data_programacao: string;
  horario_previsto_partida: string | null;
  horario_previsto_chegada: string | null;
  horario_real_partida?: string | null;
  horario_real_chegada?: string | null;
  status?: string | null;
  contrato_nome?: string | null;
};

export type WhatsAppFlightContext = {
  flight: WhatsAppFlightSummary;
  crew: WhatsAppCrewMember[];
  stages: WhatsAppFlightStage[];
  fuel: WhatsAppFuelSummary;
};

const TIME_ZONE = 'America/Sao_Paulo';

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatFlightDate(value: string | null | undefined): string {
  if (!value) return '—';
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function formatFlightDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function formatFlightTime(value: string | null | undefined): string {
  if (!value) return '—';
  const clockOnly = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (clockOnly) return `${twoDigits(Number(clockOnly[1]))}:${clockOnly[2]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

export function nextDateInSaoPaulo(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const next = new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day) + 1,
  ));
  return `${next.getUTCFullYear()}-${twoDigits(next.getUTCMonth() + 1)}-${twoDigits(next.getUTCDate())}`;
}

export function buildRoute(stages: WhatsAppFlightStage[]): string {
  if (stages.length === 0) return '—';
  return [stages[0].origem_icao, ...stages.map((stage) => stage.destino_icao)]
    .filter((value): value is string => Boolean(value))
    .join(' / ');
}

export function buildCrewLabel(crew: WhatsAppCrewMember[]): string {
  if (crew.length === 0) return 'Não atribuída';
  return crew.map((member) => {
    const role = member.funcao === 'PIC' ? 'Cmte' : member.funcao === 'SIC' ? 'Cop' : member.funcao;
    return `${role}: ${member.nome_guerra}`;
  }).join(' / ');
}

function firstStageLines(context: WhatsAppFlightContext): string[] {
  const firstStage = context.stages[0] || null;
  if (!firstStage) return [];
  const weightUnit = firstStage.unidade_peso || 'LB';
  return [
    firstStage.pax != null ? `*Passageiros previstos:* ${firstStage.pax}` : null,
    firstStage.peso_passageiros != null
      ? `*Peso dos passageiros:* ${firstStage.peso_passageiros} ${weightUnit}`
      : null,
    firstStage.peso_bagagem != null
      ? `*Peso da bagagem:* ${firstStage.peso_bagagem} ${weightUnit}`
      : null,
    firstStage.payload != null ? `*Carga/payload:* ${firstStage.payload} ${weightUnit}` : null,
    context.fuel?.combustivel_solicitado != null
      ? `*Combustível solicitado:* ${context.fuel.combustivel_solicitado} ${context.fuel.unidade || 'LB'}`
      : null,
  ].filter((line): line is string => Boolean(line));
}

export function buildFlightProgramMessage(context: WhatsAppFlightContext): string {
  const { flight } = context;
  return [
    '*Programação de voo | Costa do Sol*',
    '',
    flight.contrato_nome ? `*Cliente:* ${flight.contrato_nome}` : null,
    `*Data/horário:* ${formatFlightDateTime(flight.horario_previsto_partida)}`,
    `*Aeronave:* ${flight.prefixo}`,
    flight.numero_voo ? `*Voo:* ${flight.numero_voo}` : null,
    `*Rota:* ${buildRoute(context.stages)}`,
    `*Retorno previsto:* ${formatFlightDateTime(flight.horario_previsto_chegada)}`,
    `*Tripulação:* ${buildCrewLabel(context.crew)}`,
    ...firstStageLines(context),
    '',
    'Abra o AirTrust > Meus voos para preparar o voo e acessar o planejamento.',
  ].filter((line): line is string => line !== null).join('\n');
}

export function buildDailyPlanningMessage(date: string, contexts: WhatsAppFlightContext[]): string {
  const blocks = contexts.map((context) => {
    const { flight } = context;
    const statusLine = flight.status === 'cancelado' ? '*Status:* CANCELADO' : null;
    return [
      flight.contrato_nome ? `*Cliente:* ${flight.contrato_nome}` : null,
      `*Rota:* ${buildRoute(context.stages)}`,
      `*Decolagem:* ${formatFlightTime(flight.horario_previsto_partida)} HS`,
      `*Retorno previsto:* ${formatFlightTime(flight.horario_previsto_chegada)} HS`,
      `*Aeronave:* ${flight.prefixo}`,
      `*Tripulação:* ${buildCrewLabel(context.crew)}`,
      ...firstStageLines(context),
      statusLine,
    ].filter((line): line is string => line !== null).join('\n');
  });

  return [
    '*Planejamento de voos | Costa do Sol*',
    '',
    'Prezados, boa tarde!',
    `Seguem detalhes atualizados da programação de voos para o dia ${formatFlightDate(date)}.`,
    '',
    ...blocks.flatMap((block, index) => index === 0 ? [block] : ['', block]),
  ].join('\n');
}

export function buildCompletedFlightLogMessage(context: WhatsAppFlightContext): string {
  const { flight, crew, stages } = context;
  const route = buildRoute(stages);
  const crewCount = crew.length;

  const stageBlocks = stages.map((stage) => {
    const pob = stage.pax != null ? stage.pax + crewCount : null;
    return [
      `*Etapa ${stage.numero_etapa} — ${stage.origem_icao || '—'} / ${stage.destino_icao || '—'}*`,
      stage.horario_motor_ligado
        ? `Acionamento ${stage.origem_icao || ''}: ${formatFlightTime(stage.horario_motor_ligado)} HS`
        : null,
      stage.horario_decolagem
        ? `Decolagem ${stage.origem_icao || ''}: ${formatFlightTime(stage.horario_decolagem)} HS`
        : null,
      stage.horario_pouso
        ? `Pouso ${stage.destino_icao || ''}: ${formatFlightTime(stage.horario_pouso)} HS`
        : null,
      stage.horario_motor_desligado
        ? `Corte ${stage.destino_icao || ''}: ${formatFlightTime(stage.horario_motor_desligado)} HS`
        : null,
      stage.pax != null ? `PAX: ${stage.pax}` : null,
      pob != null ? `POB: ${pob}` : null,
    ].filter((line): line is string => Boolean(line)).join('\n');
  });

  return [
    '*Flight Log | Costa do Sol*',
    '',
    flight.contrato_nome ? `*Cliente:* ${flight.contrato_nome}` : null,
    `*Aeronave:* ${flight.prefixo}`,
    `*Data:* ${formatFlightDate(flight.data_programacao)}`,
    `*Rota:* ${route}`,
    flight.horario_real_partida
      ? `*Partida real:* ${formatFlightTime(flight.horario_real_partida)} HS`
      : null,
    flight.horario_real_chegada
      ? `*Chegada real:* ${formatFlightTime(flight.horario_real_chegada)} HS`
      : null,
    `*Tripulação:* ${buildCrewLabel(crew)}`,
    '',
    ...stageBlocks.flatMap((block, index) => index === 0 ? [block] : ['', block]),
  ].filter((line): line is string => line !== null).join('\n');
}
