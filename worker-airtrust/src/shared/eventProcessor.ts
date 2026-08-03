import type { D1Database } from '@cloudflare/workers-types';
import type { DomainEventPayloadBase, DomainEventTipo } from './domainEvents';

interface EventoRow {
  id: string;
  empresa_id?: string | number;
  modulo: string;
  tipo: string;
  payload: string;
  consumidores?: string | null;
  processado_por?: string | null;
  ultimo_erro?: string | null;
}

type EventHandler = (
  db: D1Database,
  tipo: DomainEventTipo,
  payload: DomainEventPayloadBase,
) => Promise<void>;

export type DomainEventConsumerStatus =
  | 'pending'
  | 'processing'
  | 'retry'
  | 'processed'
  | 'dead_letter';

export interface DomainEventConsumerState {
  consumidor: string;
  status: DomainEventConsumerStatus;
  tentativas: number;
  claimed_at?: string;
  next_attempt_at?: string;
}

type InternalConsumerToken = {
  kind: 'claim' | 'retry' | 'dead';
  consumidor: string;
  tentativas: number;
  timestamp?: number;
};

const handlers = new Map<string, Map<string, EventHandler>>();
const CLAIM_LEASE_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const FETCH_MULTIPLIER = 10;
const MAX_FETCH_LIMIT = 1000;
const TOKEN_PREFIX = '__domain_event__';

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function parseInternalToken(value: string): InternalConsumerToken | null {
  const [prefix, kind, consumidor, tentativasRaw, timestampRaw] = value.split('|');
  if (prefix !== TOKEN_PREFIX || !['claim', 'retry', 'dead'].includes(kind) || !consumidor) {
    return null;
  }

  const tentativas = Number(tentativasRaw);
  const timestamp = timestampRaw ? Number(timestampRaw) : undefined;
  if (!Number.isInteger(tentativas) || tentativas < 1) return null;
  if (timestamp !== undefined && !Number.isFinite(timestamp)) return null;

  return {
    kind: kind as InternalConsumerToken['kind'],
    consumidor,
    tentativas,
    timestamp,
  };
}

function makeInternalToken(
  kind: InternalConsumerToken['kind'],
  consumidor: string,
  tentativas: number,
  timestamp?: number,
): string {
  return [TOKEN_PREFIX, kind, consumidor, String(tentativas), timestamp ? String(timestamp) : '']
    .join('|')
    .replace(/\|$/, '');
}

function getInternalTokenForConsumer(
  processadoPor: string[],
  consumidor: string,
): InternalConsumerToken | null {
  const tokens = processadoPor
    .map(parseInternalToken)
    .filter(
      (token): token is InternalConsumerToken =>
        token !== null && token.consumidor === consumidor,
    );

  return tokens.at(-1) ?? null;
}

function getConsumerState(
  processadoPor: string[],
  consumidor: string,
): DomainEventConsumerState {
  if (processadoPor.includes(consumidor)) {
    return { consumidor, status: 'processed', tentativas: 0 };
  }

  const token = getInternalTokenForConsumer(processadoPor, consumidor);
  if (!token) return { consumidor, status: 'pending', tentativas: 0 };

  if (token.kind === 'dead') {
    return { consumidor, status: 'dead_letter', tentativas: token.tentativas };
  }

  if (token.kind === 'retry') {
    return {
      consumidor,
      status: 'retry',
      tentativas: token.tentativas,
      next_attempt_at: token.timestamp ? new Date(token.timestamp).toISOString() : undefined,
    };
  }

  return {
    consumidor,
    status: 'processing',
    tentativas: token.tentativas,
    claimed_at: token.timestamp ? new Date(token.timestamp).toISOString() : undefined,
  };
}

export function getDomainEventConsumerStates(
  consumidoresValue: string | null | undefined,
  processadoPorValue: string | null | undefined,
): DomainEventConsumerState[] {
  const consumidores = parseJsonArray(consumidoresValue);
  const processadoPor = parseJsonArray(processadoPorValue);
  return consumidores.map((consumidor) => getConsumerState(processadoPor, consumidor));
}

function canAttempt(state: DomainEventConsumerState, nowMs: number): boolean {
  if (state.status === 'pending') return true;
  if (state.status === 'retry') {
    return !state.next_attempt_at || Date.parse(state.next_attempt_at) <= nowMs;
  }
  if (state.status === 'processing') {
    return !state.claimed_at || Date.parse(state.claimed_at) <= nowMs - CLAIM_LEASE_MS;
  }
  return false;
}

function removeInternalTokensForConsumer(values: string[], consumidor: string): string[] {
  return values.filter((value) => parseInternalToken(value)?.consumidor !== consumidor);
}

function retryDelayMs(tentativas: number): number {
  const delays = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
  return delays[Math.min(Math.max(tentativas - 1, 0), delays.length - 1)];
}

export function registerHandler(consumidor: string, tipo: DomainEventTipo, handler: EventHandler) {
  if (!handlers.has(consumidor)) {
    handlers.set(consumidor, new Map());
  }
  handlers.get(consumidor)?.set(tipo, handler);
}

