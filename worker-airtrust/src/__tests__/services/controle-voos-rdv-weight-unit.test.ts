import { describe, expect, it } from 'vitest';
import { computeEtapaPesoTotal } from '../../services/controle-voos/rdv-etapas';

describe('RDV: peso total somente com origem de unidade demonstrável', () => {
  const valid = {
    unidade_peso: 'LB',
    peso_vazio: 9000,
    peso_tripulacao: 400,
    peso_passageiros: 1000,
    peso_bagagem: 200,
  };

  it('inclui carga KG e combustível LB sem omissões', () => {
    expect(computeEtapaPesoTotal({
      ...valid, payload: 100, combustivel_inicio: 1500, unidade_combustivel: 'LB',
    })).toBeCloseTo(12320.462, 3);
    expect(computeEtapaPesoTotal({ ...valid, combustivel_inicio: null }))
      .toBe(10600);
    expect(computeEtapaPesoTotal({ ...valid, combustivel_inicio: 0, unidade_combustivel: 'LB' }))
      .toBe(10600);
  });

  it('não omite combustível informado sem unidade ou com unidade inválida/volumétrica', () => {
    for (const unit of [null, '', 'L', 'STONE', 'KGS']) {
      expect(computeEtapaPesoTotal({
        ...valid, combustivel_inicio: 500, unidade_combustivel: unit,
      })).toBeNull();
    }
    expect(computeEtapaPesoTotal({
      ...valid, combustivel_inicio: 250, unidade_combustivel: 'KG',
    })).toBeCloseTo(11151.156, 3);
  });

  it('não interpreta pesos de unidade desconhecida como massas certificadas', () => {
    for (const unit of ['', 'L', 'STONE', 'KGS']) {
      expect(computeEtapaPesoTotal({ ...valid, unidade_peso: unit })).toBeNull();
    }
    expect(computeEtapaPesoTotal({ ...valid, payload: -1 })).toBeNull();
    expect(computeEtapaPesoTotal({ ...valid, peso_tripulacao: -1 })).toBeNull();
    expect(computeEtapaPesoTotal({ ...valid, payload: Number.NaN })).toBeNull();
  });
});
