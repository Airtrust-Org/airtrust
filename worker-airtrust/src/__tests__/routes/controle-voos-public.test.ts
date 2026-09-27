import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';
import publicRoutes from '../../routes/controle-voos-public';
import { signFlightPlanningPdfToken, type FlightPlanningPdf } from '../../services/controle-voos/flight-planning-attachment';

const attachment: FlightPlanningPdf = {
  documentId: 77,
  empresaId: 6,
  vooId: 123,
  r2Key: 'controle-voos/6/123/documentos/plano_voo/teste.pdf',
  fileName: 'planejamento-previo.pdf',
  contentType: 'application/pdf',
  size: 12,
};

function env(): Env {
  const metadata = JSON.stringify({
    action: 'flight_attachment',
    document_type: 'PLANO_VOO',
    r2_key: attachment.r2Key,
    file_name: attachment.fileName,
    content_type: 'application/pdf',
    size: attachment.size,
  });
  const db = {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ first: vi.fn(async () => ({ id: 77, metadata_json: metadata })) })),
    })),
  } as unknown as D1Database;
  const bytes = new TextEncoder().encode('%PDF-1.7 test');
  const bucket = {
    get: vi.fn(async () => ({
      body: new Response(bytes).body,
      writeHttpMetadata: (headers: Headers) => headers.set('Content-Type', 'application/pdf'),
    })),
  } as unknown as R2Bucket;
  return {
    DB: db,
    BUCKET: bucket,
    JWT_SECRET: 'public-pdf-secret',
    ENVIRONMENT: 'test' as Env['ENVIRONMENT'],
    API_URL: 'http://localhost',
    FRONTEND_URL: 'http://localhost',
    DEBUG: 'false',
    LOG_LEVEL: 'error',
  };
}

function app() {
  const instance = new Hono<{ Bindings: Env }>();
  instance.onError(errorHandler);
  instance.route('/api/public/controle-voos', publicRoutes);
  return instance;
}

describe('public flight planning PDF route', () => {
  it('serve apenas o PDF autorizado por token assinado e sem cache publico', async () => {
    const runtime = env();
    const token = await signFlightPlanningPdfToken(runtime.JWT_SECRET, attachment);
    const response = await app().fetch(
      new Request(`http://localhost/api/public/controle-voos/planejamento-previo/${token}`),
      runtime,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toContain('%PDF-1.7');
  });

  it('nega token invalido sem expor o documento', async () => {
    const response = await app().fetch(
      new Request('http://localhost/api/public/controle-voos/planejamento-previo/token-invalido'),
      env(),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(404);
  });
});
