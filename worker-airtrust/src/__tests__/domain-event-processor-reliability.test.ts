import { describe, expect, it } from 'vitest';
import {
  getDomainEventConsumerStates,
  processarEventosParaModulo,
  registerHandler,
} from '../shared/eventProcessor';

interface FakeEvent {
  id: string;
  empresa_id: number;
  modulo: string;
  tipo: string;
  payload: string;
  consumidores: string;
  processado_por: string;
  processado: number;
  ultimo_erro: string | null;
  processed_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

class FakeStatement {
  private bindings: unknown[] = [];

  constructor(
    private readonly db: FakeDomainEventDb,
    private readonly sql: string,
  ) {}

  bind(...bindings: unknown[]) {
    this.bindings = bindings;
    return this;
  }

  async all<T>() {
    return this.db.all(this.sql, this.bindings) as { results: T[] };
  }

  async first<T>() {
    return this.db.first(this.sql, this.bindings) as T | null;
  }

  async run<T>() {
    return this.db.run(this.sql, this.bindings) as T;
  }
}

class FakeDomainEventDb {
  readonly event: FakeEvent;

  constructor(consumidor: string) {
    this.event = {
      id: 'evt-1',
      empresa_id: 6,
      modulo: 'funcionarios',
      tipo: 'FUNCIONARIO_CRIADO',
      payload: JSON.stringify({
        empresa_id: 6,
        origem_modulo: 'funcionarios',
        funcionario_id: '99',
      }),
      consumidores: JSON.stringify([consumidor]),
      processado_por: '[]',
      processado: 0,
      ultimo_erro: null,
      processed_at: null,
      deleted_at: null,
      created_at: '2026-08-03 00:00:00',
    };
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  all(sql: string, bindings: unknown[]) {
    if (!sql.includes('FROM domain_events')) throw new Error(`SQL não suportado em all: ${sql}`);

    const empresaId = Number(bindings[0]);
    const consumidor = String(bindings[1]);
    const limit = Number(bindings[2]);
    const consumidores = JSON.parse(this.event.consumidores) as string[];
    const matches =
      this.event.empresa_id === empresaId &&
      this.event.processado === 0 &&
      this.event.deleted_at === null &&
      consumidores.includes(consumidor);

    return { results: matches ? [{ ...this.event }].slice(0, limit) : [] };
  }

  first(sql: string, bindings: unknown[]) {
    if (sql.includes('UPDATE domain_events') && sql.includes('RETURNING id')) {
      const [nextRaw, eventId, expectedRaw] = bindings.map(String);
      if (
        this.event.id !== eventId ||
        this.event.processado !== 0 ||
        this.event.processado_por !== expectedRaw
      ) {
        return null;
      }

      this.event.processado_por = nextRaw;
      return { id: this.event.id };
    }

    if (sql.includes('SELECT consumidores, processado_por, ultimo_erro')) {
      const eventId = String(bindings[0]);
      if (eventId !== this.event.id) return null;
      return {
        consumidores: this.event.consumidores,
        processado_por: this.event.processado_por,
        ultimo_erro: this.event.ultimo_erro,
      };
    }

    throw new Error(`SQL não suportado em first: ${sql}`);
  }

  run(sql: string, bindings: unknown[]) {
    if (!sql.includes('UPDATE domain_events')) throw new Error(`SQL não suportado em run: ${sql}`);

    const [nextRaw, processado, terminal, ultimoErro, eventId, expectedRaw] = bindings;
    if (String(eventId) !== this.event.id || String(expectedRaw) !== this.event.processado_por) {
      return { meta: { changes: 0 } };
    }

    this.event.processado_por = String(nextRaw);
    this.event.processado = Number(processado);
    this.event.processed_at = Number(terminal) === 1 ? '2026-08-03 00:01:00' : null;
    this.event.ultimo_erro = ultimoErro === null ? null : String(ultimoErro);
    return { meta: { changes: 1 } };
  }
}

function asD1(db: FakeDomainEventDb): D1Database {
  return db as unknown as D1Database;
}

describe('domain event processor reliability', () => {
  it('permite que apenas um processador concorrente execute o handler', async () => {
    const consumidor = 'atomic-claim-test';
    const db = new FakeDomainEventDb(consumidor);
    let executions = 0;

    registerHandler(consumidor, 'FUNCIONARIO_CRIADO', async () => {
      executions++;
      await Promise.resolve();
    });

    const [first, second] = await Promise.all([
      processarEventosParaModulo(asD1(db), '6', consumidor),
      processarEventosParaModulo(asD1(db), '6', consumidor),
    ]);

    expect(executions).toBe(1);
    expect(first.processados + second.processados).toBe(1);
    expect(first.erros + second.erros).toBe(0);
    expect(JSON.parse(db.event.processado_por)).toEqual([consumidor]);
    expect(db.event.processado).toBe(1);
    expect(db.event.ultimo_erro).toBeNull();
  });

  it('agenda retry sem marcar o consumidor como processado na primeira falha', async () => {
    const consumidor = 'retry-test';
    const db = new FakeDomainEventDb(consumidor);
    let executions = 0;

    registerHandler(consumidor, 'FUNCIONARIO_CRIADO', async () => {
      executions++;
      throw new Error('falha transitória');
    });

    const result = await processarEventosParaModulo(asD1(db), '6', consumidor);
    const processadoPor = JSON.parse(db.event.processado_por) as string[];

    expect(result).toMatchObject({ processados: 0, erros: 1 });
    expect(executions).toBe(1);
    expect(processadoPor).not.toContain(consumidor);
    expect(processadoPor.some((value) => value.includes(`|retry|${consumidor}|1|`))).toBe(true);
    expect(db.event.processado).toBe(0);
    expect(db.event.ultimo_erro).toBe('falha transitória');

    const immediateRetry = await processarEventosParaModulo(asD1(db), '6', consumidor);
    expect(immediateRetry).toMatchObject({ processados: 0, erros: 0 });
    expect(executions).toBe(1);
  });

  it('expõe estados de retry, processado e dead-letter por consumidor', () => {
    const states = getDomainEventConsumerStates(
      JSON.stringify(['compliance', 'escalas', 'hospedagem']),
      JSON.stringify([
        '__domain_event__|retry|compliance|2|4102444800000',
        'escalas',
        '__domain_event__|dead|hospedagem|5',
      ]),
    );

    expect(states).toEqual([
      expect.objectContaining({ consumidor: 'compliance', status: 'retry', tentativas: 2 }),
      expect.objectContaining({ consumidor: 'escalas', status: 'processed' }),
      expect.objectContaining({ consumidor: 'hospedagem', status: 'dead_letter', tentativas: 5 }),
    ]);
  });
});
