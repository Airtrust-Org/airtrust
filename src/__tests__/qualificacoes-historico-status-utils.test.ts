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
    expect(getHistoricoDisplayStatus({ status: 'VALIDA', renovada: 1 })).toBe('RENOVADA');
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
