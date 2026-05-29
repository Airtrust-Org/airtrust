import { describe, expect, it } from 'vitest';
import { resolveContextoPilotoLimites } from '../../routes/frms-fadiga-checkin';

describe('resolveContextoPilotoLimites', () => {
  it('usa limites padrão quando configuração está ausente', () => {
    expect(resolveContextoPilotoLimites(null)).toEqual({
      limite7dHoras: 45,
      limite28dHoras: 90,
    });
  });

  it('reflete alteração de limite de 7d e 28d vindos da configuração', () => {
    const contexto = resolveContextoPilotoLimites({
      HV_7_DIAS_HORAS: 42,
      HV_28_DIAS_HORAS: 93,
    });

    expect(contexto.limite7dHoras).toBe(42);
    expect(contexto.limite28dHoras).toBe(93);
  });

  it('usa limite mensal como fallback somente quando 28d não estiver disponível', () => {
    const contexto = resolveContextoPilotoLimites({
      HV_7_DIAS_HORAS: 44,
      HV_MES_HORAS: 90,
    });

    expect(contexto).toEqual({
      limite7dHoras: 44,
      limite28dHoras: 90,
    });
  });
});
