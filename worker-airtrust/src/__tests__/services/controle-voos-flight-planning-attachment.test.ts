import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import {
  arrayBufferToBase64,
  buildFlightPlanningEmailAttachment,
  findLatestFlightPlanningPdf,
  signFlightPlanningPdfToken,
  verifyFlightPlanningPdfToken,
  type FlightPlanningPdf,
} from '../../services/controle-voos/flight-planning-attachment';

const attachment: FlightPlanningPdf = {
  documentId: 77,
  empresaId: 6,
  vooId: 123,
  r2Key: 'controle-voos/6/123/documentos/plano_voo/teste.pdf',
  fileName: 'planejamento-previo.pdf',
  contentType: 'application/pdf',
  size: 12,
};

function metadata() {
  return JSON.stringify({
    action: 'flight_attachment',
    document_type: 'PLANO_VOO',
    r2_key: attachment.r2Key,
    file_name: attachment.fileName,
    content_type: 'application/pdf',
    size: attachment.size,
  });
}

describe('flight planning PDF attachment', () => {
  it('resolve somente o PDF de planejamento do mesmo tenant e voo', async () => {
    const first = vi.fn(async () => ({ id: 77, metadata_json: metadata() }));
    const bind = vi.fn(() => ({ first }));
    const db = { prepare: vi.fn(() => ({ bind })) } as unknown as D1Database;

    await expect(findLatestFlightPlanningPdf(db, 6, 123)).resolves.toEqual(attachment);
    expect(bind).toHaveBeenCalledWith(6, 123, 'flight_attachment', 'PLANO_VOO');
  });

  it('gera token temporario que preserva tenant, voo e documento exatos', async () => {
    const token = await signFlightPlanningPdfToken('secret-for-test', attachment);
    expect(token.startsWith('v1.')).toBe(true);
    expect(token.startsWith('eyJ')).toBe(false);
    await expect(verifyFlightPlanningPdfToken('secret-for-test', token)).resolves.toMatchObject({
      empresaId: 6,
      vooId: 123,
      documentId: 77,
    });
    await expect(verifyFlightPlanningPdfToken('wrong-secret', token)).resolves.toBeNull();
  });

  it('prepara o mesmo PDF do R2 como anexo base64 de e-mail', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 test');
    const buffer = bytes.buffer as ArrayBuffer;
    const bucket = {
      get: vi.fn(async () => ({ arrayBuffer: async () => buffer })),
    } as unknown as R2Bucket;
    const env = { BUCKET: bucket } as Env;

    await expect(buildFlightPlanningEmailAttachment(env, attachment)).resolves.toEqual({
      name: 'planejamento-previo.pdf',
      content: arrayBufferToBase64(buffer),
    });
  });
});
