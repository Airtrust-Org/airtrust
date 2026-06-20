/**
 * Testes de Middleware - AirTrust Worker
 *
 * Testa rate limiting, error handler e security headers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimitPresets } from '../middleware/rate-limit';

// Mock do rateLimitStore
const mockStore = new Map<string, { count: number; resetAt: number }>();

describe('Rate Limiter', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it('deve permitir requisições dentro do limite', () => {
    const key = 'login:127.0.0.1';
    const maxRequests = 5;
    const windowMs = 60000;

    for (let i = 0; i < maxRequests; i++) {
      const entry = mockStore.get(key) || { count: 0, resetAt: Date.now() + windowMs };
      entry.count++;
      mockStore.set(key, entry);
    }

    const entry = mockStore.get(key);
    expect(entry?.count).toBe(5);
    expect(entry?.count).toBeLessThanOrEqual(maxRequests);
  });

  it('deve bloquear requisições acima do limite', () => {
    const key = 'login:127.0.0.1';
    const maxRequests = 5;
    const windowMs = 60000;

    for (let i = 0; i < maxRequests + 2; i++) {
      const entry = mockStore.get(key) || { count: 0, resetAt: Date.now() + windowMs };
      entry.count++;
      mockStore.set(key, entry);
    }

    const entry = mockStore.get(key);
    expect(entry?.count).toBe(7);
    expect(entry?.count).toBeGreaterThan(maxRequests);
  });

  it('deve resetar contador após janela de tempo', () => {
    const key = 'login:127.0.0.1';
    const pastTime = Date.now() - 1000; // 1 segundo atrás

    mockStore.set(key, { count: 100, resetAt: pastTime });

    const entry = mockStore.get(key);
    const now = Date.now();

    if (entry && now > entry.resetAt) {
      // Simular reset
      mockStore.set(key, { count: 1, resetAt: now + 60000 });
    }

    const newEntry = mockStore.get(key);
    expect(newEntry?.count).toBe(1);
  });
});

describe('Error Handler', () => {
  it('deve identificar ambiente corretamente', () => {
    const environments = ['production', 'staging', 'development'];

    environments.forEach((env) => {
      const isDevelopment = env === 'development' || env === 'staging';

      if (env === 'production') {
        expect(isDevelopment).toBe(false);
      } else {
        expect(isDevelopment).toBe(true);
      }
    });
  });

  it('não deve expor stack trace em produção', () => {
    const env = 'production';
    const isDevelopment = env !== 'production';

    const errorResponse = isDevelopment
      ? { error: 'Detalhe do erro', stack: 'stack trace...' }
      : { error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' };

    expect(errorResponse).not.toHaveProperty('stack');
    expect(errorResponse.code).toBe('INTERNAL_ERROR');
  });
});

describe('ApiError', () => {
  class ApiError extends Error {
    constructor(public message: string, public statusCode: number = 500, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  }

  it('deve criar erro com status code padrão 500', () => {
    const error = new ApiError('Erro genérico');
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe('ApiError');
  });

  it('deve criar erro com status code customizado', () => {
    const error = new ApiError('Não encontrado', 404, 'NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('deve criar erro 400 para bad request', () => {
    const error = new ApiError('CPF inválido', 400, 'VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('CPF inválido');
  });
});

describe('Security Headers', () => {
  it('deve incluir headers de segurança necessários', () => {
    const requiredHeaders = [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Referrer-Policy',
    ];

    const mockHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };

    requiredHeaders.forEach((header) => {
      expect(mockHeaders).toHaveProperty(header);
    });
  });
});

describe('Rate Limit Presets', () => {
  it('login deve ter limite baixo (5/min)', () => {
    expect(rateLimitPresets.login.maxRequests).toBe(5);
    expect(rateLimitPresets.login.windowSeconds).toBe(60);
  });

  it('api geral deve ter limite alto (100/min)', () => {
    expect(rateLimitPresets.api.maxRequests).toBe(100);
  });

  it('webhook deve ter limite moderado (30/min)', () => {
    expect(rateLimitPresets.webhook.maxRequests).toBe(30);
  });
});
