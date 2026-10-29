import { describe, it, expect } from 'vitest';
import { validateCvFrmsOperacionalPainel } from '@/react-app/hooks/useControleVoos';

const date = '2026-10-29';
const valid = {
  data: date,
  resumo: {
    voos_nao_liberados: 1,
    voos_requerem_revisao: 0,
    voos_liberaveis: 0,
    tripulantes_checkin_pendente: 1,
  },
  voos: [{
    voo_id: 9,
    prefixo: 'QA-FR',
    frms_status: 'NAO_LIBERADO',
    tripulacao: [{
      funcionario_id: 31,
      frms_status: 'NAO_LIBERADO',
      fadiga_diaria: 'INDISPONIVEL',
      fadiga_acumulada: 'INDISPONIVEL',
    }],
  }],
};

describe('Coordenação: operational daily-fatigue response is fail-closed', () => {
  it('preserves real pending status rather than displaying a green/empty panel', () => {
    const data = validateCvFrmsOperacionalPainel(valid, date);
    expect(data.resumo.tripulantes_checkin_pendente).toBe(1);
    expect(data.voos[0].tripulacao[0].fadiga_diaria).toBe('INDISPONIVEL');
  });
  it('distinguishes a legitimate zero-flight response from a missing payload', () => {
    const empty = {
      data: date,
      resumo: { voos_nao_liberados: 0, voos_requerem_revisao: 0, voos_liberaveis: 0, tripulantes_checkin_pendente: 0 },
      voos: [],
    };
    expect(validateCvFrmsOperacionalPainel(empty, date).voos).toHaveLength(0);
    for (const bad of [null, undefined, {}, { data: date, voos: [] }, { data: '', resumo: empty.resumo, voos: [] }]) {
      expect(() => validateCvFrmsOperacionalPainel(bad, date)).toThrow('CV_FRMS_OPERACIONAL_RESPONSE_INCOMPLETE');
    }
  });
  it('rejects unknown risk, missing crew or mismatched summary counts', () => {
    const flight = valid.voos[0];
    for (const bad of [
      { ...valid, voos: [{ ...flight, tripulacao: undefined }] },
      { ...valid, voos: [{ ...flight, frms_status: 'LIBERAVEL' }] },
      { ...valid, voos: [{ ...flight, tripulacao: [{ ...flight.tripulacao[0], fadiga_diaria: undefined }] }] },
      { ...valid, resumo: { ...valid.resumo, voos_nao_liberados: 0 } },
      { ...valid, resumo: { ...valid.resumo, tripulantes_checkin_pendente: -1 } },
    ]) {
      expect(() => validateCvFrmsOperacionalPainel(bad, date)).toThrow('CV_FRMS_OPERACIONAL_RESPONSE_INCOMPLETE');
    }
  });
});
