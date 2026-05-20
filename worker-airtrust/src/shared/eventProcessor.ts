import type { D1Database } from '@cloudflare/workers-types';
import type { DomainEventPayloadBase, DomainEventTipo } from './domainEvents';

interface EventoRow {
  id: string;
  modulo: string;
  tipo: string;
  payload: string;
  consumidores?: string | null;
  processado_por?: string | null;
}

type EventHandler = (
  db: D1Database,
  tipo: DomainEventTipo,
  payload: DomainEventPayloadBase,
) => Promise<void>;

const handlers = new Map<string, Map<string, EventHandler>>();

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export function registerHandler(consumidor: string, tipo: DomainEventTipo, handler: EventHandler) {
  if (!handlers.has(consumidor)) {
    handlers.set(consumidor, new Map());
  }
  handlers.get(consumidor)?.set(tipo, handler);
}

async function marcarEventoConsumido(
  db: D1Database,
  evento: EventoRow,
  consumidor: string,
  errorMessage?: string,
) {
  const consumidores = parseJsonArray(evento.consumidores);
  const processadoPor = parseJsonArray(evento.processado_por);
  const novoProcessadoPor = Array.from(new Set([...processadoPor, consumidor]));
  const totalmenteProcessado =
    consumidores.length === 0 || consumidores.every((item) => novoProcessadoPor.includes(item));

  await db
    .prepare(
      `UPDATE domain_events
       SET processado_por = ?,
           processado = ?,
           processed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE processed_at END,
           ultimo_erro = ?
       WHERE id = ?`,
    )
    .bind(
      JSON.stringify(novoProcessadoPor),
      totalmenteProcessado ? 1 : 0,
      totalmenteProcessado ? 1 : 0,
      errorMessage || null,
      evento.id,
    )
    .run();
}

export async function processarEventosParaModulo(
  db: D1Database,
  empresaId: string,
  consumidor: string,
  limite = 100,
): Promise<{ processados: number; erros: number; acoes: string[] }> {
  const todosPendentes = await db
    .prepare(
      `SELECT id, modulo, tipo, payload, consumidores, processado_por
       FROM domain_events
       WHERE empresa_id = ?
         AND processado = 0
         AND deleted_at IS NULL
         AND created_at >= datetime('now', '-30 days')
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .bind(empresaId, limite)
    .all<EventoRow>();

  const eventosFiltrados = (todosPendentes.results || []).filter((evento) => {
    const consumidores = parseJsonArray(evento.consumidores);
    const processadoPor = parseJsonArray(evento.processado_por);
    return consumidores.includes(consumidor) && !processadoPor.includes(consumidor);
  });

  let processados = 0;
  let erros = 0;
  const acoes: string[] = [];

  for (const evento of eventosFiltrados) {
    try {
      const payload = JSON.parse(evento.payload) as DomainEventPayloadBase;
      const tipo = evento.tipo as DomainEventTipo;
      const handler = handlers.get(consumidor)?.get(tipo);

      if (handler) {
        await handler(db, tipo, payload);
        acoes.push(`OK:${consumidor}←${tipo}:${payload.funcionario_id ?? ''}`);
      } else {
        acoes.push(`SKIP:${consumidor}←${tipo}`);
      }

      await marcarEventoConsumido(db, evento, consumidor);
      processados++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await marcarEventoConsumido(db, evento, consumidor, message);
      acoes.push(`ERR:${consumidor}←${evento.tipo}:${message}`);
      processados++;
      erros++;
    }
  }

  return { processados, erros, acoes };
}
