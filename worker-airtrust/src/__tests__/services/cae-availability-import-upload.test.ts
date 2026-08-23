import { describe, expect, it } from 'vitest';
import {
  CaeExtractionUnavailableError,
  importCaeAvailabilityFromUpload,
} from '../../services/cae-availability-import';

describe('CAE availability upload import contract', () => {
  it('retorna EXTRACTION_UNAVAILABLE quando extrator não estiver disponível', async () => {
    const result = await importCaeAvailabilityFromUpload({
      empresaId: 1,
      fileName: 'cae.pdf',
      mimeType: 'application/pdf',
      objectKey: 'cae-availability/1/cae.pdf',
    });
    expect(result.status).toBe('EXTRACTION_UNAVAILABLE');
    if (result.status === 'EXTRACTION_UNAVAILABLE') {
      expect(result.error).toMatch(/extração automática de PDF/i);
    }
  });

  it('normaliza candidato extraído quando provider retorna payload válido', async () => {
    const result = await importCaeAvailabilityFromUpload({
      empresaId: 1,
      fileName: 'cae.pdf',
      mimeType: 'application/pdf',
      objectKey: 'cae-availability/1/cae.pdf',
      extractor: {
        async extract() {
          return {
            schema_version: 'airtrust.cae_availability.v1',
            provider: 'CAE',
            source: { kind: 'PDF', filename: 'cae.pdf' },
            slots: [
              {
                equipment: 'AW139',
                date: '2026-11-20',
                start_time: '08:00',
                end_date: '2026-11-20',
                end_time: '12:00',
                duration_minutes: 240,
                state: 'OFFERED',
                confidence: 0.95,
              },
            ],
            warnings: [],
          };
        },
      },
    });
    expect(result.status).toBe('EXTRACTED');
    if (result.status === 'EXTRACTED') {
      expect(result.import.status).toBe('VALIDADO');
      expect(result.import.document?.slots).toHaveLength(1);
    }
  });

  it('propaga erro inesperado do extrator', async () => {
    await expect(
      importCaeAvailabilityFromUpload({
        empresaId: 1,
        fileName: 'cae.pdf',
        mimeType: 'application/pdf',
        objectKey: 'cae-availability/1/cae.pdf',
        extractor: {
          async extract() {
            throw new Error('boom');
          },
        },
      }),
    ).rejects.toThrow('boom');
  });

  it('expõe classe de indisponibilidade para adapters externos', () => {
    const err = new CaeExtractionUnavailableError();
    expect(err.name).toBe('CaeExtractionUnavailableError');
  });
});
