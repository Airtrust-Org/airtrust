import { describe, expect, it } from 'vitest';
import {
  CAE_AVAILABILITY_SCHEMA_VERSION,
  normalizeCaeEquipment,
  validateAndNormalizeCaeAvailability,
} from '../../services/cae-availability';

describe('CAE availability contract v1', () => {
  it('normalizes CAE equipment aliases to AirTrust canonical values', () => {
    expect(normalizeCaeEquipment('AW139')).toBe('AW139');
    expect(normalizeCaeEquipment('A139')).toBe('AW139');
    expect(normalizeCaeEquipment('S76')).toBe('SK76');
    expect(normalizeCaeEquipment('SK76 C')).toBe('SK76');
    expect(normalizeCaeEquipment('Sikorsky S76 C')).toBe('SK76');
    expect(normalizeCaeEquipment('AS350')).toBeNull();
  });

  it('accepts an overnight CAE slot and computes the next end_date deterministically', () => {
    const result = validateAndNormalizeCaeAvailability({
      schema_version: CAE_AVAILABILITY_SCHEMA_VERSION,
      provider: 'CAE',
      source: { kind: 'PDF', filename: 'disponibilidade.pdf' },
      slots: [
        {
          equipment: 'S76',
          date: '2026-08-30',
          start_time: '20:40',
          end_time: '00:40',
          duration_minutes: 240,
          state: 'OFFERED',
          confidence: 0.99,
          source_ref: { page: 16 },
        },
      ],
      warnings: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.slots[0]).toMatchObject({
      equipment: 'SK76',
      date: '2026-08-30',
      end_date: '2026-08-31',
      duration_minutes: 240,
    });
  });

  it('rejects hallucination-prone structural errors instead of silently correcting them', () => {
    const result = validateAndNormalizeCaeAvailability({
      schema_version: CAE_AVAILABILITY_SCHEMA_VERSION,
      provider: 'CAE',
      source: { kind: 'PDF' },
      slots: [
        {
          equipment: 'AW139',
          date: '2026-09-01',
          start_time: '06:00',
          end_time: '09:00',
          duration_minutes: 120,
          confidence: 1,
        },
      ],
      warnings: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((issue: any) => issue.code === 'DURATION_MISMATCH')).toBe(true);
  });

  it('flags low confidence for mandatory human review without discarding an otherwise valid slot', () => {
    const result = validateAndNormalizeCaeAvailability({
      schema_version: CAE_AVAILABILITY_SCHEMA_VERSION,
      provider: 'CAE',
      source: { kind: 'EMAIL' },
      slots: [
        {
          equipment: 'AW139',
          date: '2026-09-02',
          start_time: '00:00',
          end_time: '02:00',
          duration_minutes: 120,
          confidence: 0.72,
        },
      ],
      warnings: [],
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.some((issue: any) => issue.code === 'LOW_CONFIDENCE')).toBe(true);
  });

  it('rejects duplicate slots', () => {
    const slot = {
      equipment: 'AW139',
      date: '2026-09-03',
      start_time: '00:00',
      end_time: '02:00',
      duration_minutes: 120,
      confidence: 0.99,
    };
    const result = validateAndNormalizeCaeAvailability({
      schema_version: CAE_AVAILABILITY_SCHEMA_VERSION,
      provider: 'CAE',
      source: { kind: 'PDF' },
      slots: [slot, slot],
      warnings: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((issue: any) => issue.code === 'DUPLICATE_SLOT')).toBe(true);
  });
});
