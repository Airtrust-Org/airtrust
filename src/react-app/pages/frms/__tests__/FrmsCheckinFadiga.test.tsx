import { describe, expect, it } from 'vitest';
import {
  isFadigaCheckinSubmitReady,
  optionalBinaryResponseToPayload,
} from '../FrmsCheckinFadiga';

describe('FrmsCheckinFadiga helpers', () => {
  it('permite submissão quando medicação e álcool não foram informados', () => {
    expect(
      isFadigaCheckinSubmitReady({
        sonoOpcao: 'ate8',
        wakeTime: '05:30',
        qualidadeSono: 4,
        kssScore: 3,
        fadigaNivel: 2,
        fitForDuty: true,
        aceiteTermos: true,
        aceitePrivacidade: true,
        observacao: '',
      }),
    ).toBe(true);
  });

  it('preserva null no payload opcional, sem converter para false', () => {
    expect(optionalBinaryResponseToPayload(null)).toBeNull();
    expect(optionalBinaryResponseToPayload(true)).toBe(true);
    expect(optionalBinaryResponseToPayload(false)).toBe(false);
  });
});
