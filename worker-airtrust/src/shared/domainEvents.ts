import type { D1Database } from '@cloudflare/workers-types';
import { processarEventosParaModulo } from './handlers';

export type DomainEventTipo =
  | 'CMA_CRIADO'
  | 'CMA_RENOVADO'
  | 'CMA_REVOGADO'
  | 'CMA_VENCENDO_30D'
  | 'CMA_VENCENDO_7D'
  | 'CMA_VENCIDO'
  | 'HABILITACAO_ADICIONADA'
  | 'HABILITACAO_REVOGADA'
  | 'FRMS_AVALIACAO_CRIADA'
  | 'FRMS_STATUS_CRITICO'
  | 'FRMS_STATUS_NORMAL'
  | 'FRMS_STATUS_NORMALIZADO'
  | 'SIMULADOR_AGENDADO'
  | 'SIMULADOR_REALIZADO'
  | 'SIMULADOR_CANCELADO'
  | 'SIMULADOR_REAGENDADO'
  | 'SIMULADOR_PENDENTE_VENCENDO'
  | 'FUNCIONARIO_CRIADO'
  | 'FUNCIONARIO_ATUALIZADO'
  | 'FUNCIONARIO_INATIVADO'
  | 'FUNCIONARIO_REATIVADO'
  | 'TRIPULANTE_ALOCADO'
  | 'TRIPULANTE_REMOVIDO'
  | 'TRIPULANTE_ALTERADO'
  | 'ESCALA_PUBLICADA'
  | 'ESCALA_ARQUIVADA'
  | 'HOSPEDAGEM_RESERVADA'
  | 'HOSPEDAGEM_CANCELADA'
  | 'DOCUMENTO_ENVIADO'
  | 'DOCUMENTO_EXCLUIDO'
  | 'DOCUMENTO_CMA_DETECTADO';

export interface DomainEventPayloadBase {
  empresa_id: string | number;
  origem_modulo: string;
  funcionario_id?: string;
  origem_usuario_id?: string;
  [key: string]: unknown;
}

interface ProcessingResult {
  processados: number;
  erros?: number;
  acoes: string[];
}

const CONSUMIDORES_POR_EVENTO: Record<DomainEventTipo, string[]> = {
  CMA_CRIADO: ['compliance'],
  CMA_RENOVADO: ['escalas', 'compliance'],
  CMA_REVOGADO: ['escalas', 'compliance'],
  CMA_VENCENDO_30D: ['escalas', 'compliance'],
  CMA_VENCENDO_7D: ['escalas', 'compliance'],
  CMA_VENCIDO: ['escalas', 'compliance'],
  HABILITACAO_ADICIONADA: ['compliance'],
  HABILITACAO_REVOGADA: ['compliance'],
  FRMS_AVALIACAO_CRIADA: ['compliance'],
  FRMS_STATUS_CRITICO: ['escalas', 'compliance'],
  FRMS_STATUS_NORMAL: ['escalas', 'compliance'],
  FRMS_STATUS_NORMALIZADO: ['escalas', 'compliance'],
  SIMULADOR_AGENDADO: ['compliance'],
  SIMULADOR_REALIZADO: ['pasta_virtual', 'compliance'],
  SIMULADOR_CANCELADO: ['compliance'],
  SIMULADOR_REAGENDADO: ['compliance'],
  SIMULADOR_PENDENTE_VENCENDO: ['escalas', 'compliance'],
  FUNCIONARIO_CRIADO: ['compliance'],
  FUNCIONARIO_ATUALIZADO: ['compliance'],
  FUNCIONARIO_INATIVADO: ['escalas', 'simuladores', 'hospedagem', 'compliance'],
  FUNCIONARIO_REATIVADO: ['compliance'],
  TRIPULANTE_ALOCADO: ['frms', 'hospedagem', 'compliance'],
  TRIPULANTE_REMOVIDO: ['frms', 'compliance'],
  TRIPULANTE_ALTERADO: ['frms', 'hospedagem', 'compliance'],
  ESCALA_PUBLICADA: ['pasta_virtual', 'compliance'],
  ESCALA_ARQUIVADA: ['compliance'],
  HOSPEDAGEM_RESERVADA: ['escalas', 'compliance'],
  HOSPEDAGEM_CANCELADA: ['escalas', 'compliance'],
  DOCUMENTO_ENVIADO: ['compliance'],
  DOCUMENTO_EXCLUIDO: ['compliance'],
  DOCUMENTO_CMA_DETECTADO: ['qualificacoes', 'compliance'],
};

export function getConsumidoresPorEvento(tipo: DomainEventTipo): string[] {
  return CONSUMIDORES_POR_EVENTO[tipo] ?? [];
}

export async function publishDomainEvent(
  db: D1Database,
  modulo: string,
  tipo: DomainEventTipo,
  payload: DomainEventPayloadBase,
): Promise<void>;
export async function publishDomainEvent(
  db: D1Database,
  tipo: DomainEventTipo,
  payload: DomainEventPayloadBase,
): Promise<void>;
export async function publishDomainEvent(
  db: D1Database,
  arg1: string,
  arg2: DomainEventTipo | DomainEventPayloadBase,
  arg3?: DomainEventPayloadBase,
): Promise<void> {
  const usingLegacySignature = arg3 !== undefined;
  const modulo = usingLegacySignature
    ? arg1
    : String((arg2 as DomainEventPayloadBase).origem_modulo || 'sistema');
  const tipo = (usingLegacySignature ? arg2 : arg1) as DomainEventTipo;
  const payload = (usingLegacySignature ? arg3 : arg2) as DomainEventPayloadBase;
  const consumidores = getConsumidoresPorEvento(tipo);
  const eventId = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO domain_events
        (id, empresa_id, modulo, tipo, payload, consumidores, processado_por, processado, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '[]', 0, datetime('now'))`,
    )
    .bind(
      eventId,
      Number(payload.empresa_id),
      modulo,
      tipo,
      JSON.stringify({ ...payload, origem_modulo: modulo }),
      JSON.stringify(consumidores),
    )
    .run();

  await db
    .prepare(
      `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_novos, origem, created_at)
       VALUES ('domain_events', ?, ?, ?, 'api', datetime('now'))`,
    )
    .bind(tipo, eventId, JSON.stringify({ modulo, consumidores, ...payload }))
    .run();
}

export async function processarEventosPendentes(
  db: D1Database,
  empresaId: number | string,
): Promise<ProcessingResult> {
  const resultado = await processarEventosParaModulo(db, String(empresaId), 'escalas');
  return { processados: resultado.processados, erros: resultado.erros, acoes: resultado.acoes };
}
