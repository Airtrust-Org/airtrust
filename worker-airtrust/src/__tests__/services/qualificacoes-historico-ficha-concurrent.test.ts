import { describe, it, expect } from 'vitest';
import { upsertQualificacaoHistoricoDaFicha } from '../../services/qualificacoes-historico-ficha';
import { D1Database } from '@cloudflare/workers-types';

describe('Upsert Concorrente de Qualificação da Ficha', () => {
  it('gerencia requisições simultâneas adequadamente usando a chave de integridade', async () => {
    let selectCounter = 0;
    let insertCounter = 0;

    const mockDb = {
      prepare: (sql: string) => {
        return {
          bind: (...args: any[]) => ({
            first: async () => {
              if (sql.includes('SELECT') && sql.includes('qualificacoes_historico')) {
                selectCounter++;
                // 1. primeira busca por registro existente retorna null
                if (selectCounter === 1 || selectCounter === 2) {
                  return null;
                }
                // 3. segunda busca, feita após o conflito, retorna o registro concorrente
                return {
                  id: 1234,
                  qualificacao_id: 10,
                  qualificacao_codigo: 'TEST',
                  data_conclusao: '2023-01-01',
                  data_vencimento: '2024-01-01',
                  observacoes: 'Test',
                  empresa_id: 2,
                  renovada: 0,
                  status: 'CONCLUIDA',
                };
              }
              return null;
            },
            all: async () => {
              return { results: [] };
            },
            run: async () => {
              if (sql.includes('INSERT INTO qualificacoes_historico')) {
                insertCounter++;
                // 2. INSERT lança a mensagem UNIQUE esperada
                throw new Error('UNIQUE constraint failed: qualificacoes_historico.funcionario_id, qualificacoes_historico.data_conclusao');
              }
              return { success: true };
            }
          })
        }
      }
    } as unknown as D1Database;

    const result = await upsertQualificacaoHistoricoDaFicha(mockDb, {
      fichaId: 99,
      funcionarioId: 1,
      qualificacaoId: 10,
      qualificacaoCodigo: 'TEST',
      dataConclusao: '2023-01-01',
      dataVencimento: '2024-01-01',
      observacoes: 'Test',
      empresaId: 2,
      status: 'CONCLUIDA'
    });

    // 4. o serviço deve retornar o ID desse registro
    expect(result.id).toBe(1234);
    // 5. action deve ser reuse ou update conforme os dados
    expect(result.action).toBe('reuse');
    // 6. confirmar que houve exatamente uma tentativa de INSERT
    expect(insertCounter).toBe(1);
    
    // 7. confirmar empresa, funcionário, qualificação e data
    expect(result.row?.id).toBe(1234);
    expect(result.row?.empresa_id).toBe(2);
    expect(result.row?.qualificacao_codigo).toBe('TEST');
    expect(result.row?.data_conclusao).toBe('2023-01-01');
  });
});
