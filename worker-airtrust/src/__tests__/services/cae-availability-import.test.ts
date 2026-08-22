import { describe, expect, it } from 'vitest';
import { prepareCaeAvailabilityImport } from './../../services/cae-availability-import';

function candidate(confidence = 0.95) {
  return {
    schema_version: 'airtrust.cae_availability.v1',
    provider: 'CAE',
    source: { kind: 'PDF', filename: 'availability.pdf' },
    slots: [
      {
        equipment: 'AW139',
        date: '2026-11-20',
        start_time: '08:00',
        end_date: '2026-11-20',
        end_time: '12:00',
        duration_minutes: 240,
        state: 'OFFERED',
        confidence,
      },
    ],
    warnings: [],
  };
}

describe('prepareCaeAvailabilityImport', () => {
  it('valida candidato confiável sem delegar decisão operacional à IA', () => {
    const result = prepareCaeAvailabilityImport({
      source_file_name: 'availability.pdf',
      source_kind: 'PDF',
      raw_candidate: candidate(),
    });
    expect(result.status).toBe('VALIDADO');
    expect(result.requires_human_review).toBe(false);
    expect(result.document?.slots[0].equipment).toBe('AW139');
  });

  it('baixa confiança exige revisão humana', () => {
    const result = prepareCaeAvailabilityImport({
      source_file_name: 'availability.pdf',
      source_kind: 'PDF',
      raw_candidate: candidate(0.7),
    });
    expect(result.status).toBe('AGUARDANDO_REVISAO');
    expect(result.requires_human_review).toBe(true);
  });

  it('documento inválido é rejeitado', () => {
    const result = prepareCaeAvailabilityImport({
      source_file_name: 'availability.pdf',
      source_kind: 'PDF',
      raw_candidate: { provider: 'CAE' },
    });
    expect(result.status).toBe('REJEITADO');
    expect(result.document).toBeNull();
  });
});
