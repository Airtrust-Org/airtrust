import { describe, expect, it } from 'vitest';
import { isNaoLiberarHoje, NAO_LIBERAR_LABEL } from '../frmsReleaseGate';

describe('isNaoLiberarHoje', () => {
  it('bloqueia tripulante escalado hoje sem fadiga diária', () => {
    expect(
      isNaoLiberarHoje(
        {
          escalado: true,
          data_operacional: '2026-08-25',
          checkin_status: 'PENDENTE',
          alertas: ['CHECKIN_PENDENTE'],
        },
        '2026-08-25',
      ),
    ).toBe(true);
    expect(NAO_LIBERAR_LABEL).toMatch(/Fadiga diária não preenchida/);
  });

  it('não bloqueia planejamento futuro só porque o check-in ainda não existe', () => {
    expect(
      isNaoLiberarHoje(
        {
          escalado: true,
          data_operacional: '2026-08-26',
          checkin_status: 'PENDENTE',
          alertas: ['CHECKIN_PENDENTE'],
        },
        '2026-08-25',
      ),
    ).toBe(false);
  });

  it('libera o bloqueio depois do check-in persistido', () => {
    expect(
      isNaoLiberarHoje(
        {
          escalado: true,
          data_operacional: '2026-08-25',
          checkin_status: 'RECEBIDO',
          alertas: [],
        },
        '2026-08-25',
      ),
    ).toBe(false);
  });
});
