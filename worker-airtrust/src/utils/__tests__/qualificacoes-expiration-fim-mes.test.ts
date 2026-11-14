/**
 * Decisao do proprietario (#2158 follow-up): TODOS os vencimentos vencem NO DIA.
 * O antigo modo "fim do mes" (qualificacoes_tipos.vencimento_fim_mes = 1) foi removido do
 * calculo; a coluna e legada e IGNORADA. Antes, 2025-01-15 + 12m com flag=1 dava 2026-01-31.
 */
import { describe, expect, it } from 'vitest';
import { calcularDataVencimento } from '../qualificacoes-expiration';
import { buildHistoricoTipoSnapshot } from '../../services/qualificacoes-tipos-sync';

const cases: Array<[string, number, string]> = [
  ['2025-01-15', 12, '2026-01-15'],
  ['2025-01-31', 1, '2025-02-28'],
  ['2025-01-30', 1, '2025-02-28'],
  ['2024-01-31', 1, '2024-02-29'], // bissexto
  ['2025-01-31', 12, '2026-01-31'],
  ['2025-01-31', 24, '2027-01-31'],
  ['2023-01-31', 13, '2024-02-29'], // alvo bissexto
  ['2024-02-29', 12, '2025-02-28'],
  ['2024-02-29', 24, '2026-02-28'], // exemplo aprovado pelo dono
  ['2024-02-29', 1, '2024-03-29'],
  ['2025-02-28', 1, '2025-03-28'],
  ['2022-02-28', 24, '2024-02-28'],
  ['2024-04-30', 1, '2024-05-30'],
];

describe('calcularDataVencimento — sempre no dia (sem modo fim do mes)', () => {
  it.each(cases)('%s + %i meses => %s', (data, meses, esperado) => {
    expect(calcularDataVencimento(data, meses)).toBe(esperado);
  });

  it('sincronizacao do tipo ignora vencimento_fim_mes legado (0 e 1 geram a mesma data)', () => {
    for (const [data, meses, esperado] of cases) {
      for (const legado of [0, 1]) {
        const snap = buildHistoricoTipoSnapshot(
          {
            codigo: 'X', nome: 'X', categoria: 'c', validade: meses,
            vencimento_fim_mes: legado,
            cargaHoraria: null, cargaHorariaInicial: null, cargaHorariaRecorrente: null,
          } as never,
          { dataConclusao: data, dataVencimentoAtual: null, tipoTreinamento: null, nascimentoFuncionario: null },
        );
        expect(snap.dataVencimento).toBe(esperado);
      }
    }
  });
});
