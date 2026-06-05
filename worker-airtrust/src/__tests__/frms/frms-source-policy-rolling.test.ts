import { describe, expect, it } from 'vitest';
import { calcAcumuloRolling } from '../../lib/frms/calculos';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

describe('frms source policy in rolling calculations', () => {
  it('nao deixa FIRA 25h37 contaminar HV diaria do dia seguinte', () => {
    const result = calcAcumuloRolling({
      tripulanteId: 7,
      dataReferencia: '2026-06-02',
      limites: LIMITES_DEFAULT,
      jornadasHistorico: [
        {
          data: '2026-06-01',
          status: 'ES',
          hora_apresentacao: '06:30',
          hora_termino: '17:25',
          duracao_jornada_minutos: 595,
          horas_voo_minutos: 1537,
          origem: 'FIRA',
        },
        {
          data: '2026-06-02',
          status: 'ES',
          hora_apresentacao: '10:55',
          hora_termino: '17:10',
          duracao_jornada_minutos: 315,
          horas_voo_minutos: 189,
          origem: 'FIRA',
        },
      ],
    });

    expect(result.hv_dia_min).toBe(0);
    expect(result.hv_7_dias_min).toBe(0);
    expect(result.hv_mes_calendario_min).toBe(0);
  });

  it('usa SIGVOOS e ignora FIRA quando ambos aparecem no historico', () => {
    const result = calcAcumuloRolling({
      tripulanteId: 7,
      dataReferencia: '2026-06-02',
      limites: LIMITES_DEFAULT,
      jornadasHistorico: [
        {
          data: '2026-06-01',
          status: 'ES',
          hora_apresentacao: '06:30',
          hora_termino: '17:25',
          duracao_jornada_minutos: 595,
          horas_voo_minutos: 1537,
          origem: 'FIRA',
        },
        {
          data: '2026-06-02',
          status: 'ES',
          hora_apresentacao: '10:55',
          hora_termino: '17:10',
          duracao_jornada_minutos: 375,
          horas_voo_minutos: 189,
          origem: 'SIGVOOS',
        },
      ],
    });

    expect(result.hv_dia_min).toBe(0);
    expect(result.hv_7_dias_min).toBe(189);
    expect(result.hv_mes_calendario_min).toBe(189);
  });
});
