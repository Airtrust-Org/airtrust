import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware BEFORE importing the route
vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 'mock-user-id');
    c.set('userRole', 'admin');
    c.set('empresaId', 1);
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

import escalasCrud from '../../routes/escalas-crud';
import type { Env } from '../../types';

describe('Escalas CRUD Observability', () => {
  let app: Hono<{ Bindings: Env }>;
  const originalConsoleError = console.error;
  const mockConsoleError = vi.fn();

  beforeEach(() => {
    console.error = mockConsoleError;
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
      
      c.env = { DB: mockDB as any } as Env;
      await next();
    });

    app.route('/', escalasCrud);
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.clearAllMocks();
  });

  it('should return 500 without leaking details when GET / fails', async () => {
    const res = await app.request('/?ano=2026');
    
    expect(res.status).toBe(500);
    
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Erro interno do servidor' });
    
    expect(mockConsoleError).toHaveBeenCalledTimes(1);
    const logCall = mockConsoleError.mock.calls[0][0];
    
    expect(logCall).toContain('[escalas-crud]');
    expect(logCall).toContain('[GET /]');
    expect(logCall).toContain('1'); // empresaId
    expect(logCall).toContain('Simulated D1 Error');
    expect(logCall).not.toContain('2026'); // the query param shouldn't be logged
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
    
    expect(mockConsoleError).toHaveBeenCalledTimes(1);
    const logCall = mockConsoleError.mock.calls[0][0];
    
    expect(logCall).toContain('[escalas-crud]');
    expect(logCall).toContain('[POST /]');
    expect(logCall).toContain('1'); // empresaId
    expect(logCall).toContain('Simulated D1 Error');
    
    // Crucial validation: no payload leaks
    expect(logCall).not.toContain('Escala Secreta');
    expect(logCall).not.toContain('Dados sensiveis');
  });
});
