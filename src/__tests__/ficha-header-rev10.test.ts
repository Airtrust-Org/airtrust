import { describe, expect, it } from 'vitest';

import { buildFichaHeaderRows, buildFichaHeaderTitle } from '@/shared/simuladores/ficha-header';

describe('ficha header PTO Rev10 instructor/examiner sessions', () => {
  it('labels a canonical examiner sheet without PF/PM fields', () => {
    expect(
      buildFichaHeaderRows({
        sessaoCodigo: 'EXA-01/04',
        data: '31/07/2026',
        horarioInicio: '08:00',
        horarioFim: '09:00',
        cargaHorariaTotal: '01:00',
        tripulanteNome: 'Examinador-aluno Teste',
        tripulanteCodigoAnac: '111111',
        instrutorNome: 'Examinador supervisor Teste',
        instrutorCodigoAnac: '222222',
        simuladorDisplayName: 'SIM-AW139-01 — FFS AW139',
        equipamentoUtilizado: 'AW139',
        dispositivoIdentificacao: 'SIM-AW139-01',
      }),
    ).toEqual([
      [
        { label: 'Data', value: '31/07/2026' },
        { label: 'Horário', value: '08:00 – 09:00' },
        { label: 'Carga Horária', value: '01:00' },
        { label: 'Modelo', value: 'AW139' },
      ],
      [
        { label: 'Examinador-aluno', value: 'Examinador-aluno Teste' },
        { label: 'ANAC', value: '111111' },
        { label: 'Examinador supervisor', value: 'Examinador supervisor Teste' },
        { label: 'ANAC', value: '222222' },
      ],
      [
        { label: 'Simulador', value: 'SIM-AW139-01 — FFS AW139' },
        { label: 'Dispositivo/Matrícula', value: 'SIM-AW139-01' },
      ],
    ]);
  });

  it('uses the four-part examiner identity in the fixed ficha title', () => {
    expect(buildFichaHeaderTitle({ sessaoCodigo: 'EXA-04/04' })).toEqual({
      title1: 'FICHA DE TREINAMENTO DE VOO',
      title2: 'EXA-04/04 — Treinamento Prático de Examinador 4/4',
    });
  });
});
