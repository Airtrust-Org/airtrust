import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { processarEventosParaModuloMock } = vi.hoisted(() => ({
  processarEventosParaModuloMock: vi.fn(),
}));

vi.mock('../shared/handlers', () => ({
  processarEventosParaModulo: processarEventosParaModuloMock,
}));

import { domainEventProcessorMiddleware } from '../middleware/domainEventProcessor';

type TestEnv = {
  Bindings: {
    DB: D1Database;
    ENVIRONMENT?: string;
  };
  Variables: {
    requestId?: string;
    empresaId?: string | number;
    userId?: string | number;
    user?: {
      id?: number;
      empresa_id?: string | number;
    };
  };
};

function buildApp() {
  const app = new Hono<TestEnv>();

  app.use('*', async (c, next) => {
    c.set('requestId', 'req-domain-events');
    c.set('empresaId', '6');
    c.set('user', { id: 42, empresa_id: '6' });
    await next();
  });
  app.use('*', domainEventProcessorMiddleware());
  app.post('/api/frms/checkin', (c) => c.json({ success: true }));

  return app;
}

beforeEach(() => {
  processarEventosParaModuloMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('domain event processor observability', () => {
  it('keeps the main response successful and logs rejected background processing', async () => {
    const app = buildApp();
    const pending: Promise<unknown>[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processarEventosParaModuloMock.mockRejectedValueOnce(new Error('processor unavailable'));

    const executionContext = {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
      passThroughOnException() {},
      props: {},
    } as ExecutionContext;

    const response = await app.request(
      '/api/frms/checkin',
      { method: 'POST' },
      { DB: {} as D1Database, ENVIRONMENT: 'test' },
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(pending).toHaveLength(1);

    await Promise.all(pending);

    expect(processarEventosParaModuloMock).toHaveBeenCalledWith({}, '6', 'frms');
    const serializedLogs = logSpy.mock.calls.map(([entry]) => String(entry));
    const failureLog = serializedLogs.find((entry) =>
      entry.includes('Falha no processamento assíncrono de eventos de domínio'),
    );

    expect(failureLog).toBeDefined();
    expect(failureLog).toContain('req-domain-events');
    expect(failureLog).toContain('processor unavailable');
    expect(failureLog).toContain('"empresaId":"6"');
    expect(failureLog).toContain('"modulo":"frms"');
  });

  it('logs a synchronous waitUntil scheduling failure without changing the response', async () => {
    const app = buildApp();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processarEventosParaModuloMock.mockResolvedValueOnce({ processados: 0, erros: 0 });

    const executionContext = {
      waitUntil() {
        throw new Error('waitUntil unavailable');
      },
      passThroughOnException() {},
      props: {},
    } as ExecutionContext;

    const response = await app.request(
      '/api/frms/checkin',
      { method: 'POST' },
      { DB: {} as D1Database, ENVIRONMENT: 'test' },
      executionContext,
    );

    expect(response.status).toBe(200);
    const serializedLogs = logSpy.mock.calls.map(([entry]) => String(entry));
    const schedulingLog = serializedLogs.find((entry) =>
      entry.includes('Falha ao agendar processamento de eventos de domínio'),
    );

    expect(schedulingLog).toBeDefined();
    expect(schedulingLog).toContain('req-domain-events');
    expect(schedulingLog).toContain('waitUntil unavailable');
  });
});
