import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware BEFORE importing the route
vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('userRole', 'admin');
    c.set('empresaId', 1);
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
  requirePermission: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

import escalasCrud from '../../routes/escalas-crud';
import type { Env } from '../../types';

describe('Escalas CRUD Observability', () => {
  let app: Hono<{ Bindings: Env }>;
  const originalConsoleLog = console.log;
  const mockConsoleLog = vi.fn();

  beforeEach(() => {
    console.log = mockConsoleLog;
    app = new Hono<{ Bindings: Env }>();

    app.use('*', async (c, next) => {
      // Inject DB mock that always throws
      const mockDB = {
        prepare: () => ({
          bind: () => ({
            first: async () => { throw new Error('Simulated D1 Error (UNIQUE constraint failed)'); },
            all: async () => { throw new Error('Simulated D1 Error'); },
            run: async () => { throw new Error('Simulated D1 Error'); },
          }),
        }),
      };
      
      c.env = { DB: mockDB as any, ENVIRONMENT: 'test' } as unknown as Env;
      await next();
    });

    app.route('/', escalasCrud);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    vi.clearAllMocks();
  });

  it('should return 500 without leaking details when GET / fails', async () => {
    const res = await app.request('/?ano=2026');
    
    expect(res.status).toBe(500);
    
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Erro interno do servidor' });
    
    expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(mockConsoleLog.mock.calls[0][0]));
    expect(entry).toMatchObject({
      level: 'ERROR',
      message: 'escalas_list_failed',
      context: { empresaId: 1, userId: 42 },
      error: { message: 'database_operation_failed' },
    });
    expect(JSON.stringify(entry)).not.toContain('Simulated D1 Error');
    expect(entry.data).toBeUndefined();
  });

  it('should return 500 without leaking payload when POST / fails', async () => {
    const reqBody = { ano: 2026, mes: 7, titulo: 'Escala Secreta', observacoes: 'Dados sensiveis' };
    
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });
    
    expect(res.status).toBe(500);
    
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Erro interno do servidor' });
    
    expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(mockConsoleLog.mock.calls[0][0]));
    expect(entry).toMatchObject({
      level: 'ERROR',
      message: 'escalas_create_failed',
      context: { empresaId: 1, userId: 42 },
      error: { message: 'database_operation_failed' },
    });
    expect(JSON.stringify(entry)).not.toContain('Simulated D1 Error');
    expect(JSON.stringify(entry)).not.toContain('Escala Secreta');
    expect(JSON.stringify(entry)).not.toContain('Dados sensiveis');
  });
});
