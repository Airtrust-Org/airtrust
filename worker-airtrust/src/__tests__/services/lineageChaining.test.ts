/**
 * chainQualificationLineageForGroup(s) — encadeamento fail-closed para
 * importadores identificados por (empresa, cpf, código), não funcionario_id.
 * Executa contra SQLite real (node:sqlite), não mocks.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  chainQualificationLineageForGroup,
  chainQualificationLineageForGroups,
  chainQualificationLineageForFuncionarioGroup,
  chainQualificationLineageForFuncionarioGroups,
} from '../../services/importacao/lineageChaining';

let sqlite: SqliteD1Database;

beforeEach(() => {
  sqlite = new SqliteD1Database();
  sqlite.database.exec('ALTER TABLE qualificacoes_historico ADD COLUMN funcionario_cpf TEXT');
});

afterEach(() => {
  sqlite.close();
});

function insertRow(params: {
  id: number;
  empresaId: number;
  cpf: string;
  codigo: string;
  dataConclusao: string;
  status?: string | null;
  renovada?: number;
  renovacaoDe?: number | null;
}) {
  // Os importadores baseados em cpf (o alvo deste helper) nunca preenchem
  // funcionario_id de verdade; o helper de schema compartilhado exige
  // NOT NULL, então usamos o próprio id da linha como valor distinto e
  // irrelevante — o helper de lineage nunca filtra por funcionario_id.
  sqlite.database
    .prepare(
      `INSERT INTO qualificacoes_historico
         (id, empresa_id, funcionario_id, funcionario_cpf, qualificacao_codigo, data_conclusao, status, renovada, renovacao_de)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.id,
      params.empresaId,
      params.id,
      params.cpf,
      params.codigo,
      params.dataConclusao,
      params.status ?? null,
      params.renovada ?? 0,
      params.renovacaoDe ?? null,
    );
}

function getRow(id: number) {
  return sqlite.database.prepare('SELECT * FROM qualificacoes_historico WHERE id = ?').get(id) as Record<
    string,
    unknown
  >;
}

describe('chainQualificationLineageForGroup — encadeamento fail-closed por (empresa, cpf, código)', () => {
  it('duas conclusões cronológicas: encadeia a mais nova ao renovacao_de da mais antiga e marca a antiga RENOVADA', async () => {
    insertRow({ id: 1, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2023-01-10' });
    insertRow({ id: 2, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2024-01-10' });

    const result = await chainQualificationLineageForGroup(sqlite.asD1(), {
      empresaId: 1,
      funcionarioCpf: '111',
      qualificacaoCodigo: 'CMA',
    });

    expect(result.chained).toBe(true);
    expect(result.rowsLinked).toBe(1);
    expect(getRow(2).renovacao_de).toBe(1);
    const predecessor = getRow(1);
    expect(predecessor.status).toBe('RENOVADA');
    expect(predecessor.renovada).toBe(1);
  });

  it('três conclusões cronológicas: encadeia toda a sequência (A<-B<-C), não apenas a última ao primeiro', async () => {
    insertRow({ id: 1, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2022-01-10' });
    insertRow({ id: 2, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2023-01-10' });
    insertRow({ id: 3, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2024-01-10' });

    await chainQualificationLineageForGroup(sqlite.asD1(), {
      empresaId: 1,
      funcionarioCpf: '111',
      qualificacaoCodigo: 'CMA',
    });

    expect(getRow(2).renovacao_de).toBe(1);
    expect(getRow(3).renovacao_de).toBe(2);
    expect(getRow(1).status).toBe('RENOVADA');
    expect(getRow(2).status).toBe('RENOVADA');
    expect(getRow(3).status).toBeNull(); // mais recente, nunca renovada
  });

  it('empate de data_conclusao: FAIL CLOSED — nenhum encadeamento aplicado ao grupo inteiro', async () => {
    insertRow({ id: 1, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2023-01-10' });
    insertRow({ id: 2, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2023-01-10' }); // mesma data
    insertRow({ id: 3, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2024-01-10' });

    const result = await chainQualificationLineageForGroup(sqlite.asD1(), {
      empresaId: 1,
      funcionarioCpf: '111',
      qualificacaoCodigo: 'CMA',
    });

    expect(result.chained).toBe(false);
    expect(result.reason).toBe('AMBIGUOUS_DATES');
    // Nenhuma linha tocada — nem sequer as não-ambíguas do grupo.
    expect(getRow(1).renovacao_de).toBeNull();
    expect(getRow(2).renovacao_de).toBeNull();
    expect(getRow(3).renovacao_de).toBeNull();
    expect(getRow(1).status).toBeNull();
  });

  it('retroatividade: linha futura nunca é escolhida como predecessor de uma linha mais antiga', async () => {
    insertRow({ id: 1, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2030-01-10' }); // futuro
    insertRow({ id: 2, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2024-01-10' }); // retroativo

    await chainQualificationLineageForGroup(sqlite.asD1(), {
      empresaId: 1,
      funcionarioCpf: '111',
      qualificacaoCodigo: 'CMA',
    });

    // Ordenado por data: id=2 (2024) é o predecessor real, id=1 (2030) o sucessor.
    expect(getRow(1).renovacao_de).toBe(2);
    expect(getRow(2).status).toBe('RENOVADA');
  });

  it('idempotente: rodar duas vezes sobre o mesmo grupo não duplica nem regride o estado', async () => {
    insertRow({ id: 1, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2023-01-10' });
    insertRow({ id: 2, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2024-01-10' });

    await chainQualificationLineageForGroup(sqlite.asD1(), {
      empresaId: 1,
      funcionarioCpf: '111',
      qualificacaoCodigo: 'CMA',
    });
    const secondRun = await chainQualificationLineageForGroup(sqlite.asD1(), {
      empresaId: 1,
      funcionarioCpf: '111',
      qualificacaoCodigo: 'CMA',
    });

    expect(secondRun.rowsLinked).toBe(0); // já estava correto, nada a mudar
    expect(getRow(2).renovacao_de).toBe(1);
    expect(getRow(1).status).toBe('RENOVADA');
  });

  it('tenant A/B: grupos de tenants diferentes com o mesmo cpf/código nunca se cruzam', async () => {
    insertRow({ id: 1, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2023-01-10' });
    insertRow({ id: 2, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2024-01-10' });
    insertRow({ id: 3, empresaId: 2, cpf: '111', codigo: 'CMA', dataConclusao: '2022-01-10' }); // outro tenant, mesmo cpf

    await chainQualificationLineageForGroup(sqlite.asD1(), {
      empresaId: 1,
      funcionarioCpf: '111',
      qualificacaoCodigo: 'CMA',
    });

    expect(getRow(2).renovacao_de).toBe(1); // não 3, que é de outro tenant
    expect(getRow(3).renovacao_de).toBeNull();
    expect(getRow(3).status).toBeNull();
  });

  it('uma única linha no grupo: não há o que encadear, sem erro', async () => {
    insertRow({ id: 1, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2023-01-10' });

    const result = await chainQualificationLineageForGroup(sqlite.asD1(), {
      empresaId: 1,
      funcionarioCpf: '111',
      qualificacaoCodigo: 'CMA',
    });

    expect(result.chained).toBe(false);
    expect(result.reason).toBe('SINGLE_OR_NO_ROW');
  });

  it('chainQualificationLineageForGroups: deduplica grupos repetidos e processa cada par cpf+código uma única vez', async () => {
    insertRow({ id: 1, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2023-01-10' });
    insertRow({ id: 2, empresaId: 1, cpf: '111', codigo: 'CMA', dataConclusao: '2024-01-10' });
    insertRow({ id: 3, empresaId: 1, cpf: '222', codigo: 'ASO', dataConclusao: '2023-06-01' });
    insertRow({ id: 4, empresaId: 1, cpf: '222', codigo: 'ASO', dataConclusao: '2024-06-01' });

    const results = await chainQualificationLineageForGroups(sqlite.asD1(), 1, [
      { funcionarioCpf: '111', qualificacaoCodigo: 'CMA' },
      { funcionarioCpf: '111', qualificacaoCodigo: 'cma' }, // mesmo grupo, case diferente
      { funcionarioCpf: '222', qualificacaoCodigo: 'ASO' },
    ]);

    expect(results).toHaveLength(2); // deduplicado
    expect(getRow(2).renovacao_de).toBe(1);
    expect(getRow(4).renovacao_de).toBe(3);
  });
});

describe('chainQualificationLineageForFuncionarioGroup(s) — variante funcionario_id (importacao-xlsx.ts)', () => {
  function insertByFuncionarioId(params: {
    id: number;
    empresaId: number;
    funcionarioId: number;
    qualificacaoId: number;
    dataConclusao: string;
  }) {
    sqlite.database
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, data_conclusao)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(params.id, params.empresaId, params.funcionarioId, params.qualificacaoId, params.dataConclusao);
  }

  it('encadeia duas conclusões do mesmo funcionario_id + qualificacao_id', async () => {
    insertByFuncionarioId({ id: 10, empresaId: 1, funcionarioId: 1000, qualificacaoId: 100, dataConclusao: '2023-01-10' });
    insertByFuncionarioId({ id: 11, empresaId: 1, funcionarioId: 1000, qualificacaoId: 100, dataConclusao: '2024-01-10' });

    const result = await chainQualificationLineageForFuncionarioGroup(sqlite.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificacaoId: 100,
    });

    expect(result.chained).toBe(true);
    const successor = sqlite.database.prepare('SELECT renovacao_de FROM qualificacoes_historico WHERE id = 11').get() as Record<string, unknown>;
    expect(successor.renovacao_de).toBe(10);
    const predecessor = sqlite.database.prepare('SELECT status FROM qualificacoes_historico WHERE id = 10').get() as Record<string, unknown>;
    expect(predecessor.status).toBe('RENOVADA');
  });

  it('fail-closed em empate de data_conclusao para o mesmo funcionario_id + qualificacao_id', async () => {
    insertByFuncionarioId({ id: 10, empresaId: 1, funcionarioId: 1000, qualificacaoId: 100, dataConclusao: '2024-01-10' });
    insertByFuncionarioId({ id: 11, empresaId: 1, funcionarioId: 1000, qualificacaoId: 100, dataConclusao: '2024-01-10' });

    const result = await chainQualificationLineageForFuncionarioGroup(sqlite.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificacaoId: 100,
    });

    expect(result.chained).toBe(false);
    expect(result.reason).toBe('AMBIGUOUS_DATES');
  });

  it('chainQualificationLineageForFuncionarioGroups deduplica grupos repetidos', async () => {
    insertByFuncionarioId({ id: 10, empresaId: 1, funcionarioId: 1000, qualificacaoId: 100, dataConclusao: '2023-01-10' });
    insertByFuncionarioId({ id: 11, empresaId: 1, funcionarioId: 1000, qualificacaoId: 100, dataConclusao: '2024-01-10' });

    const results = await chainQualificationLineageForFuncionarioGroups(sqlite.asD1(), 1, [
      { funcionarioId: 1000, qualificacaoId: 100 },
      { funcionarioId: 1000, qualificacaoId: 100 },
    ]);

    expect(results).toHaveLength(1);
    const successor = sqlite.database.prepare('SELECT renovacao_de FROM qualificacoes_historico WHERE id = 11').get() as Record<string, unknown>;
    expect(successor.renovacao_de).toBe(10);
  });
});
