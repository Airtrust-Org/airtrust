/**
 * #1492 (Codex P1): modo fim do mês estourava no mês intermediário
 * (2025-01-31 + 1 mês => 31/fev => 03/mar => ... => 31/mar em vez de 28/fev).
 * Modo dia exato permanece inalterado (roll-forward é decisão separada do dono).
 */
import { describe, expect, it } from 'vitest';
import { calcularDataVencimento } from '../qualificacoes-expiration';
import { buildHistoricoTipoSnapshot } from '../../services/qualificacoes-tipos-sync';

const lastDay = (iso: string, months: number) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months + 1, 0)).toISOString().slice(0, 10);
};

describe('calcularDataVencimento — fim do mês sem overflow', () => {
  const cases: Array<[string, number, string]> = [
    ['2025-01-31', 1, '2025-02-28'],
    ['2025-01-30', 1, '2025-02-28'],
    ['2025-01-29', 1, '2025-02-28'],
    ['2024-01-31', 1, '2024-02-29'], // bissexto
    ['2024-01-29', 1, '2024-02-29'],
    ['2025-01-31', 12, '2026-01-31'],
    ['2025-01-30', 12, '2026-01-31'],
    ['2025-01-29', 12, '2026-01-31'],
    ['2024-01-31', 12, '2025-01-31'],
    ['2025-01-31', 24, '2027-01-31'],
    ['2023-01-31', 13, '2024-02-29'], // alvo bissexto
    ['2024-02-29', 12, '2025-02-28'],
    ['2024-02-29', 24, '2026-02-28'],
    ['2024-02-29', 1, '2024-03-31'],
    ['2025-02-28', 1, '2025-03-31'],
    ['2025-02-28', 12, '2026-02-28'],
    ['2025-02-28', 24, '2027-02-28'],
    ['2023-02-28', 24, '2025-02-28'],
    ['2022-02-28', 24, '2024-02-29'], // alvo bissexto
  ];
  it.each(cases)('%s + %i meses => %s', (data, meses, esperado) => {
    expect(calcularDataVencimento(data, meses, 1)).toBe(esperado);
    expect(esperado).toBe(lastDay(data, meses));
  });

  it('concorda com o snapshot de sincronizacao do tipo (mesma data)', () => {
    for (const [data, meses] of cases) {
      const snap = buildHistoricoTipoSnapshot(
        {
          codigo: 'X', nome: 'X', categoria: 'c', validade: meses, vencimentoFimMes: 1,
          cargaHoraria: null, cargaHorariaInicial: null, cargaHorariaRecorrente: null,
        },
        { dataConclusao: data, dataVencimentoAtual: null, tipoTreinamento: null, nascimentoFuncionario: null },
      );
      expect(snap.dataVencimento).toBe(calcularDataVencimento(data, meses, 1));
    }
  });
});

describe('calcularDataVencimento — dia exato inalterado', () => {
  it.each([
    ['2025-01-15', 12, '2026-01-15'],
    ['2024-01-15', 1, '2024-02-15'],
    ['2025-01-31', 1, '2025-03-03'], // roll-forward preservado
    ['2024-01-31', 1, '2024-03-02'],
    ['2024-02-29', 12, '2025-03-01'],
  ])('%s + %i meses => %s', (data, meses, esperado) => {
    expect(calcularDataVencimento(data, meses, 0)).toBe(esperado);
  });
});
