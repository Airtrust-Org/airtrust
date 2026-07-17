import { describe, expect, it, vi } from 'vitest';

import { upsertQualificacaoHistoricoDaFicha } from '../../services/qualificacoes-historico-ficha';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const [, handler] = entry;
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler.run ? handler.run(args) : { meta: { last_row_id: 0 } };
      };

      return {
        all: async () => executeAll([]),
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          all: async () => executeAll(args),
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

describe('upsertQualificacaoHistoricoDaFicha', () => {
  it('reutiliza a mesma linha na mesma data sem inserir duplicado', async () => {
    const { db, calls } = createMockDb([
      ["PRAGMA table_info('qualificacoes_historico')", { all: () => ({ results: [] }) }],
      [
        'AND data_conclusao = ?',
        {
          first: () => ({
            id: 4092,
            qualificacao_id: 78,
            qualificacao_codigo: 'FAP06-76',
            data_conclusao: '2026-03-30',
            data_vencimento: '2026-09-30',
            observacoes:
              'FAP gerada da ficha #100 (check aprovado) | Renovada via ficha #100 em 2026-03-31',
            empresa_id: 1,
            renovada: 1,
            status: 'RENOVADA',
          }),
        },
      ],
      [
        'AND id <> ?',
        {
          first: () => null,
        },
      ],
      [
        'SET qualificacao_id=?,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SELECT * FROM qualificacoes_historico WHERE id=? AND deleted_at IS NULL',
        {
          first: () => ({
            id: 4092,
            qualificacao_codigo: 'FAP06-76',
            data_conclusao: '2026-03-30',
            renovada: 0,
            status: null,
            observacoes: 'FAP gerada da ficha #100 (check aprovado)',
          }),
        },
      ],
    ]);

    const result = await upsertQualificacaoHistoricoDaFicha(db, {
      fichaId: 100,
      funcionarioId: 41,
      qualificacaoId: 78,
      qualificacaoCodigo: 'FAP06-76',
      dataConclusao: '2026-03-30',
      dataVencimento: '2026-09-30',
      observacoes: 'FAP gerada da ficha #100 (check aprovado)',
      empresaId: 1,
    });

    expect(result.action).toBe('update');
    expect(result.id).toBe(4092);
    expect(
      calls.some((call) => call.method === 'run' && call.query.includes('SET qualificacao_id=?,')),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_historico'),
      ),
    ).toBe(false);
    const sameDateLookup = calls.find(
      (call) => call.method === 'first' && call.query.includes('AND data_conclusao = ?'),
    );
    expect(sameDateLookup?.args).toContain(1);
    const reconcileUpdate = calls.find(
      (call) => call.method === 'run' && call.query.includes('SET qualificacao_id=?,'),
    );
    expect(reconcileUpdate?.query).toContain('AND empresa_id=?');
    expect(reconcileUpdate?.args.at(-1)).toBe(1);
  });

  it('realiza o G1-SEM pendente recalculando o vencimento em 6 meses', async () => {
    const { db, calls } = createMockDb([
      ["PRAGMA table_info('qualificacoes_historico')", { all: () => ({ results: [] }) }],
      [
        'PRAGMA table_info(qualificacoes_tipos)',
        { all: () => ({ results: [{ name: 'empresa_id' }] }) },
      ],
      [
        'FROM funcionarios',
        {
          first: () => ({ empresa_id: 1 }),
        },
      ],
      [
        'FROM qualificacoes_tipos',
        {
          first: () => ({ id: 89, categoria: 'QUALIFICACAO' }),
        },
      ],
      [
        'COALESCE(renovada,0)=0',
        {
          first: () => null,
        },
      ],
      ['AND data_conclusao = ?', { first: () => null }],
      [
        "COALESCE(status, 'PLANEJADA') = 'PLANEJADA'",
        {
          first: () => ({
            id: 7101,
            data_conclusao: '2026-03-30',
            data_vencimento: '2026-09-30',
            observacoes: 'Gerada automaticamente a partir do G1 #7001',
            status: 'PLANEJADA',
          }),
        },
      ],
      [
        'OR (? IS NOT NULL AND observacoes LIKE ?)',
        {
          first: () => null,
        },
      ],
      [
        'WHERE id = ?',
        {
          first: () => ({ id: 7101 }),
        },
      ],
      [
        'data_vencimento = ?,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SET renovada = 1,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SELECT * FROM qualificacoes_historico WHERE id=? AND deleted_at IS NULL',
        {
          first: () => ({
            id: 7101,
            qualificacao_codigo: 'G1-SEM',
            data_conclusao: '2026-04-01',
            data_vencimento: '2026-10-01',
            observacoes: 'Gerada automaticamente a partir do G1 #7001 | Gerado da ficha #120',
            renovada: 0,
            status: 'CONCLUIDA',
          }),
        },
      ],
    ]);

    const result = await upsertQualificacaoHistoricoDaFicha(db, {
      fichaId: 120,
      funcionarioId: 41,
      qualificacaoId: 88,
      qualificacaoCodigo: 'G1-SEM',
      dataConclusao: '2026-04-01',
      dataVencimento: '2030-01-01',
      observacoes: 'Gerado da ficha #120',
      empresaId: 1,
    });

    expect(result.action).toBe('update');
    expect(result.id).toBe(7101);
    expect(
      calls.some((call) => call.method === 'run' && call.query.includes('data_vencimento = ?,')),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_historico'),
      ),
    ).toBe(false);
  });

  it('reconcilia legado da mesma data por qualificacao_id quando o codigo ainda esta nulo', async () => {
    const { db, calls } = createMockDb([
      ["PRAGMA table_info('qualificacoes_historico')", { all: () => ({ results: [] }) }],
      [
        'AND id <> ?',
        {
          first: () => null,
        },
      ],
      [
        'ORDER BY CASE WHEN qualificacao_codigo IS NULL',
        {
          first: () => ({
            id: 4062,
            qualificacao_id: 79,
            qualificacao_codigo: null,
            data_conclusao: '2026-03-29',
            data_vencimento: '2026-09-30',
            observacoes: ' | Renovada via ficha #95 em 2026-03-31',
            empresa_id: 6,
            renovada: 1,
            status: 'RENOVADA',
          }),
        },
      ],
      ['AND data_conclusao = ?', { first: () => null }],
      [
        'SET qualificacao_id=?,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SELECT * FROM qualificacoes_historico WHERE id=? AND deleted_at IS NULL',
        {
          first: () => ({
            id: 4062,
            qualificacao_id: 79,
            qualificacao_codigo: 'FAP06-139',
            data_conclusao: '2026-03-29',
            data_vencimento: '2026-09-29',
            renovada: 0,
            status: null,
            observacoes: 'FAP gerada da ficha #95 (check aprovado)',
          }),
        },
      ],
    ]);

    const result = await upsertQualificacaoHistoricoDaFicha(db, {
      fichaId: 95,
      funcionarioId: 6,
      qualificacaoId: 79,
      qualificacaoCodigo: 'FAP06-139',
      dataConclusao: '2026-03-29',
      dataVencimento: '2026-09-29',
      observacoes: 'FAP gerada da ficha #95 (check aprovado)',
      empresaId: 6,
    });

    expect(result.action).toBe('update');
    expect(result.id).toBe(4062);
    expect(
      calls.some((call) => call.method === 'run' && call.query.includes('SET qualificacao_id=?,')),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_historico'),
      ),
    ).toBe(false);
  });

  it('renova a anterior e insere uma nova quando a data mudou', async () => {
    const { db, calls } = createMockDb([
      ["PRAGMA table_info('qualificacoes_historico')", { all: () => ({ results: [] }) }],
      ['AND data_conclusao = ?', { first: () => null }],
      [
        'COALESCE(renovada,0)=0',
        {
          first: () => ({
            id: 3001,
            observacoes: 'Qualificação anterior',
          }),
        },
      ],
      [
        'SET renovada=1,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'INSERT INTO qualificacoes_historico(',
        {
          run: () => ({ meta: { last_row_id: 5001 } }),
        },
      ],
      [
        'SELECT * FROM qualificacoes_historico WHERE id=? AND deleted_at IS NULL',
        {
          first: () => ({
            id: 5001,
            qualificacao_codigo: 'D3',
            data_conclusao: '2026-03-30',
          }),
        },
      ],
    ]);

    const result = await upsertQualificacaoHistoricoDaFicha(db, {
      fichaId: 100,
      funcionarioId: 41,
      qualificacaoId: 24,
      qualificacaoCodigo: 'D3',
      dataConclusao: '2026-03-30',
      dataVencimento: '2027-03-30',
      observacoes: 'Gerado da ficha #100',
      empresaId: 1,
    });

    expect(result.action).toBe('insert');
    expect(result.id).toBe(5001);
    expect(
      calls.some((call) => call.method === 'run' && call.query.includes('SET renovada=1,')),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_historico'),
      ),
    ).toBe(true);
  });

  it('gera um G1-SEM concluído automaticamente quando a ficha cria um novo G1', async () => {
    const { db, calls } = createMockDb([
      ["PRAGMA table_info('qualificacoes_historico')", { all: () => ({ results: [] }) }],
      [
        'PRAGMA table_info(qualificacoes_tipos)',
        { all: () => ({ results: [{ name: 'empresa_id' }] }) },
      ],
      [
        'FROM funcionarios',
        {
          first: () => ({ empresa_id: 1 }),
        },
      ],
      [
        'FROM qualificacoes_tipos',
        {
          first: () => ({ id: 89, categoria: 'QUALIFICACAO' }),
        },
      ],
      ['AND data_conclusao = ?', { first: () => null }],
      ['COALESCE(renovada,0)=0', { first: () => null }],
      [
        'INSERT INTO qualificacoes_historico',
        {
          run: (() => {
            let insertCount = 0;
            return () => {
              insertCount += 1;
              return { meta: { last_row_id: insertCount === 1 ? 8001 : 8002 } };
            };
          })(),
        },
      ],
      [
        'OR (? IS NOT NULL AND observacoes LIKE ?)',
        {
          first: () => null,
        },
      ],
      [
        'SET renovada = 1,',
        {
          run: () => ({ meta: { changes: 0 } }),
        },
      ],
      [
        'SELECT * FROM qualificacoes_historico WHERE id=? AND deleted_at IS NULL',
        {
          first: () => ({
            id: 8001,
            qualificacao_codigo: 'G1',
            data_conclusao: '2026-03-30',
            data_vencimento: '2027-03-30',
          }),
        },
      ],
    ]);

    const result = await upsertQualificacaoHistoricoDaFicha(db, {
      fichaId: 130,
      funcionarioId: 41,
      qualificacaoId: 77,
      qualificacaoCodigo: 'G1',
      dataConclusao: '2026-03-30',
      dataVencimento: '2027-03-30',
      observacoes: 'Gerado da ficha #130',
      empresaId: 1,
    });

    expect(result.action).toBe('insert');
    expect(result.id).toBe(8001);
    expect(
      calls.some(
        (call) =>
          call.method === 'run' &&
          call.query.includes('INSERT INTO qualificacoes_historico') &&
          call.args.includes(89) &&
          call.args.includes('2026-03-30') &&
          call.args.includes('2026-09-30'),
      ),
    ).toBe(true);
  });

  it('reconcilia a linha quando o insert perde corrida para a constraint unique', async () => {
    let consultasMesmaData = 0;
    const { db, calls } = createMockDb([
      ["PRAGMA table_info('qualificacoes_historico')", { all: () => ({ results: [] }) }],
      [
        'AND data_conclusao = ?',
        {
          first: () => {
            consultasMesmaData += 1;
            if (consultasMesmaData === 1) return null;
            return {
              id: 6001,
              qualificacao_id: 78,
              qualificacao_codigo: 'FAP06-76',
              data_conclusao: '2026-03-30',
              data_vencimento: '2026-09-30',
              observacoes: 'FAP gerada da ficha #100 (check aprovado)',
              empresa_id: 1,
              renovada: 0,
              status: null,
            };
          },
        },
      ],
      [
        'AND id <> ?',
        {
          first: () => null,
        },
      ],
      ['COALESCE(renovada,0)=0', { first: () => null }],
      [
        'INSERT INTO qualificacoes_historico(',
        {
          run: () => {
            throw new Error(
              'D1_ERROR: UNIQUE constraint failed: qualificacoes_historico.funcionario_id, qualificacoes_historico.qualificacao_codigo, qualificacoes_historico.data_conclusao',
            );
          },
        },
      ],
      [
        'SELECT * FROM qualificacoes_historico WHERE id=? AND deleted_at IS NULL',
        {
          first: () => ({
            id: 6001,
            qualificacao_codigo: 'FAP06-76',
            data_conclusao: '2026-03-30',
            data_vencimento: '2026-09-30',
            observacoes: 'FAP gerada da ficha #100 (check aprovado)',
            renovada: 0,
            status: null,
          }),
        },
      ],
      [
        'SET qualificacao_id=?,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const result = await upsertQualificacaoHistoricoDaFicha(db, {
      fichaId: 100,
      funcionarioId: 41,
      qualificacaoId: 78,
      qualificacaoCodigo: 'FAP06-76',
      dataConclusao: '2026-03-30',
      dataVencimento: '2026-09-30',
      observacoes: 'FAP gerada da ficha #100 (check aprovado)',
      empresaId: 1,
    });

    expect(result.action).toBe('update');
    expect(result.id).toBe(6001);
    expect(
      calls.filter(
        (call) => call.method === 'first' && call.query.includes('AND data_conclusao = ?'),
      ).length,
    ).toBe(2);
    expect(
      calls.some((call) => call.method === 'run' && call.query.includes('SET qualificacao_id=?,')),
    ).toBe(true);
  });

  it('reutiliza sem regravar status quando o registro concorrente da corrida ja esta correto', async () => {
    // DT-0002: o branch de corrida (UNIQUE constraint, dentro do catch) chama
    // reconcileQualificacaoHistoricoExistente com 5 argumentos, omitindo o
    // parametro `statusFinal`. Como esse parametro e opcional no TypeScript,
    // o compilador nao acusa o erro, mas em runtime o `status` do registro
    // concorrente e comparado contra `undefined` em vez do status realmente
    // calculado, forcando um UPDATE desnecessario que grava `status=undefined`.
    //
    // A busca "front-door" (antes do INSERT) consome 2 chamadas de
    // 'AND data_conclusao = ?' (modo 'strict' + fallback 'by-qualificacao-id').
    // Para exercitar de fato o branch de corrida dentro do catch, as duas
    // primeiras chamadas devem retornar null (registro ainda nao existe do
    // ponto de vista do request atual) e o INSERT deve falhar por
    // UNIQUE constraint; so entao, na nova consulta feita dentro do catch,
    // o registro concorrente (inserido por outra requisicao) deve aparecer.
    let consultasMesmaData = 0;
    const { db, calls } = createMockDb([
      ["PRAGMA table_info('qualificacoes_historico')", { all: () => ({ results: [] }) }],
      [
        'AND data_conclusao = ?',
        {
          first: () => {
            consultasMesmaData += 1;
            if (consultasMesmaData <= 3) return null;
            return {
              id: 6001,
              qualificacao_id: 78,
              qualificacao_codigo: 'FAP06-76',
              data_conclusao: '2026-03-30',
              data_vencimento: '2026-09-30',
              observacoes: 'FAP gerada da ficha #100 (check aprovado)',
              empresa_id: 1,
              renovada: 0,
              // Ja concluida com o mesmo status que upsert calcularia por
              // padrao (QUALIFICACAO_STATUS.CONCLUIDA), ou seja, nada deveria
              // mudar quando a corrida for reconciliada.
              status: 'CONCLUIDA',
            };
          },
        },
      ],
      ['AND id <> ?', { first: () => null }],
      ['COALESCE(renovada,0)=0', { first: () => null }],
      [
        'INSERT INTO qualificacoes_historico(',
        {
          run: () => {
            throw new Error(
              'D1_ERROR: UNIQUE constraint failed: qualificacoes_historico.funcionario_id, qualificacoes_historico.qualificacao_codigo, qualificacoes_historico.data_conclusao',
            );
          },
        },
      ],
      [
        'SELECT * FROM qualificacoes_historico WHERE id=? AND deleted_at IS NULL',
        {
          first: () => ({
            id: 6001,
            qualificacao_codigo: 'FAP06-76',
            data_conclusao: '2026-03-30',
            data_vencimento: '2026-09-30',
            observacoes: 'FAP gerada da ficha #100 (check aprovado)',
            renovada: 0,
            status: 'CONCLUIDA',
          }),
        },
      ],
      [
        'SET qualificacao_id=?,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const result = await upsertQualificacaoHistoricoDaFicha(db, {
      fichaId: 100,
      funcionarioId: 41,
      qualificacaoId: 78,
      qualificacaoCodigo: 'FAP06-76',
      dataConclusao: '2026-03-30',
      dataVencimento: '2026-09-30',
      observacoes: 'FAP gerada da ficha #100 (check aprovado)',
      empresaId: 1,
      // status omitido de proposito: upsert calcula o default CONCLUIDA,
      // que ja bate com o registro concorrente encontrado na corrida.
    });

    expect(result.action).toBe('reuse');
    expect(result.id).toBe(6001);
    expect(
      calls.some((call) => call.method === 'run' && call.query.includes('SET qualificacao_id=?,')),
    ).toBe(false);
    expect(
      calls.some(
        (call) =>
          call.method === 'run' &&
          call.query.includes('SET qualificacao_id=?,') &&
          call.args.includes(undefined),
      ),
    ).toBe(false);
  });

  it('preenche renovacao_de quando a coluna existe e ha qualificacao anterior', async () => {
    const { db, calls } = createMockDb([
      [
        "PRAGMA table_info('qualificacoes_historico')",
        {
          all: () => ({ results: [{ name: 'id' }, { name: 'renovacao_de' }] }),
        },
      ],
      ['AND data_conclusao = ?', { first: () => null }],
      [
        'COALESCE(renovada,0)=0',
        {
          first: () => ({
            id: 3001,
            observacoes: 'Qualificação anterior',
          }),
        },
      ],
      [
        'SET renovada=1,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'renovacao_de',
        {
          run: () => ({ meta: { last_row_id: 7001 } }),
        },
      ],
      [
        'SELECT * FROM qualificacoes_historico WHERE id=? AND deleted_at IS NULL',
        {
          first: () => ({
            id: 7001,
            qualificacao_codigo: 'D4',
            data_conclusao: '2026-04-01',
            renovacao_de: 3001,
          }),
        },
      ],
    ]);

    const result = await upsertQualificacaoHistoricoDaFicha(db, {
      fichaId: 101,
      funcionarioId: 41,
      qualificacaoId: 25,
      qualificacaoCodigo: 'D4',
      dataConclusao: '2026-04-01',
      dataVencimento: '2027-04-01',
      observacoes: 'Gerado da ficha #101',
      empresaId: 1,
    });

    expect(result.action).toBe('insert');
    expect(result.id).toBe(7001);
    expect(calls.some((call) => call.method === 'run' && call.query.includes('renovacao_de'))).toBe(
      true,
    );
    expect(
      calls.some((call) => call.method === 'run' && call.args[call.args.length - 1] === 3001),
    ).toBe(true);
  });

  it('converte a planejada existente em concluida e renova a anterior ao finalizar a ficha', async () => {
    const { db, calls } = createMockDb([
      ["PRAGMA table_info('qualificacoes_historico')", { all: () => ({ results: [] }) }],
      [
        'AND data_conclusao = ?',
        {
          first: () => ({
            id: 9001,
            qualificacao_id: 25,
            qualificacao_codigo: 'D4',
            data_conclusao: '2026-05-10',
            data_vencimento: '2027-05-10',
            observacoes: 'Gerado da ficha #201',
            empresa_id: 1,
            renovada: 0,
            status: 'PLANEJADA',
          }),
        },
      ],
      [
        'AND id <> ?',
        {
          first: () => ({
            id: 8001,
            observacoes: 'Qualificacao anterior concluida',
          }),
        },
      ],
      [
        'SET renovada=1,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SET qualificacao_id=?,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SELECT * FROM qualificacoes_historico WHERE id=? AND deleted_at IS NULL',
        {
          first: () => ({
            id: 9001,
            qualificacao_codigo: 'D4',
            data_conclusao: '2026-05-10',
            data_vencimento: '2027-05-10',
            renovada: 0,
            status: 'CONCLUIDA',
            observacoes: 'Gerado da ficha #201',
          }),
        },
      ],
    ]);

    const result = await upsertQualificacaoHistoricoDaFicha(db, {
      fichaId: 201,
      funcionarioId: 41,
      qualificacaoId: 25,
      qualificacaoCodigo: 'D4',
      dataConclusao: '2026-05-10',
      dataVencimento: '2027-05-10',
      observacoes: 'Gerado da ficha #201',
      empresaId: 1,
      status: 'CONCLUIDA',
    });

    expect(result.action).toBe('update');
    expect(result.id).toBe(9001);
    expect(
      calls.some((call) => call.method === 'run' && call.query.includes('SET renovada=1,')),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.method === 'run' &&
          call.query.includes('SET qualificacao_id=?,') &&
          call.args.includes('CONCLUIDA'),
      ),
    ).toBe(true);
  });
});
