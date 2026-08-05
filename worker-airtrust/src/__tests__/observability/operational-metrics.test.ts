import { describe, expect, it, vi } from 'vitest';
import {
  classifyHttpError,
  classifyOperationalFlow,
  emitHttpMetric,
  normalizeMetricRoute,
  sanitizeOperationalMetric,
} from '../../observability/operational-metrics';

describe('operational metrics', () => {
  it('removes PII, credentials and raw certificate content', () => {
    const metric = sanitizeOperationalMetric({
      event: 'operational_metric',
      route: '/api/funcionarios/123',
      email: 'person@example.com',
      cpf: '123.456.789-10',
      token: 'eyJverylongsecretvalue',
      nested: { nome: 'Pessoa', safe_count: 4 },
      free_text: 'contact person@example.com',
    });
    expect(metric).toEqual({
      event: 'operational_metric',
      route: '/api/funcionarios/123',
      nested: { safe_count: 4 },
    });
  });

  it('normalizes identifiers and classifies critical flows', () => {
    expect(normalizeMetricRoute('/api/funcionarios/123/qualificacoes/456')).toBe(
      '/api/funcionarios/:id/qualificacoes/:id',
    );
    expect(classifyOperationalFlow('/api/lms/progresso/conclusao')).toBe('lms_completion');
    expect(classifyOperationalFlow('/api/certificados/validar')).toBe('certificate');
    expect(classifyHttpError(401)).toBe('authentication');
    expect(classifyHttpError(403)).toBe('authorization');
    expect(classifyHttpError(500)).toBe('server');
  });

  it('emits one structured metric without query strings', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    emitHttpMetric({
      pathname: '/api/certificados/123?token=secret',
      method: 'get',
      status: 200,
      latencyMs: 12.4,
    });
    const payload = JSON.parse(String(spy.mock.calls[0][0]));
    expect(payload).toMatchObject({
      event: 'operational_metric',
      operation: 'certificate',
      route: '/api/certificados/:id',
      method: 'GET',
      status: 200,
      latency_ms: 12,
    });
    expect(JSON.stringify(payload)).not.toContain('secret');
    spy.mockRestore();
  });
});
