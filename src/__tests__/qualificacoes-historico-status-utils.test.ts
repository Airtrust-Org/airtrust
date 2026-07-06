import { describe, expect, it } from 'vitest';

import {
  buildPlanejadasRelacionadasMap,
  computeHistoricoHeaderStats,
  findPlanejadaRelacionada,
  getHistoricoDisplayStatus,
} from '@/react-app/pages/qualificacoes/historicoStatusUtils';

describe('qualificacoes historico status utils', () => {
  it('normaliza status planejado e vencendo_30 para o header e badges', () => {
    expect(getHistoricoDisplayStatus({ qualificacao_status: 'PLANEJADA', status: 'VALIDA' })).toBe(
      'PLANEJADA',
    );
    expect(getHistoricoDisplayStatus({ status: 'PROXIMA_VENCIMENTO' })).toBe('VENCENDO_30');
    // renovada=1 SEM tem_renovacao_posterior NÃO é RENOVADA — legado informativo apenas
    expect(
      getHistoricoDisplayStatus({ renovada: 1, vigente_operacional: 0, tem_renovacao_posterior: 0 }),
    ).toBe('VALIDA');
  });

  it('prioriza o status derivado do backend para nao marcar a renovacao vigente como renovada', () => {
    expect(
      getHistoricoDisplayStatus({
        status: 'VALIDA',
        renovada: 1,
        renovacao_de: 321,
        tem_renovacao_posterior: 0,
      }),
    ).toBe('VALIDA');
    expect(
      getHistoricoDisplayStatus({
        status: 'RENOVADA',
        renovada: 0,
        tem_renovacao_posterior: 1,
      }),
    ).toBe('RENOVADA');
    expect(
      getHistoricoDisplayStatus({
        status: 'RENOVADA',
        renovada: 1,
        vigente_operacional: 1,
        tem_renovacao_posterior: 0,
        data_vencimento: '2099-12-31',
      }),
    ).toBe('VALIDA');
  });

  // NOVOS TESTES: regra RENOVADA requer sucessora real

  it('NAO marca como RENOVADA quando renovada=1 mas é a vigente operacional (sem sucessora)', () => {
    // Cenário: registro com flag renovada=1 mas é o último registro do tipo
    // (vigente_operacional=1). Deve mostrar status baseado em datas, não RENOVADA.
    expect(
      getHistoricoDisplayStatus({
        renovada: 1,
        status: 'VALIDA',
        vigente_operacional: 1,
        tem_renovacao_posterior: 0,
        qualificacao_status: 'CONCLUIDA',
        data_vencimento: '2099-12-31',
      }),
    ).toBe('VALIDA');
  });

  it('NAO marca como RENOVADA quando status=RENOVADA mas é vigente operacional', () => {
    // Caso clássico: registro marcado como RENOVADA no banco mas sem sucessora real
    expect(
      getHistoricoDisplayStatus({
        renovada: 0,
        status: 'VALIDA',
        vigente_operacional: 1,
        tem_renovacao_posterior: 0,
        qualificacao_status: 'RENOVADA',
        data_vencimento: '2026-08-13',
      }),
    ).toBe('VALIDA');
  });

  it('marca como RENOVADA quando tem link explícito de sucessão (tem_renovacao_posterior=1)', () => {
    // Backend enviaria status='RENOVADA' neste caso; não passa status conflitante
    expect(
      getHistoricoDisplayStatus({
        renovada: 1,
        status: 'RENOVADA',
        vigente_operacional: 0,
        tem_renovacao_posterior: 1,
        qualificacao_status: 'CONCLUIDA',
        data_vencimento: '2024-01-27',
      }),
    ).toBe('RENOVADA');
  });

  // TESTES EXPLÍCITOS: regra final RENOVADA = tem_renovacao_posterior=1

  it('registro vencido com renovada=1 e status=RENOVADA mas sem sucessor real → VENCIDA', () => {
    // Cenário: registro expirado, flags legados de renovação, mas sem sucessora real.
    // Deve ser classificado por data, NUNCA como RENOVADA.
    expect(
      getHistoricoDisplayStatus({
        renovada: 1,
        status: 'RENOVADA',
        vigente_operacional: 1,
        tem_renovacao_posterior: 0,
        qualificacao_status: 'RENOVADA',
        data_vencimento: '2024-01-27',
      }),
    ).toBe('VENCIDA');
  });

  it('registro não vigente com renovada=1 mas sucessor cancelado → NÃO é RENOVADA', () => {
    // Cenário: não é a vigente operacional (existe outro registro posterior),
    // mas o sucessor foi cancelado ou deletado. Sem tem_renovacao_posterior=1,
    // NÃO deve ser RENOVADA.
    expect(
      getHistoricoDisplayStatus({
        renovada: 1,
        status: 'RENOVADA',
        vigente_operacional: 0,
        tem_renovacao_posterior: 0,
        qualificacao_status: 'RENOVADA',
        data_vencimento: '2024-01-27',
      }),
    ).toBe('VENCIDA');
  });

  it('NAO marca como RENOVADA quando renovada=1 sem link explícito de sucessão', () => {
    // Registro não é vigente operacional E tem renovada=1,
    // mas NÃO tem tem_renovacao_posterior=1 → NÃO é RENOVADA.
    // Deve ser classificada por data: 2024-01-27 < hoje → VENCIDA.
    expect(
      getHistoricoDisplayStatus({
        renovada: 1,
        status: 'RENOVADA',
        vigente_operacional: 0,
        tem_renovacao_posterior: 0,
        qualificacao_status: 'CONCLUIDA',
        data_vencimento: '2024-01-27',
      }),
    ).toBe('VENCIDA');
  });

  it('qualificação válida sem sucessora aparece como VALIDA, não RENOVADA', () => {
    expect(
      getHistoricoDisplayStatus({
        renovada: 0,
        status: 'VALIDA',
        vigente_operacional: 1,
        tem_renovacao_posterior: 0,
        qualificacao_status: 'CONCLUIDA',
        data_vencimento: '2099-12-31',
      }),
    ).toBe('VALIDA');
  });

  it('qualificação vencendo sem sucessora aparece como VENCENDO_30', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 15);
    const futureStr = tomorrow.toISOString().split('T')[0];
    // Não passa status derivado — deixa o cálculo por data prevalecer
    expect(
      getHistoricoDisplayStatus({
        renovada: 0,
        vigente_operacional: 1,
        tem_renovacao_posterior: 0,
        qualificacao_status: 'CONCLUIDA',
        data_vencimento: futureStr,
      }),
    ).toBe('VENCENDO_30');
  });

  it('qualificação vencida sem sucessora aparece como VENCIDA', () => {
    expect(
      getHistoricoDisplayStatus({
        renovada: 0,
        vigente_operacional: 1,
        tem_renovacao_posterior: 0,
        qualificacao_status: 'CONCLUIDA',
        data_vencimento: '2020-01-01',
      }),
    ).toBe('VENCIDA');
  });

  it('detecta quando uma qualificação vencida já possui ação planejada relacionada', () => {
    const vencida = {
      id: 10,
      funcionario_id: 7,
      qualificacao_id: 3,
      qualificacao_codigo: 'CRM',
      status: 'VENCIDA',
    };
    const planejada = {
      id: 11,
      funcionario_id: 7,
      qualificacao_id: 3,
      qualificacao_codigo: 'CRM',
      qualificacao_status: 'PLANEJADA',
      status: 'VALIDA',
    };

    const map = buildPlanejadasRelacionadasMap([planejada]);
    expect(findPlanejadaRelacionada(vencida, map)).toEqual(planejada);
  });

  it('usa o total filtrado quando apenas planejadas estão selecionadas', () => {
    const filtered = [
      { id: 1, qualificacao_status: 'PLANEJADA' },
      { id: 2, qualificacao_status: 'PLANEJADA' },
      { id: 3, qualificacao_status: 'PLANEJADA' },
    ];

    expect(computeHistoricoHeaderStats(filtered, new Set(['PLANEJADA']), 3)).toMatchObject({
      total: 3,
      planejadas: 3,
      vencidas: 0,
    });
  });

  it('aceita sobrescrever o total de planejadas fora da pagina atual', () => {
    const filtered = [{ id: 1, status: 'VENCIDA' }];

    expect(
      computeHistoricoHeaderStats(filtered, new Set(['VALIDA', 'VENCIDA', 'PLANEJADA']), 20, 4),
    ).toMatchObject({
      total: 20,
      vencidas: 1,
      planejadas: 4,
    });
  });
});