async function claimEvent(
  db: D1Database,
  evento: EventoRow,
  consumidor: string,
  nowMs: number,
): Promise<{ claimToken: string; tentativas: number } | null> {
  const currentRaw = evento.processado_por || '[]';
  const currentValues = parseJsonArray(currentRaw);
  const currentState = getConsumerState(currentValues, consumidor);
  if (!canAttempt(currentState, nowMs)) return null;

  const tentativas = currentState.tentativas + 1;
  const claimToken = makeInternalToken('claim', consumidor, tentativas, nowMs);
  const claimedValues = [...removeInternalTokensForConsumer(currentValues, consumidor), claimToken];

  const claimed = await db
    .prepare(
      `UPDATE domain_events
       SET processado_por = ?
       WHERE id = ?
         AND processado = 0
         AND COALESCE(processado_por, '[]') = ?
       RETURNING id`,
    )
    .bind(JSON.stringify(claimedValues), evento.id, currentRaw)
    .first<{ id: string }>();

  return claimed?.id ? { claimToken, tentativas } : null;
}

async function finalizeClaim(
  db: D1Database,
  eventoId: string,
  claimToken: string,
  replacement: string | null,
  errorMessage?: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await db
      .prepare(
        `SELECT consumidores, processado_por, ultimo_erro
         FROM domain_events
         WHERE id = ?
         LIMIT 1`,
      )
      .bind(eventoId)
      .first<{
        consumidores: string | null;
        processado_por: string | null;
        ultimo_erro: string | null;
      }>();

    if (!current) return false;

    const currentRaw = current.processado_por || '[]';
    const currentValues = parseJsonArray(currentRaw);
    if (!currentValues.includes(claimToken)) return false;

    const nextValues = currentValues.flatMap((value) => {
      if (value !== claimToken) return [value];
      return replacement ? [replacement] : [];
    });
    const consumidores = parseJsonArray(current.consumidores);
    const states = consumidores.map((consumidor) => getConsumerState(nextValues, consumidor));
    const terminal = states.every(
      (state) => state.status === 'processed' || state.status === 'dead_letter',
    );
    const allProcessed = states.every((state) => state.status === 'processed');
    const nextError = allProcessed ? null : errorMessage || current.ultimo_erro || null;

    const result = await db
      .prepare(
        `UPDATE domain_events
         SET processado_por = ?,
             processado = ?,
             processed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
             ultimo_erro = ?
         WHERE id = ?
           AND COALESCE(processado_por, '[]') = ?`,
      )
      .bind(
        JSON.stringify(nextValues),
        terminal ? 1 : 0,
        terminal ? 1 : 0,
        nextError,
        eventoId,
        currentRaw,
      )
      .run();

    if ((result.meta?.changes || 0) > 0) return true;
  }

  return false;
}

export async function processarEventosParaModulo(
  db: D1Database,
  empresaId: string,
  consumidor: string,
  limite = 100,
): Promise<{ processados: number; erros: number; acoes: string[] }> {
  const fetchLimit = Math.min(Math.max(limite * FETCH_MULTIPLIER, limite), MAX_FETCH_LIMIT);
  const todosPendentes = await db
    .prepare(
      `SELECT id, empresa_id, modulo, tipo, payload, consumidores, processado_por, ultimo_erro
       FROM domain_events
       WHERE empresa_id = ?
         AND processado = 0
         AND deleted_at IS NULL
         AND EXISTS (
           SELECT 1
           FROM json_each(
             CASE
               WHEN json_valid(COALESCE(domain_events.consumidores, '[]'))
                 THEN COALESCE(domain_events.consumidores, '[]')
               ELSE '[]'
             END
           )
           WHERE value = ?
         )
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .bind(empresaId, consumidor, fetchLimit)
    .all<EventoRow>();

  const nowMs = Date.now();
  const eventosFiltrados = (todosPendentes.results || [])
    .filter((evento) => {
      const state = getConsumerState(parseJsonArray(evento.processado_por), consumidor);
      return canAttempt(state, nowMs);
    })
    .slice(0, limite);

  let processados = 0;
  let erros = 0;
  const acoes: string[] = [];

  for (const evento of eventosFiltrados) {
    const claim = await claimEvent(db, evento, consumidor, Date.now());
    if (!claim) continue;

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

      const finalized = await finalizeClaim(db, evento.id, claim.claimToken, consumidor);
      if (!finalized) {
        throw new Error('Falha ao confirmar claim do evento após execução do handler');
      }
      processados++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const deadLetter = claim.tentativas >= MAX_ATTEMPTS;
      const replacement = deadLetter
        ? makeInternalToken('dead', consumidor, claim.tentativas)
        : makeInternalToken(
            'retry',
            consumidor,
            claim.tentativas,
            Date.now() + retryDelayMs(claim.tentativas),
          );

      await finalizeClaim(db, evento.id, claim.claimToken, replacement, message);
      acoes.push(`${deadLetter ? 'DEAD' : 'ERR'}:${consumidor}←${evento.tipo}:${message}`);
      erros++;
    }
  }

  return { processados, erros, acoes };
}
