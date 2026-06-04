import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type TableColumn = {
  name: string;
};

type IndexRow = {
  name: string;
};

const prohibitedPatterns = [
  /\bDROP\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bINSERT\b/i,
  /\bREPLACE\b/i,
  /\bUPSERT\b/i,
];

describe('migration 0386 solicitacoes_treinamento planejado link schema', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-sol-trein-link-'));
  const databasePath = join(tempDir, 'schema.sqlite');
  const testDir = dirname(fileURLToPath(import.meta.url));
  const baseSchemaSql = readFileSync(
    join(testDir, '../../../migrations/0280_create_solicitacoes_treinamento.sql'),
    'utf8',
  );
  const lmsLinkSql = readFileSync(
    join(testDir, '../../../migrations/0345_solicitacoes_treinamento_lms_link.sql'),
    'utf8',
  );
  const migrationSql = readFileSync(
    join(testDir, '../../../migrations/0386_solicitacoes_treinamento_planejado_link.sql'),
    'utf8',
  );

  function sqlite(sql: string): string {
    const result = spawnSync('sqlite3', [databasePath], {
      input: sql,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }

  function queryJson<T>(sql: string): T[] {
    const result = spawnSync('sqlite3', ['-json', databasePath, sql], {
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
  }

  beforeAll(() => {
    sqlite(`
      ${baseSchemaSql}
      ${lmsLinkSql}
      ${migrationSql}
    `);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps the base solicitacoes_treinamento table and adds the planned-link columns', () => {
    const tables = queryJson<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'solicitacoes_treinamento';",
    );
    const columns = queryJson<TableColumn>('PRAGMA table_info(solicitacoes_treinamento);');
    const names = columns.map(({ name }) => name);

    expect(tables.map(({ name }) => name)).toEqual(['solicitacoes_treinamento']);
    expect(names).toContain('treinamento_planejado_id');
    expect(names).toContain('status_pre_agendamento');
  });

  it('creates the idx_solicitacoes_treinamento_planejado index', () => {
    const indexes = queryJson<IndexRow>('PRAGMA index_list(solicitacoes_treinamento);');

    expect(indexes.map(({ name }) => name)).toContain('idx_solicitacoes_treinamento_planejado');
  });

  it('keeps legacy inserts working without the new columns', () => {
    sqlite(`
      INSERT INTO solicitacoes_treinamento (
        id, empresa_id, solicitante_id, qualificacao_id, tipo_treinamento, titulo, status, prioridade
      ) VALUES (
        'legacy-row', 1, 10, 20, 'RECORRENTE', 'Legacy insert', 'SOLICITADA', 'NORMAL'
      );
    `);

    const [row] = queryJson<{
      id: string;
      treinamento_planejado_id: number | null;
      status_pre_agendamento: string | null;
    }>(
      `SELECT id, treinamento_planejado_id, status_pre_agendamento
         FROM solicitacoes_treinamento
        WHERE id = 'legacy-row';`,
    );

    expect(row).toEqual({
      id: 'legacy-row',
      treinamento_planejado_id: null,
      status_pre_agendamento: null,
    });
  });

  it('accepts inserts that use the new columns', () => {
    sqlite(`
      INSERT INTO solicitacoes_treinamento (
        id, empresa_id, solicitante_id, qualificacao_id, tipo_treinamento, titulo, status, prioridade,
        treinamento_planejado_id, status_pre_agendamento
      ) VALUES (
        'new-row', 1, 11, 21, 'RECORRENTE', 'Linked insert', 'AGENDADA', 'NORMAL',
        77, 'APROVADA_OPS'
      );
    `);

    const [row] = queryJson<{
      id: string;
      treinamento_planejado_id: number;
      status_pre_agendamento: string;
    }>(
      `SELECT id, treinamento_planejado_id, status_pre_agendamento
         FROM solicitacoes_treinamento
        WHERE id = 'new-row';`,
    );

    expect(row).toEqual({
      id: 'new-row',
      treinamento_planejado_id: 77,
      status_pre_agendamento: 'APROVADA_OPS',
    });
  });

  it('does not contain destructive or data-changing statements', () => {
    for (const pattern of prohibitedPatterns) {
      expect(migrationSql).not.toMatch(pattern);
    }
  });
});
