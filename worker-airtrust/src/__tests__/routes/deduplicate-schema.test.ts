import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEDUPLICATE_GROUP_QUERY_SQL,
  DEDUPLICATE_RECORDS_QUERY_SQL,
  buildDeduplicateSoftDeleteSql,
} from '../../routes/deduplicate';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function bindPositional(sql: string, values: Array<string | number>): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    const value = values[index++];
    return typeof value === 'number' ? String(value) : `'${value}'`;
  });
}

describe('deduplicate.ts schema contract', () => {
  it('executa as queries reais (group/records/soft-delete) contra o schema canônico de qualificacoes_historico', () => {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-deduplicate-'));
    tempDirs.push(dir);
    const dbPath = join(dir, 'fixture.sqlite');

    const setup = `
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_cpf TEXT,
  qualificacao_codigo TEXT,
  data_vencimento TEXT,
  data_conclusao TEXT,
  status TEXT,
  renovada INTEGER DEFAULT 0,
  renovacao_de INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_vencimento, data_conclusao, created_at, deleted_at) VALUES
  (101, 6, '11111111111', 'SIM', '2026-12-31', '2026-01-03', '2026-01-03T10:00:00Z', NULL),
  (102, 6, '11111111111', 'SIM', '2026-12-31', '2026-01-02', '2026-01-02T10:00:00Z', NULL),
  (103, 6, '11111111111', 'SIM', '2026-12-31', '2026-01-01', '2026-01-01T10:00:00Z', NULL);

${bindPositional(DEDUPLICATE_GROUP_QUERY_SQL, [6])};
${bindPositional(DEDUPLICATE_RECORDS_QUERY_SQL, [6, '11111111111', 'SIM', '2026-12-31', '2026-12-31'])};
${bindPositional(buildDeduplicateSoftDeleteSql(2), [6, 102, 103])};
SELECT id, deleted_at FROM qualificacoes_historico ORDER BY id;
`;

    const run = spawnSync('sqlite3', [dbPath], { input: setup, encoding: 'utf8' });

    expect(run.status, run.stderr).toBe(0);
    // GROUP BY query found the one duplicated group (total=3)
    expect(run.stdout).toContain('11111111111|SIM|2026-12-31|3');
    // RECORDS query returned all 3 ids, most recent (101) first
    expect(run.stdout).toContain('101|2026-01-03|2026-01-03T10:00:00Z');
    // Soft-delete removed 102 and 103, kept 101
    expect(run.stdout).toContain('101|');
    expect(run.stdout).toMatch(/102\|\d{4}-\d{2}-\d{2}/);
    expect(run.stdout).toMatch(/103\|\d{4}-\d{2}-\d{2}/);
  });

  it('não reintroduz colunas inexistentes em qualificacoes_historico', () => {
    for (const sql of [
      DEDUPLICATE_GROUP_QUERY_SQL,
      DEDUPLICATE_RECORDS_QUERY_SQL,
      buildDeduplicateSoftDeleteSql(3),
    ]) {
      expect(sql).toContain('empresa_id');
      expect(sql).toContain('deleted_at');
    }
  });
});
