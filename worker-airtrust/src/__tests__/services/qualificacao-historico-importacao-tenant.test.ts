import { describe, expect, it } from 'vitest';
import { QualificacaoHistoricoImportacaoService } from '../../services/importacao/QualificacaoHistoricoImportacao';

type DbCall = { query: string; bindArgs: unknown[] };

function createImportDb(existingCpfs: string[] = []) {
  const calls: DbCall[] = [];
  const createdCpfs = new Set<string>(existingCpfs);
  const createdCodigos = new Set<string>();

  const db = {
    prepare: (query: string) => ({
      bind: (...bindArgs: unknown[]) => {
        calls.push({ query, bindArgs });

        const normalizedQuery = query.replace(/\s+/g, ' ').trim();

        if (
          normalizedQuery.includes('SELECT cpf FROM funcionarios WHERE cpf IN') &&
          normalizedQuery.includes('empresa_id = ?')
        ) {
          const cpfs = bindArgs.slice(0, -1).map((v) => String(v));
          return {
            all: async () => ({
              results: cpfs.filter((cpf) => createdCpfs.has(cpf)).map((cpf) => ({ cpf })),
            }),
          };
        }

        if (
          normalizedQuery.includes(
            'SELECT UPPER(codigo) as codigo FROM qualificacoes_tipos WHERE UPPER(codigo) IN',
          ) &&
          normalizedQuery.includes('empresa_id = ?')
        ) {
          const codigos = bindArgs.slice(0, -1).map((v) => String(v).toUpperCase());
          return {
            all: async () => ({
              results: codigos
                .filter((codigo) => createdCodigos.has(codigo))
                .map((codigo) => ({ codigo })),
            }),
          };
        }

        if (
          normalizedQuery.includes('INSERT INTO funcionarios') &&
          normalizedQuery.includes('empresa_id')
        ) {
          for (let i = 0; i < bindArgs.length; i += 6) {
            createdCpfs.add(String(bindArgs[i + 2]));
          }
          return { run: async () => ({ success: true }) };
        }

        if (
          normalizedQuery.includes('INSERT INTO qualificacoes_tipos') &&
          normalizedQuery.includes('empresa_id')
        ) {
          for (let i = 0; i < bindArgs.length; i += 6) {
            createdCodigos.add(String(bindArgs[i]).toUpperCase());
          }
          return { run: async () => ({ success: true }) };
        }

        if (
          normalizedQuery.includes(
            'SELECT id, UPPER(codigo) as codigo, validade, vencimento_fim_mes',
          ) &&
          normalizedQuery.includes('empresa_id = ?')
        ) {
          const codigos = bindArgs.slice(0, -1).map((v) => String(v).toUpperCase());
          return {
            all: async () => ({
              results: codigos
                .filter((codigo) => createdCodigos.has(codigo))
                .map((codigo, idx) => ({
                  id: idx + 1,
                  codigo,
                  validade: null,
                  vencimento_fim_mes: 0,
                })),
            }),
          };
        }

        if (
          normalizedQuery.includes('INSERT INTO qualificacoes_historico') &&
          normalizedQuery.includes('empresa_id')
        ) {
          return { run: async () => ({ success: true }) };
        }

        if (normalizedQuery.includes('UPDATE qualificacoes_historico')) {
          return { run: async () => ({ success: true }) };
        }

        throw new Error(`Unhandled query in test: ${normalizedQuery}`);
      },
    }),
  } as unknown as D1Database;

  return { db, calls };
}

describe('QualificacaoHistoricoImportacaoService tenant scope', () => {
  it('valida funcionário no tenant, cria tipo e insere histórico no mesmo tenant', async () => {
    const { db, calls } = createImportDb(['12345678900']);
    const service = new QualificacaoHistoricoImportacaoService(db, 7);

    const result = await service.import(
      [
        {
          funcionario_cpf: '12345678900',
          qualificacao_codigo: 'CMA1',
          data_conclusao: '2026-01-15',
        },
      ],
      'INSERT',
      7,
    );

    expect(result.success).toBe(true);
    expect(result.inserted).toBe(1);

    const hasFuncionarioLookupTenant = calls.some(
      (call) =>
        call.query.includes('SELECT cpf FROM funcionarios') &&
        call.query.includes('empresa_id = ?') &&
        call.bindArgs.includes(7),
    );

    const hasTipoInsertTenant = calls.some(
      (call) =>
        call.query.includes('INSERT INTO qualificacoes_tipos') &&
        call.query.includes('empresa_id') &&
        call.bindArgs.includes(7),
    );

    const hasHistoricoInsertTenant = calls.some(
      (call) =>
        call.query.includes('INSERT INTO qualificacoes_historico') &&
        call.query.includes('empresa_id') &&
        call.bindArgs.includes(7),
    );

    expect(hasFuncionarioLookupTenant).toBe(true);
    expect(calls.some((call) => call.query.includes('INSERT INTO funcionarios'))).toBe(false);
    expect(hasTipoInsertTenant).toBe(true);
    expect(hasHistoricoInsertTenant).toBe(true);
  });

  it('rejeita CPF inexistente sem criar funcionário fantasma', async () => {
    const { db, calls } = createImportDb();
    const service = new QualificacaoHistoricoImportacaoService(db, 7);

    const result = await service.import(
      [
        {
          funcionario_cpf: '12345678900',
          qualificacao_codigo: 'CMA1',
          data_conclusao: '2026-01-15',
        },
      ],
      'INSERT',
      7,
    );

    expect(result.success).toBe(false);
    expect(result.inserted).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(calls.some((call) => call.query.includes('INSERT INTO funcionarios'))).toBe(false);
    expect(calls.some((call) => call.query.includes('INSERT INTO qualificacoes_historico'))).toBe(
      false,
    );
  });

  it('falha em modo fail-closed sem tenant', async () => {
    const { db } = createImportDb();
    const service = new QualificacaoHistoricoImportacaoService(db);

    await expect(
      service.list(
        {
          limit: 10,
          offset: 0,
        },
        0,
      ),
    ).rejects.toThrow('TENANT_CONTEXT_REQUIRED');
  });
});
