import { describe, expect, it } from 'vitest';
import { shouldExposeEffectivenessForRequestedMonth } from '../../lib/frms/db-service-acumulo-period-guard';

describe('db-service-acumulo-period-guard', () => {
  it('mantém efetividade quando não há mês explícito', () => {
    expect(shouldExposeEffectivenessForRequestedMonth(undefined, false)).toBe(true);
  });

  it('mantém efetividade quando existe jornada canônica no mês solicitado', () => {
    expect(shouldExposeEffectivenessForRequestedMonth('2026-08', true)).toBe(true);
  });

  it('suprime efetividade histórica quando o mês solicitado não tem jornada canônica', () => {
    expect(shouldExposeEffectivenessForRequestedMonth('2026-08', false)).toBe(false);
  });
});
